#import <PocketPalSpecs/PocketPalSpecs.h>
#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import "NextJobFiles.h"

static NSString *NJJSON(id value) {
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"{}";
}
static NSURL *NJFolder(NSString *name, BOOL cache) {
  NSURL *root = [NSFileManager.defaultManager URLsForDirectory:cache ? NSCachesDirectory : NSDocumentDirectory
                                                  inDomains:NSUserDomainMask].firstObject;
  NSURL *url = [root URLByAppendingPathComponent:name isDirectory:YES];
  [NSFileManager.defaultManager createDirectoryAtURL:url withIntermediateDirectories:YES
    attributes:@{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication} error:nil];
  return url;
}

@interface NJComposer : NSObject <UIDropInteractionDelegate, UITextPasteDelegate>
@property(nonatomic) double tag;
@property(nonatomic) BOOL active;
@property(nonatomic, weak) UITextView *input;
@property(nonatomic, weak) id<UITextPasteDelegate> previousPaste;
@property(nonatomic, strong) UIPasteConfiguration *previousConfig;
@property(nonatomic, strong) NSMutableArray<UIDropInteraction *> *drops;
@property(nonatomic, copy) void (^event)(NSString *, NSString *);
- (void)accept:(NSArray<NSItemProvider *> *)providers;
- (void)detach;
@end

