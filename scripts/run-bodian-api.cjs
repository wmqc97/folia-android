#!/usr/bin/env node
/**
 * 波点音乐后端：把 host-neutral 的 `bodian-music-api` 包成一个 HTTP 服务，
 * 供安卓端（Capacitor）通过注入的 `window.electron.bodianRequest` shim 调用。
 *
 * 为什么需要它：
 *   0.7.16 的 `bodianTransport.ts` 只认 `window.electron.bodianRequest(operation, params)`
 *   —— 在 Electron 里那是由主进程实现的。安卓 WebView 没有这个桥，所以这里用一个
 *   Node HTTP 服务复刻同样的语义，再在 WebView 里注入同名函数转发过来。
 *
 * 用法：
 *   node scripts/run-bodian-api.cjs            # 默认 3100 端口
 *   PORT=3100 node scripts/run-bodian-api.cjs
 *
 * 手机侧（USB）：adb reverse tcp:3100 tcp:3100
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createBodianApi } = require('bodian-music-api');

const PORT = Number(process.env.PORT || 3100);

// 波点要求 deviceId 是**稳定的 32 位小写十六进制**字符串（可变化的会被拒绝），
// 所以生成一次后落盘复用，避免每次重启都换新设备身份。
const DEVICE_ID_FILE = path.join(__dirname, '..', '_runtime', 'bodian-device-id.txt');

const loadDeviceId = () => {
  try {
    const stored = fs.readFileSync(DEVICE_ID_FILE, 'utf-8').trim();
    if (/^[0-9a-f]{32}$/.test(stored)) return stored;
  } catch {
    /* 首次运行没有文件，走下面生成 */
  }
  const generated = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(path.dirname(DEVICE_ID_FILE), { recursive: true });
  fs.writeFileSync(DEVICE_ID_FILE, generated, 'utf-8');
  return generated;
};

// ---- 会话存储：与 Electron 主进程里的实现语义一致（每次增删都递增 revision）----
let revision = 0;
let session = null;

const sessionStore = {
  get revision() {
    return revision;
  },
  get() {
    return session;
  },
  set(next) {
    session = next;
    revision += 1;
  },
  clear() {
    session = null;
    revision += 1;
  },
};

const api = createBodianApi({
  deviceId: loadDeviceId(),
  sessions: sessionStore,
});

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });

const server = http.createServer(async (req, res) => {
  // WebView 的页面源是 https://localhost，这里跨源访问 json 接口，放开即可（不使用 cookie）。
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'folia-bodian-bridge' }));
    return;
  }

  if (req.method !== 'POST' || !req.url.startsWith('/request')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'unsupported', message: 'not found' } }));
    return;
  }

  try {
    const raw = await readBody(req);
    const { operation, params } = JSON.parse(raw || '{}');
    const result = await api.request(operation, params || {});

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: false,
      error: { code: 'unavailable', message: String(error && error.message ? error.message : error) },
    }));
  }
});

server.listen(PORT, () => {
  console.log(`[folia] bodian bridge listening on port ${PORT}`);
});
