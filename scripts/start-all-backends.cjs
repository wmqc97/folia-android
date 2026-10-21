#!/usr/bin/env node
/**
 * 一次性启动 Folia 安卓端需要的全部后端服务。
 *
 * 四个音源各自的后端：
 *   网易云  3000  本地 NeteaseCloudMusicApiEnhanced 实例
 *   酷狗    3001  KuGouMusicApi（包内自带）
 *   QQ音乐  3002  @yakult-green-tea/qq-music-api（载入即 listen）
 *   波点    3100  本仓库的 HTTP 桥接（包一层 bodian-music-api）
 *
 * 用法：
 *   node scripts/start-all-backends.cjs
 * 然后（手机侧）：
 *   adb reverse tcp:3000 tcp:3000
 *   adb reverse tcp:3001 tcp:3001
 *   adb reverse tcp:3002 tcp:3002
 *   adb reverse tcp:3100 tcp:3100
 *
 * 这个脚本只是把四个服务作为子进程拉起来；关掉本窗口/按 Ctrl+C 会一起退出。
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');

const services = [
  { name: '网易云', port: 3000, file: path.join(__dirname, 'run-netease-api.cjs') },
  { name: '酷狗', port: 3001, file: path.join(root, 'node_modules', 'kugoumusicapi', 'app.js') },
  { name: 'QQ音乐', port: 3002, file: path.join(__dirname, 'run-qq-api.cjs') },
  { name: '波点', port: 3100, file: path.join(__dirname, 'run-bodian-api.cjs') },
];

const children = [];

for (const service of services) {
  const child = spawn(process.execPath, [service.file], {
    cwd: root,
    env: { ...process.env, PORT: String(service.port) },
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    console.log(`[folia] ${service.name} (${service.port}) 退出，code=${code}`);
  });

  children.push(child);
  console.log(`[folia] 已启动 ${service.name} -> 端口 ${service.port}`);
}

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