@implementation NJComposer
- (instancetype)init {
  if ((self = [super init])) { _active = YES; _drops = [NSMutableArray new]; }
  return self;
}
- (void)detach {
  self.active = NO;
  if (self.input.pasteDelegate == self) {
    self.input.pasteDelegate = self.previousPaste;
    self.input.pasteConfiguration = self.previousConfig;
  }
  for (UIDropInteraction *drop in self.drops) [drop.view removeInteraction:drop];
  [self.drops removeAllObjects];
}
- (void)accept:(NSArray<NSItemProvider *> *)providers {
  if (!self.active) return;
  if (providers.count > 10) { self.event(@"error", @"一次最多接收 10 个附件。"); return; }
  self.event(@"start", @"");
  dispatch_group_t group = dispatch_group_create();
  NSMutableArray *entries = [NSMutableArray new];
  __block NSString *failure = nil;
  for (NSItemProvider *provider in providers) {
    dispatch_group_enter(group);
    void (^finish)(NSDictionary *, NSString *) = ^(NSDictionary *entry, NSString *error) {
      @synchronized (entries) {
        if (entry) [entries addObject:entry];
        if (error) failure = error;
      }
      dispatch_group_leave(group);
    };
    if ([provider canLoadObjectOfClass:UIImage.class]) {
      [provider loadObjectOfClass:UIImage.class completionHandler:^(__kindof id<NSItemProviderReading> object, NSError *error) {
        UIImage *image = (UIImage *)object;
        if (!image) { finish(nil, @"图片读取失败，请使用“传截图”。"); return; }
        // Downsample before writing, keeping large screenshots bounded.
        CGFloat ratio = MIN(1, 2400 / MAX(image.size.width, image.size.height));
        UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat defaultFormat];
        format.scale = 1;
        CGSize size = CGSizeMake(MAX(1, image.size.width * ratio), MAX(1, image.size.height * ratio));
        UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:size format:format];
        NSData *data = [renderer JPEGDataWithCompressionQuality:0.95 actions:^(UIGraphicsImageRendererContext *context) {
          [image drawInRect:(CGRect){CGPointZero, size}];
        }];
        NSURL *url = [NJFolder(@"nextjob-paste", YES) URLByAppendingPathComponent:[NSUUID.UUID.UUIDString stringByAppendingString:@".jpg"]];
        if (data.length > 10 * 1024 * 1024 || ![data writeToURL:url options:NSDataWritingAtomic error:nil]) {
          finish(nil, @"图片过大或无法保存。"); return;
        }
        finish(@{@"uri":url.absoluteString, @"name":@"粘贴截图.jpg", @"image":@YES}, nil);
      }];
    } else {
      NSString *type = nil;
      for (NSString *candidate in provider.registeredTypeIdentifiers) {
        UTType *value = [UTType typeWithIdentifier:candidate];
        if ([value conformsToType:UTTypePDF] ||
            [candidate isEqualToString:@"org.openxmlformats.wordprocessingml.document"] ||
            [value conformsToType:UTTypeFileURL]) { type = candidate; break; }
      }
      if (type) {
        void (^copyFile)(NSURL *, NSError *) = ^(NSURL *source, NSError *error) {
          BOOL scoped = [source startAccessingSecurityScopedResource];
          NSNumber *bytes = nil;
          [source getResourceValue:&bytes forKey:NSURLFileSizeKey error:nil];
          if (!source.isFileURL || !bytes || bytes.unsignedLongLongValue > 10 * 1024 * 1024) {
            if (scoped) [source stopAccessingSecurityScopedResource];
            finish(nil, @"文件读取失败或超过 10 MB，请使用“传文件”。"); return;
          }
          NSString *name = provider.suggestedName.lastPathComponent ?: source.lastPathComponent;
          if (!name.pathExtension.length) name = [name stringByAppendingPathExtension:source.pathExtension];
          NSURL *url = [NJFolder(@"nextjob-paste", YES) URLByAppendingPathComponent:
            [NSString stringWithFormat:@"%@-%@", NSUUID.UUID.UUIDString, name]];
          if (![NSFileManager.defaultManager copyItemAtURL:source toURL:url error:nil]) {
            if (scoped) [source stopAccessingSecurityScopedResource];
            finish(nil, @"文件保存失败，请重新选择。"); return;
          }
          if (scoped) [source stopAccessingSecurityScopedResource];
          finish(@{@"uri":url.absoluteString, @"name":name, @"image":@NO}, nil);
        };
        if ([type isEqualToString:UTTypeFileURL.identifier] && [provider canLoadObjectOfClass:NSURL.class]) {
          [provider loadObjectOfClass:NSURL.class completionHandler:^(__kindof id<NSItemProviderReading> object, NSError *error) {
            copyFile((NSURL *)object, error);
          }];
        } else [provider loadFileRepresentationForTypeIdentifier:type completionHandler:copyFile];
      } else if ([provider canLoadObjectOfClass:NSString.class]) {
        [provider loadObjectOfClass:NSString.class completionHandler:^(__kindof id<NSItemProviderReading> object, NSError *error) {
          NSString *text = (NSString *)object;
          finish(text.length ? @{@"text":[text substringToIndex:MIN(text.length, 12000)]} : nil, nil);
        }];
      } else finish(nil, @"支持截图、PDF、DOCX 和文字，请使用“传文件”选择其他附件。");
    }
  }
  dispatch_group_notify(group, dispatch_get_main_queue(), ^{
    if (!self.active) return;
    if (entries.count) self.event(@"ready", NJJSON(entries));
    if (failure || !entries.count) self.event(@"error", failure ?: @"剪贴板里没有可读取的图片、文字或文件。");
  });
}
- (void)textPasteConfigurationSupporting:(id<UITextPasteConfigurationSupporting>)supporting transformPasteItem:(id<UITextPasteItem>)item {
  NSItemProvider *provider = item.itemProvider;
  if ([provider canLoadObjectOfClass:UIImage.class] ||
      [provider hasItemConformingToTypeIdentifier:UTTypeFileURL.identifier] ||
      [provider hasItemConformingToTypeIdentifier:UTTypePDF.identifier] ||
      [provider hasItemConformingToTypeIdentifier:@"org.openxmlformats.wordprocessingml.document"]) {
    [self accept:@[provider]];
    [item setNoResult];
  } else [item setDefaultResult];
}
- (BOOL)dropInteraction:(UIDropInteraction *)interaction canHandleSession:(id<UIDropSession>)session {
  return self.active && [session hasItemsConformingToTypeIdentifiers:@[UTTypeImage.identifier, UTTypePDF.identifier,
    UTTypePlainText.identifier, UTTypeFileURL.identifier, @"org.openxmlformats.wordprocessingml.document"]];
}
- (void)dropInteraction:(UIDropInteraction *)interaction sessionDidEnter:(id<UIDropSession>)session { self.event(@"hover", @"enter"); }
- (void)dropInteraction:(UIDropInteraction *)interaction sessionDidExit:(id<UIDropSession>)session { self.event(@"hover", @"exit"); }
- (void)dropInteraction:(UIDropInteraction *)interaction sessionDidEnd:(id<UIDropSession>)session { self.event(@"hover", @"exit"); }
- (UIDropProposal *)dropInteraction:(UIDropInteraction *)interaction sessionDidUpdate:(id<UIDropSession>)session {
  return [[UIDropProposal alloc] initWithDropOperation:UIDropOperationCopy];
}
- (void)dropInteraction:(UIDropInteraction *)interaction performDrop:(id<UIDropSession>)session {
  NSMutableArray *providers = [NSMutableArray new];
  for (UIDragItem *item in session.items) [providers addObject:item.itemProvider];
  [self accept:providers];
}
@end

