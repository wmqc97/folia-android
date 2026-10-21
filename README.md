# Folia 安卓版 (folia-android)

> 📱 **Folia 音乐播放器的安卓移植版** —— 基于 [folia-major 0.7.18](https://github.com/chthollyphile/folia-major) 源码移植，**原生桥架构**：音乐请求与扫码登录全部由原生层（OkHttp + CookieManager）完成，无需电脑、无需任何外部服务器，手机上独立运行。

**作者：不出名的TiMing（[Timingyyds](https://github.com/Timingyyds)）**

**当前版本：v1.4.0**（同步上游 0.7.18，原生桥架构）

---

## ✨ 这是什么

把 Folia（一个桌面端音乐播放器）完整移植到安卓的项目：

- **完整 0.7.18 源码**：桌面版的所有音源（网易云 / 酷狗 / QQ 音乐 / 波点 / Navidrome）与界面全部保留
- **原生桥架构**：音源 API 适配层运行在前端，网络请求与 Cookie 由安卓原生层（OkHttp + CookieManager）直接处理——登录即浏览器级体验
- **无后端依赖**：不内置任何服务器运行时，APK 仅 45MB
- **Capacitor 壳**：安卓 WebView 承载界面，沉浸式全屏、横竖屏自适应
- **本地音乐导入**：原生本地音频服务（LocalAudioServer），扫描本地音频进曲库
- **扫码登录**：网易云 / 酷狗 / QQ 音乐 / 波点，全部支持手机上直接扫码

## 🎵 安卓专属功能

- **媒体通知**：播放时通知栏显示封面 / 歌名 / 歌手，进度条实时走动、可拖动跳转，上一首/播放暂停/下一首按钮直接控制
- **后台播放不中断**：前台服务保活，退到桌面、锁屏音乐持续播放
- **播放不被其他应用打断**：开关位于 播放动画设置 → 第 2 个面板 → 音频增益下方，开游戏/看视频音乐不停
- **原生扫码登录**：Cookie 由系统 CookieManager 原生管理，扫码授权即登录
- **通知权限自动请求**：Android 13+ 首次启动自动弹出授权框
- **内置中文字体**（Noto Sans SC）：全 App 中文渲染统一美观，完全离线可用
- **触摸设备优化**：隐藏键盘快捷键提示、空闲自动隐藏播放条

## 📥 安装

1. 打开本仓库的 [**Releases**](https://github.com/Timingyyds/folia-android/releases) 页面
2. 下载最新的 `Folia-Android-1.4.0.apk`
3. 手机上安装（需允许"安装未知来源应用"）
4. 首次启动在弹框中**允许发送通知**（媒体通知需要）

> APK 约 45MB。

## 🔨 自己构建

```bash
npm install

# 前端音源走原生桥
$env:VITE_NETEASE_API_BASE='extension'
$env:VITE_QQ_API_BASE='extension'
$env:VITE_KUGOU_API_BASE='extension'

npm run build:capacitor
npx cap sync android
cd android && ./gradlew assembleDebug
```

要求：JDK 21、Android SDK（compileSdk 36）。

## 🧩 架构说明

```
WebView（React + 0.7.18 界面）
   │  音源适配层（audioNative/）
   │  模拟扩展协议：网络请求 / Cookie / 存储
FoliaCorePlugin（Capacitor 原生插件）
   │  OkHttp 网络请求
   │  CookieManager 会话管理
   └── LocalAudioServer（本地音乐服务）
```

## ⚠️ 已知限制

- QQ 扫码登录可能被 QQ 风控在凭据校验阶段拒绝，属上游协议限制
- 酷狗 VIP 歌曲对非会员账号部分不可播，为上游版权限制

## 🙏 致谢

- 上游项目：[folia-major](https://github.com/chthollyphile/folia-major) —— 本仓库基于其 0.7.18 版源码移植，请同时支持原作者
- **特别感谢：[RemnantCloudGodofWar/folia-android](https://github.com/RemnantCloudGodofWar/folia-android)** —— 本项目 v1.4.0 起的原生桥架构借鉴并融合了该项目的实现思路与代码，正是这一架构让登录与本地音乐在安卓上稳定流畅
- [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile)（历史版本的内置后端方案）
- 各音源 API 项目：NeteaseCloudMusicApi / KuGouMusicApi / qq-music-api / bodian-music-api

## 📄 免责声明

本项目仅供学习交流使用，请于下载后 24 小时内自行删除。音乐版权归原作者所有。
