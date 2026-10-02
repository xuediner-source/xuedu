# 学渡 · 测试版 0.0.1

重庆交通大学课表与教务辅助应用。手机端使用 Vue 3、Vite、Pinia、Vant 和 Capacitor，后端使用 Express；仓库也包含早期微信小程序。

所有历史内测、灰测安装包统一到测试版 `0.0.1`。后续安装包发布到本仓库的 [Releases](https://github.com/xuediner-source/xuedu/releases)，不再单独发布灰测包。Android 包名保持 `com.cqjtu.app`，本次版本代码为 `251`。

2026-10-02 已发布 [测试版 0.0.1](https://github.com/xuediner-source/xuedu/releases/tag/v0.0.1)：[下载 Android APK](https://github.com/xuediner-source/xuedu/releases/download/v0.0.1/xuedu-test-0.0.1.apk)。本版已移除演示账号和体验问卷，使用学校教务账号登录。签名构建通过，公开下载的校验值与构建产物一致。

本版改动包括不保存教务密码、服务端注销会话、账号与学期缓存隔离、课表后台同步、准确解析单周与离散周、考试时间状态修复、自定义日程编辑与删除、五日/七日课表，以及课程冲突分栏。详细记录见 [优化记录](CHANGES-20261002.md)。

## 本地开发

```sh
cd backend
npm ci
DATA_DIR=/tmp/xuedu-dev node server.js
```

另开终端：

```sh
cd mobile-app
npm ci
npm test
npm run dev
```

浏览器打开 `http://127.0.0.1:5173/login`，使用学校教务账号登录；已停用历史测试账号。生产部署配置见 [部署说明](deploy/README.md)；环境变量模板不会自动加载，需要由服务启动器注入。

## Android 测试包

`npm run build:android` 构建并同步 Web 资源；`npm run build:android:debug` 生成本地调试包。签名测试包通过 GitHub Actions 构建，流程使用 JDK 17、Android SDK 34、仓库签名 Secrets，并校验包内版本和签名。

发布步骤及签名配置见 [测试版发布说明](TEST-RELEASE.md)。本次测试签名与历史包签名可能不同；若 Android 提示签名冲突，需先备份需要保留的本地数据，再卸载旧包安装。

真实教务登录、系统分享及 APK 安装仍需使用真实账号和 Android 设备验收。本仓库发布不等于部署线上后端。
