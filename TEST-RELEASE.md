# 统一测试版发布

当前版本为 `0.0.1`，Android `versionCode=250`，频道为 `test`。安装包命名为 `xuedu-test-0.0.1.apk`，GitHub Release 标签为 `v0.0.1`，并标记为 prerelease。

历史灰测和内测包不再作为独立发布渠道。规范下载路由为 `/download/app-test.apk`；旧 `/download/app-gray.apk` 和 `/download/app-latest.apk` 仅重定向至规范路由。演示账号的 `DEMO_ENABLED` 开关独立于安装包发布频道。

## 构建与发布

推送 `main` 上的代码改动或手动运行 `Build unified test APK` 会执行前后端测试，生成已签名 APK，并上传 `xuedu-test-apk` workflow artifact。artifact 中包含安装包、SHA-256、签名校验结果及包内版本信息。发布前需确认 workflow 成功，包内版本名、版本代码和 Release 标签一致。

签名文件通过 GitHub Actions Secrets 提供，不提交到源码：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

构建过程中仅在 runner 临时目录解码签名文件，完成后删除。后续测试版使用同一签名并递增 `versionCode`，以便 Android 正常覆盖安装；版本名重置时更新检查优先比较版本代码。

本地签名构建需设置以上密码/别名环境变量及绝对路径 `ANDROID_KEYSTORE_PATH`，然后在 `mobile-app/` 执行 `npm run build:android:release`。该命令需要 JDK 17 和 Android SDK，不会使用默认密码或签名文件。

后端发布元数据位于 `backend/app-release.json`。只有 APK 已真实上传并可下载后才把 `published` 改为 `true`；未发布或链接不合法时不向客户端提供安装包更新。修改后端源码或此文件须部署到服务端后才会影响线上 API。
