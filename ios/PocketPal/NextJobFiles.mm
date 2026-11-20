#import "NextJobFiles.h"
#import <Vision/Vision.h>
#import <ImageIO/ImageIO.h>
#import <PDFKit/PDFKit.h>
#import <zlib.h>

static id NJFail(NSError **error, NSString *message) {
  if (error) *error = [NSError errorWithDomain:@"NextJob" code:1
    userInfo:@{NSLocalizedDescriptionKey: message}];
  return nil;
}

NSURL *NJLocalURL(NSString *uri) {
  NSURL *url = [uri hasPrefix:@"/"] ? [NSURL fileURLWithPath:uri] : [NSURL URLWithString:uri];
  return url.isFileURL ? url : nil;
}

static NSData *NJRead(NSString *uri, NSError **error) {
  NSURL *url = NJLocalURL(uri);
  if (!url) return NJFail(error, @"请从相册或文件中选择本机附件。");
  BOOL scoped = [url startAccessingSecurityScopedResource];
  NSNumber *size = nil;
  [url getResourceValue:&size forKey:NSURLFileSizeKey error:error];
  NSData *data = nil;
  if (!size || size.unsignedLongLongValue > 10 * 1024 * 1024) {
    NJFail(error, @"请选择 10 MB 以内的附件。");
  } else {
    data = [NSData dataWithContentsOfURL:url options:0 error:error];
    if (data.length > 10 * 1024 * 1024) data = NJFail(error, @"附件超过 10 MB。");
  }
  if (scoped) [url stopAccessingSecurityScopedResource];
  return data;
}

NSString *NJRecognizeImage(NSString *uri, NSError **error) {
  NSData *data = NJRead(uri, error);
  if (!data) return nil;
  CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
  if (!source) return NJFail(error, @"图片无法读取，请换一张清晰截图。");
  NSDictionary *options = @{
    (id)kCGImageSourceCreateThumbnailFromImageAlways: @YES,
    (id)kCGImageSourceCreateThumbnailWithTransform: @YES,
    (id)kCGImageSourceThumbnailMaxPixelSize: @2400
  };
  CGImageRef image = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
  CFRelease(source);
  if (!image) return NJFail(error, @"图片无法解码，请重新选择。");
  VNRecognizeTextRequest *request = [VNRecognizeTextRequest new];
  request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
  request.recognitionLanguages = @[@"zh-Hans", @"en-US"];
  request.usesLanguageCorrection = YES;
  VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
  BOOL success = [handler performRequests:@[request] error:error];
  CGImageRelease(image);
  if (!success) return nil;
  NSMutableArray<NSString *> *lines = [NSMutableArray new];
  for (VNRecognizedTextObservation *observation in request.results) {
    NSString *line = [observation topCandidates:1].firstObject.string;
    if (line.length) [lines addObject:line];
  }
  NSString *text = [lines componentsJoinedByString:@"\n"];
  if (!text.length) return NJFail(error, @"没识别到文字，请换一张清晰截图或粘贴文字。");
  return [text substringToIndex:MIN(text.length, 10000)];
}

