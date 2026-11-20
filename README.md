# 下一站 · iOS 免费安装版工程

面向求职者的 AI 工具，基于 [PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai) 修改，保留 MIT 许可证。

**当前状态：iOS 0.4.0（build 6）已通过云端编译与安装包校验。**

[下载未签名 IPA](https://github.com/CK-KK4/next-job-ios/releases/tag/ios-v0.4.0-preview)，然后在 Windows 用 Sideloadly 和自己的免费 Apple 账户签名安装。没有 TestFlight 版本。

打开 [iPhone 安装说明](IOS-使用说明.md) 查看免费云端打包与 Sideloadly 安装步骤。

最新版功能：独立功能页面、免费 / 收费平台切换、截图与文件输入、镜头预览和回合制语音面试、后台录音复盘。

- 构建入口：Actions → Build iOS Free IPA → Run workflow。
- 适用设备：iOS 17+，目标体验设备 iPhone 15 Pro。
- 模型文件由云端下载并校验，不需要上传大文件或填写模型 API 密钥。
- 本地 AI 免费；DeepSeek 和豆包按平台 API 规则收费。
- 免费 Apple ID 使用 Sideloadly 签名，通常每 7 天续签。自己发布到 TestFlight 仍需付费开发者会员。
- 验证状态见 [验证记录](IOS-验证记录.md)。

原项目文档保留在 [README-PocketPal.md](README-PocketPal.md)。
