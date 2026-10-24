# Folia for Xiaomi Rear Display · 小米背屏适配版

> [Folia](https://github.com/chthollyphile/folia-major) 桌面音乐播放器的安卓移植版，并在其基础上**专门适配小米「妙享背屏」**：
> 主屏照常操作与播放，背屏作为一块独立歌词屏，支持全部歌词样式、背景效果与逐字动画。

---

## 一、项目关系

| 角色 | 仓库 | 说明 |
| --- | --- | --- |
| 源项目（原始桌面版） | <https://github.com/chthollyphile/folia-major/tree/main> | Folia 本体，作者与版权方 |
| 安卓移植版（本仓库上游） | <https://github.com/Timingyyds/folia-android> | 安卓移植的主要工作 |
| 本仓库 | <https://github.com/wmqc97/folia-android> | 在安卓移植版基础上做小米背屏适配 |

**开源协议跟随源项目**：本项目沿用源项目的 [GNU Affero General Public License v3.0](LICENSE)（AGPL-3.0）。
版权归原作者所有；二次分发、修改、部署需同样以 AGPL-3.0 开源并保留署名。

---

## 二、背屏适配说明（本项目的主要改动）

### 支持机型

小米 17 Pro / 17 Pro Max / 18 系列等带「妙享背屏」的机型。
实测环境：小米 17 Pro Max，背屏 976 × 596 物理像素，WebView CSS 视口 347 × 212，左侧摄像头竖带约 277 物理像素（98 CSS px）。

### 投屏需要 Shizuku 权限

背屏在系统里是 **display 1**，第三方应用无法直接投屏，本项目通过 Shizuku（或 root）拿到 shell 权限后，用
`am display move-stack` 把背屏 Activity 送到背屏上。

使用前请先：

1. 安装 [Shizuku](https://github.com/RikkaApps/Shizuku) 并按提示启动（无线调试 / adb / root 任一方式）；
2. 在本应用内授予 Shizuku 权限；
3. 打开 **设置 → 连接 → 背屏歌词 → 开始投屏**。

没有 Shizuku 权限时，主屏一切功能正常，只是无法把歌词投到背屏。

### 背屏能力

- **全部歌词样式**：经典、商籁、绘光、心象、回环、莫奈、时计、镜台、凝彩、卡登扎、帕蒂塔、卡佩拉、倾斜、静止，共 14 种，背屏与主屏同一套渲染器。
- **逐样式构图**：每种样式单独保存「歌词画布起点 / 渲染中心偏移 / 效果缩放 / 字号倍率」，出厂值按真机调校，可逐个微调并整包导入 / 导出。
- **摄像头避让**：歌词可读区从摄像头右缘开始，左侧仍由背景铺满，不出现硬切或空条。
- **字号独立**：背屏与主屏各有一套字号倍率，互不影响。
- **背屏可操作**：切歌、暂停 / 继续、换样式、改字号；指令回传主屏，状态唯一真源始终在主屏。

---

## 三、继承自上游的功能

- 全部音源：网易云 / 酷狗 / QQ 音乐 / 波点 / Navidrome，手机上直接扫码登录
- 原生桥网络层：请求与 Cookie 由原生 OkHttp + CookieManager 处理，无需电脑、无需外部服务器
- 本地音乐：原生本地音频服务（LocalAudioServer）扫描导入、内嵌封面
- 媒体通知：封面 / 歌名 / 进度条 / 上一首·暂停·下一首
- 后台播放：前台服务保活，锁屏与切后台不中断
- 桌面端的歌词样式、背景、主题、模组（Folium）、命令面板等能力完整保留

---

## 四、从源码构建

本仓库**只提交源码**，不包含 `dist/`、`android/app/build/`、`node_modules/` 等构建产物，也不发布 APK。

```bash
npm install

# 前端音源走原生桥
export VITE_NETEASE_API_BASE='extension'
export VITE_QQ_API_BASE='extension'
export VITE_KUGOU_API_BASE='extension'

npm run build:capacitor
npx cap sync android
cd android && ./gradlew assembleDebug      # 正式包用 assembleRelease
```

环境要求：Node.js ≥ 24、JDK 21、Android SDK（compileSdk 36）。
正式包签名需自备 `android/keystore.properties`（`storeFile / storePassword / keyAlias / keyPassword`），该文件已被 `.gitignore` 排除。

---

## 五、已知限制

- QQ 扫码登录可能在凭据校验阶段被风控拒绝，属上游协议限制
- 酷狗 VIP 曲目对非会员账号部分不可播，属上游版权限制
- 投屏依赖 Shizuku，未授权时背屏功能不可用
- WebView 播放音频时会自行申请音频焦点（Chromium 行为，无 App 侧开关），与其他应用同时出声受系统策略限制

---

## 六、致谢

- 源项目：[chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) —— Folia 本体
- 安卓移植：[Timingyyds/folia-android](https://github.com/Timingyyds/folia-android) —— 本仓库的基座
- [RemnantCloudGodofWar/folia-android](https://github.com/RemnantCloudGodofWar/folia-android) —— 原生桥架构思路
- [Shizuku](https://github.com/RikkaApps/Shizuku) —— 背屏投屏所需的权限通道
- 各音源 API 项目：NeteaseCloudMusicApi / KuGouMusicApi / qq-music-api / bodian-music-api

---

## 七、免责声明

本项目仅供学习与技术交流，请于下载后 24 小时内自行删除。音乐与相关内容的版权归各自权利人所有。