// Only read the bounded Word body; no ZIP member is extracted to the filesystem.
static uint16_t NJ16(const uint8_t *p) { return p[0] | (p[1] << 8); }
static uint32_t NJ32(const uint8_t *p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static NSData *NJWordBody(NSData *zip, NSError **error) {
  const uint8_t *b = (const uint8_t *)zip.bytes;
  NSUInteger n = zip.length;
  if (n < 22) return NJFail(error, @"DOCX 文件不完整。");
  NSInteger eocd = -1;
  for (NSInteger i = (NSInteger)n - 22; i >= MAX(0, (NSInteger)n - 65557); i--) {
    if (NJ32(b + i) == 0x06054b50 && i + 22 + NJ16(b + i + 20) == n) { eocd = i; break; }
  }
  if (eocd < 0 || NJ16(b + eocd + 4) || NJ16(b + eocd + 6))
    return NJFail(error, @"不支持此 DOCX，请另存为普通 DOCX 或 PDF。");
  NSUInteger at = NJ32(b + eocd + 16);
  NSUInteger total = NJ16(b + eocd + 10);
  for (NSUInteger i = 0; i < total; i++) {
    if (at + 46 > n || NJ32(b + at) != 0x02014b50) break;
    NSUInteger nameLength = NJ16(b + at + 28);
    NSUInteger next = at + 46 + nameLength + NJ16(b + at + 30) + NJ16(b + at + 32);
    if (next > n) break;
    NSString *name = [[NSString alloc] initWithBytes:b + at + 46 length:nameLength encoding:NSUTF8StringEncoding];
    if ([name isEqualToString:@"word/document.xml"]) {
      NSUInteger compressed = NJ32(b + at + 20), expanded = NJ32(b + at + 24);
      NSUInteger local = NJ32(b + at + 42);
      uint16_t method = NJ16(b + at + 10);
      if ((NJ16(b + at + 8) & 1) || expanded > 2 * 1024 * 1024 || !expanded ||
          local + 30 > n || NJ32(b + local) != 0x04034b50)
        return NJFail(error, @"Word 正文过大、加密或损坏，请另存为 PDF。");
      NSUInteger start = local + 30 + NJ16(b + local + 26) + NJ16(b + local + 28);
      if (start > n || compressed > n - start) break;
      NSMutableData *out = [NSMutableData dataWithLength:expanded];
      if (method == 0 && compressed == expanded) {
        memcpy(out.mutableBytes, b + start, expanded);
      } else if (method == 8) {
        z_stream stream = {};
        stream.next_in = (Bytef *)(b + start); stream.avail_in = (uInt)compressed;
        stream.next_out = (Bytef *)out.mutableBytes; stream.avail_out = (uInt)expanded;
        if (inflateInit2(&stream, -MAX_WBITS) != Z_OK) break;
        int status = inflate(&stream, Z_FINISH);
        BOOL valid = status == Z_STREAM_END && stream.total_out == expanded;
        inflateEnd(&stream);
        if (!valid) break;
      } else break;
      if (crc32(0, (const Bytef *)out.bytes, (uInt)out.length) != NJ32(b + at + 16)) break;
      return out;
    }
    at = next;
  }
  return NJFail(error, @"无法读取 Word 正文，请另存为 DOCX、PDF 或 TXT。");
}

@interface NJWordParser : NSObject <NSXMLParserDelegate>
@property(nonatomic, strong) NSMutableString *text;
@property(nonatomic) BOOL inText;
@end
@implementation NJWordParser
- (instancetype)init { if ((self = [super init])) _text = [NSMutableString new]; return self; }
- (void)parser:(NSXMLParser *)parser didStartElement:(NSString *)element namespaceURI:(NSString *)uri qualifiedName:(NSString *)qualified attributes:(NSDictionary *)attributes {
  if ([element isEqualToString:@"t"]) self.inText = YES;
  if ([element isEqualToString:@"tab"]) [self.text appendString:@"\t"];
  if ([element isEqualToString:@"br"]) [self.text appendString:@"\n"];
}
- (void)parser:(NSXMLParser *)parser foundCharacters:(NSString *)text { if (self.inText) [self.text appendString:text]; }
- (void)parser:(NSXMLParser *)parser didEndElement:(NSString *)element namespaceURI:(NSString *)uri qualifiedName:(NSString *)qualified {
  if ([element isEqualToString:@"t"]) self.inText = NO;
  if ([element isEqualToString:@"p"]) [self.text appendString:@"\n"];
}
@end

NSString *NJReadDocument(NSString *uri, NSString *name, NSError **error) {
  NSData *data = NJRead(uri, error);
  if (!data) return nil;
  NSString *extension = name.pathExtension.lowercaseString;
  NSString *text = nil;
  if ([extension isEqualToString:@"txt"] || [extension isEqualToString:@"md"]) {
    text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (!text) text = [[NSString alloc] initWithData:data encoding:NSUnicodeStringEncoding];
  } else if ([extension isEqualToString:@"pdf"]) {
    PDFDocument *document = [[PDFDocument alloc] initWithData:data];
    if (!document) return NJFail(error, @"PDF 无法读取。");
    if (document.isLocked) return NJFail(error, @"请先移除 PDF 密码。");
    if (document.pageCount > 30) return NJFail(error, @"请上传不超过 30 页的文件。");
    text = document.string;
  } else if ([extension isEqualToString:@"docx"]) {
    NSData *body = NJWordBody(data, error);
    if (!body) return nil;
    NSString *xml = [[NSString alloc] initWithData:body encoding:NSUTF8StringEncoding];
    if (!xml || [xml rangeOfString:@"<!DOCTYPE" options:NSCaseInsensitiveSearch].location != NSNotFound)
      return NJFail(error, @"不支持此 Word 文档格式。");
    NSXMLParser *parser = [[NSXMLParser alloc] initWithData:body];
    NJWordParser *delegate = [NJWordParser new];
    parser.shouldProcessNamespaces = YES;
    parser.shouldResolveExternalEntities = NO;
    parser.delegate = delegate;
    if (![parser parse]) return NJFail(error, @"Word 正文损坏，请另存为 PDF。");
    text = delegate.text;
  } else return NJFail(error, @"支持 PDF、DOCX、TXT；旧版 DOC 请先另存为 DOCX。");
  text = [text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if (!text.length) return NJFail(error, @"没有读到正文。扫描版 PDF 请转成截图上传。");
  if (text.length > 12000) text = [[text substringToIndex:12000] stringByAppendingString:@"\n【仅提取前 12000 字，请分段发送】"];
  return text;
}
