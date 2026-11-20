# 下一站 iOS 0.4.0 工程

这是基于最新版安卓版功能同步的 **iOS 0.4.0 工程**。已通过云端编译并生成未签名 IPA，可从[发布页](https://github.com/CK-KK4/next-job-ios/releases/tag/ios-v0.4.0-preview)下载。使用免费 Apple 账户经 Sideloadly 安装；没有 TestFlight 链接。

## 这版有什么

- 看岗位、改简历、练面试、做测试、做复盘：点开进入独立页面。
- 顶部切换本地 AI、DeepSeek、豆包，分别显示免费或 API 按量收费。
- 内置中文模型自动准备和加载，本地模型不需要 API 账号。
- iPhone 原生截图 OCR，支持粘贴图片、从相册选择、从文件中上传 PDF / DOCX / TXT。可用时接收 iOS 跨 App 拖放；Windows 桌面文件不能直接拖到一台真实 iPhone。
- 前置镜头预览，按回合录音、在本机转写、让所选 AI 回答并朗读。默认模型不看镜头画面；这不是豆包式连续实时视频通话。
- 复盘录音使用 iOS 后台音频模式，目标是锁屏或切到后台仍能录音。来电、系统终止 App 等会中断，需真机验证；不能录制电话或其他 App 的内部音频。

## 免费安装路线

1. 将本目录文件放进你自己的 GitHub 仓库，包括 `.github/workflows/build-ios-free.yml`。不要只上传 ZIP；Actions 需要解压后的工程。
2. 打开仓库的 **Actions → Build iOS Free IPA → Run workflow**。
3. 云端先检查代码，下载并校验约 573 MB 的模型，再用 macOS / Xcode 编译。无需你自己购买 Mac。
4. 构建成功后，在任务底部 **Artifacts** 下载 `next-job-ios-0.4.0-unsigned`，解压获得 `.ipa`。产物保留 1 天。
5. 在 Windows 使用 [Sideloadly 官网](https://sideloadly.io/)提供的 Windows 工具，以及官网要求的网页版 iTunes / iCloud。
6. 数据线连接 iPhone、信任电脑，将 IPA 拖入 Sideloadly，在工具中自行登录 Apple 账户后安装。不要把密码或验证码写进工程。
7. 按手机提示信任开发者并开启开发者模式。免费 Apple 账户通常需要每 7 天续签。

**费用边界：**公开仓库的标准 GitHub 托管 runner 通常免费，但源代码也会公开。私有仓库会消耗账号的免费 Actions 额度，超出是否计费取决于账号预算；没有确认额度和预算前，不运行私有仓库的构建。本工程不使用付费的大型 runner。

**TestFlight：**自己发布到 TestFlight 必须有有效的 Apple Developer Program 会员。普通免费 Apple ID 无法发布。当前用户选择免费路线，因此没有上传到 App Store Connect。

## 设备与隐私

- 目标设备：iPhone 15 Pro；本工程设置为 iOS 17 或更高版本。
- 内置 Qwen2.5 0.5B（Apache-2.0）和 Whisper base q8（MIT）；下载时校验 SHA-256，许可证位于 `ios/PocketPal/nextjob/`。
- 本地 OCR、录音和转写在设备上处理。切换到收费云端平台并点击发送后，问题及附件文字会发给所选平台。
- 使用云端平台需填写自己的 API Key；密钥交给系统 Keychain 保存，不包含在工程包中。
- 原工程基于 [PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai)，保留 MIT 许可证。没有沿用原作者的开发者 Team ID、签名权限或 Firebase 账号配置。

## 当前验证状态

已完成 22 项针对性测试、TypeScript 检查、Xcode Release 真机架构编译、内置模型与最终 IPA 哈希校验。Sideloadly 签名和 iPhone 操作尚未完成。实际结果以 `IOS-验证记录.md` 为准。按用户要求没有运行模拟器。
