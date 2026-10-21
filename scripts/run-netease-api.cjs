#!/usr/bin/env node
/**
 * 本地启动一个网易云音乐 API 实例，给手机端 Folia 用。
 *
 * 为什么不直接用包里的 app.js：
 *   app.js 调用 serveNcmApi({ checkVersion: true })，而 checkVersion() 要访问 npm registry
 *   查版本号，国内直连不通会一直挂着，Promise.all 因此永远不返回，服务永远不 listen。
 *   这里显式关掉版本检查。
 *
 * 用法：
 *   node scripts/run-netease-api.cjs          # 默认 3000 端口
 *   PORT=4000 node scripts/run-netease-api.cjs
 *
 * 手机侧（USB）：
 *   adb reverse tcp:3000 tcp:3000
 * 然后 APK 里 VITE_NETEASE_API_BASE 指到 http://localhost:3000 即可。
 */

const path = require('path');

const apiDir = path.join(
  __dirname,
  '..',
  'node_modules',
  '@neteasecloudmusicapienhanced',
  'api',
);

async function main() {
  // 生成/刷新 anonymous_token，与官方 app.js 的启动流程保持一致。
  const generateConfig = require(path.join(apiDir, 'generateConfig'));
  await generateConfig();

  const { serveNcmApi } = require(path.join(apiDir, 'server'));

  serveNcmApi({
    port: Number(process.env.PORT || 3000),
    checkVersion: false,
  });

  console.log('[folia] netease api listening on port', process.env.PORT || 3000);
}

main().catch((err) => {
  console.error('[folia] 启动网易云 API 失败:', err);
  process.exit(1);
});
