# 学渡 · 统一测试版 0.0.1

当前项目保留已通过验收的业务修改，安装包发布统一为测试版 `0.0.1`（Android versionCode `251`）。历史内测/灰测 APK 仅作为本机备份，不再作为独立发布渠道。

主项目说明见 [README.md](README.md)，版本改动见 [CHANGES-20261002.md](CHANGES-20261002.md)，发布与签名流程见 [TEST-RELEASE.md](TEST-RELEASE.md)，服务端配置见 [deploy/README.md](deploy/README.md)。

| 目录 | 内容 |
| --- | --- |
| `mobile-app/` | Vue、Vite、Pinia、Vant、Capacitor 手机端 |
| `mobile-app/android/` | Android 原生工程；Web 资源由 build/sync 生成 |
| `backend/` | 教务代理、会话管理及测试版分发元数据 |
| `miniprogram/` | 微信小程序资产 |
| `deploy/` | Nginx 配置与环境说明 |
| `.github/workflows/` | 前后端测试与签名 APK 构建 |

本机历史截图、源码备份、旧 APK、实验工程、运行数据和私钥不提交到公开仓库。

本地测试执行 `backend/npm test` 和 `mobile-app/npm test`。手机端 `npm run build:android` 生成并同步 Web 资源；APK 构建命令与 JDK/SDK、签名环境要求见发布说明。线上后端部署及真实账号/Android 真机验收独立于 GitHub 发布。
