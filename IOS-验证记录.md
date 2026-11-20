# iOS 0.4.0 构建与交付记录

- 版本：0.4.0 / build 6；应用标识 com.nextjob.app；ARM64；最低 iOS 17.0。
- 编译源码提交：`d55d251aa2841760d09c732c22092b098ee8c3e2`。
- [GitHub Actions 成功构建](https://github.com/CK-KK4/next-job-ios/actions/runs/44670674213)；Xcode Release 编译、IPA 打包与流水线校验全部通过。
- 5 个针对性测试套件、22 项测试通过；TypeScript 全量检查通过；本次涉及文件的 ESLint 为 0 errors / 28 warnings（void 和内联样式提示）。
- 下载后复核：ZIP 完整性、IPA 哈希、应用版本、ARM64 可执行文件、苹果 NextJobModule 原生模块、最新版独立页面 / 平台端点、两个模型的体积与 SHA-256 均通过。
- IPA 大小：604,946,056 字节。
- IPA SHA-256：`19097b8286360b819c33e96dd3adb30fb897b987a85fcdafbc617708e3d0285a`。
- [IPA 发布页](https://github.com/CK-KK4/next-job-ios/releases/tag/ios-v0.4.0-preview)。

## 已编译进入安装包的功能

独立功能页面、顶部 AI 平台切换与费用标注、内置本地 AI、iPhone 截图 OCR、PDF / DOCX / TXT 导入、图片粘贴与拖放接口、前置镜头预览和回合制语音问答、后台麦克风录音及本地转写。

## 未验证的部分

没有代用户连接 iPhone，没有启动模拟器。Sideloadly 签名安装、相机 / 剪贴板 / 跨 App 拖放 / 锁屏录音体验以及真实云端 API 调用尚未完成。编译通过不等于这些真机体验均已验证。

本包未签名，需用用户自己的 Apple 账户签名。当前没有付费 Apple Developer Program 会员，因此没有 TestFlight 发布或邀请链接。
