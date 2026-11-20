export const MAX_ATTACHMENT_BYTES = 256 * 1024;
export const MAX_ATTACHMENT_CHARS = 6000;

export const formatNextJobText = (name: string, text: string): string => {
  if (!/\.(txt|md)$/i.test(name)) {
    throw new Error('目前支持 TXT、Markdown。PDF、Word 请先复制正文。');
  }
  const content = text.replace(/^\uFEFF/, '').trim();
  if (!content || content.includes('\u0000')) {
    throw new Error('没有读到有效正文，请使用 UTF-8 文字文件。');
  }
  if (content.length > MAX_ATTACHMENT_CHARS) {
    throw new Error('文件超过 6000 字，请拆成几段。');
  }
  if ((content.match(/\uFFFD/g) ?? []).length > 3) {
    throw new Error('文字编码无法识别，请另存为 UTF-8 后再试。');
  }
  const safeName = name.replace(/[\r\n]/g, ' ');
  return `以下是附件“${safeName}”的正文，请按当前功能处理。\n\n${content}`;
};