static UITextView *NJTextView(UIView *view) {
  if ([view isKindOfClass:UITextView.class]) return (UITextView *)view;
  for (UIView *child in view.subviews) { UITextView *found = NJTextView(child); if (found) return found; }
  return nil;
}

@interface NextJobModule : NativeNextJobSpecBase <NativeNextJobSpec, AVAudioRecorderDelegate, AVSpeechSynthesizerDelegate>
@property(nonatomic, weak) RCTViewRegistry *viewRegistry_DEPRECATED;
@property(nonatomic, strong) NSMutableDictionary<NSNumber *, NJComposer *> *composers;
@property(nonatomic, strong) AVAudioRecorder *recorder;
@property(nonatomic, strong) NSMutableDictionary *state;
@property(nonatomic, strong) AVSpeechSynthesizer *speaker;
@property(nonatomic, strong) AVSpeechUtterance *utterance;
@property(nonatomic, copy) RCTPromiseResolveBlock speechResolve;
@end

@implementation NextJobModule
@synthesize viewRegistry_DEPRECATED = _viewRegistry_DEPRECATED;
RCT_EXPORT_MODULE(NextJobModule)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (instancetype)init {
  if ((self = [super init])) {
    _composers = [NSMutableDictionary new];
    _state = [[NSUserDefaults.standardUserDefaults dictionaryForKey:@"nextjob.recording"] mutableCopy]
      ?: [@{@"recording":@NO, @"durationMs":@0, @"path":@"", @"kind":@"review"} mutableCopy];
    if ([_state[@"recording"] boolValue]) {
      _state[@"recording"] = @NO;
      _state[@"error"] = @"上次录音被系统中断，请检查已保存的录音。";
    }
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(interrupted:)
      name:AVAudioSessionInterruptionNotification object:nil];
  }
  return self;
}
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeNextJobSpecJSI>(params);
}
- (void)bindComposer:(double)tag resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  UITextView *input = NJTextView([self.viewRegistry_DEPRECATED viewForReactTag:@(tag)]);
  if (!input) { reject(@"input_missing", @"点一下输入框后再试。", nil); return; }
  [self unbindComposer:tag];
  NJComposer *composer = [NJComposer new];
  composer.tag = tag; composer.input = input;
  composer.previousPaste = input.pasteDelegate;
  composer.previousConfig = input.pasteConfiguration;
  __weak NextJobModule *weakSelf = self;
  composer.event = ^(NSString *phase, NSString *payload) {
    [weakSelf emitOnMaterial:@{@"target":@(tag), @"phase":phase, @"payload":payload}];
  };
  input.pasteDelegate = composer;
  input.pasteConfiguration = [[UIPasteConfiguration alloc] initWithAcceptableTypeIdentifiers:
    @[UTTypeImage.identifier, UTTypePlainText.identifier, UTTypeFileURL.identifier, UTTypePDF.identifier,
      @"org.openxmlformats.wordprocessingml.document"]];
  self.composers[@(tag)] = composer;
  resolve(nil);
}
- (void)bindDropZone:(double)tag composerTag:(double)composerTag resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  UIView *view = [self.viewRegistry_DEPRECATED viewForReactTag:@(tag)];
  NJComposer *composer = self.composers[@(composerTag)];
  if (!view || !composer) { reject(@"zone_missing", @"图片投放区正在准备。", nil); return; }
  UIDropInteraction *drop = [[UIDropInteraction alloc] initWithDelegate:composer];
  [view addInteraction:drop];
  [composer.drops addObject:drop];
  resolve(nil);
}
- (void)unbindComposer:(double)tag { [self.composers[@(tag)] detach]; [self.composers removeObjectForKey:@(tag)]; }
- (void)pasteClipboard:(double)tag resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  NJComposer *composer = self.composers[@(tag)];
  if (!composer) { reject(@"input_missing", @"请先点一下输入框。", nil); return; }
  [composer accept:UIPasteboard.generalPasteboard.itemProviders];
  resolve(nil);
}
- (void)recognizeImage:(NSString *)uri resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @autoreleasepool {
      NSError *error = nil; NSString *text = NJRecognizeImage(uri, &error);
      if (text) resolve(text); else reject(@"ocr_failed", error.localizedDescription, error);
    }
  });
}
- (void)readDocument:(NSString *)uri name:(NSString *)name resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @autoreleasepool {
      NSError *error = nil; NSString *text = NJReadDocument(uri, name, &error);
      if (text) resolve(text); else reject(@"document_failed", error.localizedDescription, error);
    }
  });
}
- (void)saveState { [NSUserDefaults.standardUserDefaults setObject:self.state forKey:@"nextjob.recording"]; }
- (void)startRecording:(NSString *)kind resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  if (self.recorder.isRecording) { reject(@"recording_busy", @"请先结束当前录音。", nil); return; }
  if (![kind isEqualToString:@"review"] && ![kind isEqualToString:@"interview"]) {
    reject(@"recording_kind", @"无效的录音类型。", nil); return;
  }
  if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive) {
    reject(@"recording_background", @"请在 App 打开时开始录音。", nil); return;
  }
  AVAudioSession *session = AVAudioSession.sharedInstance;
  if (session.recordPermission != AVAudioSessionRecordPermissionGranted) {
    reject(@"recording_permission", @"请在系统设置中允许麦克风权限。", nil); return;
  }
  [self stopSpeaking];
  NSError *error = nil;
  if (![session setCategory:AVAudioSessionCategoryPlayAndRecord mode:AVAudioSessionModeDefault
      options:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionAllowBluetooth error:&error] ||
      ![session setActive:YES error:&error]) {
    reject(@"recording_session", error.localizedDescription, error); return;
  }
  double now = NSDate.date.timeIntervalSince1970 * 1000;
  NSURL *url = [NJFolder(@"nextjob-recordings", NO) URLByAppendingPathComponent:
    [NSString stringWithFormat:@"%@-%.0f.wav", kind, now]];
  NSDictionary *settings = @{
    AVFormatIDKey:@(kAudioFormatLinearPCM), AVSampleRateKey:@16000, AVNumberOfChannelsKey:@1,
    AVLinearPCMBitDepthKey:@16, AVLinearPCMIsBigEndianKey:@NO, AVLinearPCMIsFloatKey:@NO
  };
  self.recorder = [[AVAudioRecorder alloc] initWithURL:url settings:settings error:&error];
  self.recorder.delegate = self;
  BOOL started = self.recorder && [self.recorder prepareToRecord] && [self.recorder recordForDuration:7200];
  if (!started) {
    self.recorder = nil;
    [session setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
    reject(@"recording_failed", error.localizedDescription ?: @"录音无法启动，请检查空间与麦克风。", error); return;
  }
  self.state = [@{@"path":url.path, @"kind":kind, @"recording":@YES, @"startedAt":@(now),
    @"createdAt":@(now), @"durationMs":@0} mutableCopy];
  [self saveState];
  resolve(NJJSON(self.state));
}
- (void)finishRecording:(NSString *)error {
  if (!self.recorder) return;
  NSURL *url = self.recorder.url;
  double duration = self.recorder.currentTime * 1000;
  AVAudioRecorder *recorder = self.recorder;
  self.recorder = nil;
  recorder.delegate = nil;
  [recorder stop];
  // After automatic completion, currentTime can be zero; read the finalized WAV.
  AVAudioFile *audio = [[AVAudioFile alloc] initForReading:url error:nil];
  if (audio.processingFormat.sampleRate > 0) duration = audio.length * 1000.0 / audio.processingFormat.sampleRate;
  self.state[@"recording"] = @NO; self.state[@"durationMs"] = @(duration);
  if (error) self.state[@"error"] = error;
  [self saveState];
  [NJJSON(self.state) writeToFile:[url.path stringByAppendingString:@".json"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
  [AVAudioSession.sharedInstance setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
}
- (void)stopRecording:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [self finishRecording:nil]; resolve(NJJSON(self.state));
}
- (void)recordingState:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  if (self.recorder.isRecording) self.state[@"durationMs"] = @(self.recorder.currentTime * 1000);
  resolve(NJJSON(self.state));
}
- (void)listRecordings:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  NSMutableArray *files = [NSMutableArray new];
  NSArray<NSURL *> *urls = [NSFileManager.defaultManager contentsOfDirectoryAtURL:NJFolder(@"nextjob-recordings", NO)
    includingPropertiesForKeys:nil options:0 error:nil];
  for (NSURL *url in urls) {
    if (![url.pathExtension isEqualToString:@"wav"]) continue;
    if ([self.state[@"path"] isEqualToString:url.path] && self.recorder.isRecording) { [files addObject:self.state.copy]; continue; }
    NSData *metadata = [NSData dataWithContentsOfFile:[url.path stringByAppendingString:@".json"]];
    NSDictionary *saved = metadata ? [NSJSONSerialization JSONObjectWithData:metadata options:0 error:nil] : nil;
    if (saved) { [files addObject:saved]; continue; }
    AVAudioFile *audio = [[AVAudioFile alloc] initForReading:url error:nil];
    if (!audio || !audio.processingFormat.sampleRate) continue;
    NSArray *name = [url.lastPathComponent.stringByDeletingPathExtension componentsSeparatedByString:@"-"];
    [files addObject:@{@"path":url.path, @"kind":name.firstObject ?: @"review", @"recording":@NO,
      @"createdAt":@([name.lastObject doubleValue]), @"durationMs":@(audio.length * 1000.0 / audio.processingFormat.sampleRate)}];
  }
  [files sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) { return [b[@"createdAt"] compare:a[@"createdAt"]]; }];
  resolve(NJJSON(files));
}
- (void)deleteRecording:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  NSString *file = path.stringByStandardizingPath.stringByResolvingSymlinksInPath;
  NSString *root = NJFolder(@"nextjob-recordings", NO).path.stringByResolvingSymlinksInPath;
  if (![file.stringByDeletingLastPathComponent isEqualToString:root] || ![file.pathExtension isEqualToString:@"wav"] ||
      (self.recorder.isRecording && [self.state[@"path"] isEqualToString:file])) {
    reject(@"recording_path", @"请先停止录音，并选择已保存的录音。", nil); return;
  }
  NSError *error = nil;
  if ([NSFileManager.defaultManager fileExistsAtPath:file] && ![NSFileManager.defaultManager removeItemAtPath:file error:&error]) {
    reject(@"recording_delete", error.localizedDescription, error); return;
  }
  [NSFileManager.defaultManager removeItemAtPath:[file stringByAppendingString:@".json"] error:nil];
  [NSFileManager.defaultManager removeItemAtPath:[file stringByAppendingString:@".txt"] error:nil];
  resolve(nil);
}
- (void)interrupted:(NSNotification *)notification {
  if ([notification.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue] == AVAudioSessionInterruptionTypeBegan) {
    [self finishRecording:@"来电或其他音频中断了录音，已有内容已保存。"];
    [self stopSpeaking];
  }
}
- (void)audioRecorderDidFinishRecording:(AVAudioRecorder *)recorder successfully:(BOOL)flag {
  if (recorder == self.recorder) [self finishRecording:flag ? nil : @"录音中断，已保留可用内容。"];
}
- (void)audioRecorderEncodeErrorDidOccur:(AVAudioRecorder *)recorder error:(NSError *)error {
  if (recorder == self.recorder) [self finishRecording:error.localizedDescription ?: @"录音保存失败，请检查手机空间。"];
}
- (void)speak:(NSString *)text resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  if (self.recorder.isRecording) { reject(@"speech_busy", @"请先结束录音。", nil); return; }
  [self stopSpeaking];
  AVSpeechSynthesisVoice *voice = [AVSpeechSynthesisVoice voiceWithLanguage:@"zh-CN"];
  if (!voice) { reject(@"speech_voice", @"请在 iPhone 设置中下载中文朗读声音。", nil); return; }
  NSError *error = nil;
  if (![AVAudioSession.sharedInstance setCategory:AVAudioSessionCategoryPlayback error:&error] ||
      ![AVAudioSession.sharedInstance setActive:YES error:&error]) {
    reject(@"speech_session", error.localizedDescription, error); return;
  }
  if (!self.speaker) { self.speaker = [AVSpeechSynthesizer new]; self.speaker.delegate = self; }
  self.utterance = [[AVSpeechUtterance alloc] initWithString:[text substringToIndex:MIN(text.length, 3500)]];
  self.utterance.voice = voice;
  self.utterance.rate = AVSpeechUtteranceDefaultSpeechRate;
  self.speechResolve = resolve;
  [self.speaker speakUtterance:self.utterance];
}
- (void)stopSpeaking {
  self.utterance = nil;
  [self.speaker stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
  RCTPromiseResolveBlock done = self.speechResolve; self.speechResolve = nil;
  if (done) done(nil);
  if (!self.recorder.isRecording) [AVAudioSession.sharedInstance setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
}
- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didFinishSpeechUtterance:(AVSpeechUtterance *)utterance {
  if (utterance == self.utterance) [self stopSpeaking];
}
- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didCancelSpeechUtterance:(AVSpeechUtterance *)utterance {
  if (utterance == self.utterance) [self stopSpeaking];
}
- (void)invalidate {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self finishRecording:@"App 已关闭，录音已保存。"];
    [self stopSpeaking];
    for (NJComposer *composer in self.composers.allValues) [composer detach];
    [self.composers removeAllObjects];
    [NSNotificationCenter.defaultCenter removeObserver:self];
  });
}
@end
