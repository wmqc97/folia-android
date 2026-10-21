#!/usr/bin/env node
/**
 * QQ 音乐 API 后端（供安卓端通过 VITE_QQ_API_BASE 访问）。
 *
 * 这个包的根入口在载入时就会调用 app.listen()，并把 HTTP server 句柄导出来，
 * 所以只要 require 一次、带上 PORT 即可，不需要自己起服务。
 *
 * 用法：
 *   node scripts/run-qq-api.cjs          # 默认 3002
 *   PORT=3002 node scripts/run-qq-api.cjs
 *
 * 手机侧（USB）：adb reverse tcp:3002 tcp:3002
 */

process.env.PORT = process.env.PORT || '3002';

const qq = require('@yakult-green-tea/qq-music-api');

const server = qq.server || qq.default?.server;

if (!server) {
  console.error('[folia] 没能从 QQ API 包里拿到 server 句柄');
  process.exit(1);
}

server.on('listening', () => {
  console.log(`[folia] qq music api listening on port ${server.address().port}`);
});

server.on('error', (error) => {
  console.error('[folia] QQ API 启动失败:', error);
});
