# iOS 0.4.0 构建准备记录

- 基础代码：当前安卓 0.4.0-preview 的界面、存储与 AI 平台集成。
- iOS 工程：独立于安卓，版本号 0.4.0 / build 6，标识 com.nextjob.app。
- 新增苹果原生实现：Vision 截图 OCR、PDFKit 读取 PDF、受限 DOCX 正文解压、图片粘贴 / 拖放、AVAudioRecorder 后台麦克风录音、系统中文朗读。
- 已通过：5 个测试套件 / 22 项测试（独立页面、平台配置、iOS 附件导入、长录音转写流程、WAV 数据块解析）。
- TypeScript 全量类型检查通过；本次涉及文件的 ESLint 为 0 errors / 28 warnings（void 和内联样式提示）。
- 未完成：macOS 原生编译、IPA 生成、安装签名、真机摄像头 / 剪贴板 / 后台录音体验、真实云端 API 调用。
- 未进行：iOS 模拟器或安卓模拟器操作。
- 没有 TestFlight 发布，也没有下载邀请链接。

准备了 GitHub Actions 手动构建流程。需要 GitHub 仓库和账号授权后才能实际运行；生成 IPA 前不能把工程包称为已验证的可安装版本。
