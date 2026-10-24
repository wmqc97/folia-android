// src/audioNative/fetchShim.ts
// Android 全局 fetch 原生桥：跨域请求经 FoliaBridge（OkHttp + CookieManager）发出。
// WebView 页面源是 https://localhost，第三方接口（酷狗旧接口、波点等）没有 CORS 头，
// 浏览器 fetch 会被拦；原生层没有同源策略，会话 Cookie 仍由系统 CookieManager 统一管理。

import { bridgeRequest, isNativeBridgeAvailable } from './core';

let installed = false;

/**
 * 本机回环地址：LocalAudioServer（音频流）与歌词代理都在这里，它们自带 CORS，
 * 根本不需要过原生桥。
 */
const isLoopbackUrl = (url: string): boolean => {
  try {
    const { hostname } = new URL(url, pageOrigin);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
};

/** 带 Range 的是媒体分段请求：整段搬进内存再 base64 会把 256MB 堆打穿。 */
const hasRangeHeader = (headers: Record<string, string>): boolean =>
  Object.keys(headers).some(key => key.toLowerCase() === 'range');

export const installNativeFetchShim = (): void => {
  if (installed || !isNativeBridgeAvailable()) return;
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  const pageOrigin = window.location.origin;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url = '';
    try {
      url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    } catch {
      return originalFetch(input, init);
    }
    // 同源与相对路径请求走原 fetch（页面资产、SW、桥内部请求）
    const sameOrigin = url.startsWith('/') || url.startsWith(pageOrigin);
    if (sameOrigin) return originalFetch(input, init);

    const method = (init?.method ?? 'GET').toUpperCase();
    let headers: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders) {
      if (typeof Headers !== 'undefined' && rawHeaders instanceof Headers) {
        rawHeaders.forEach((value, key) => { headers[key] = value; });
      } else if (Array.isArray(rawHeaders)) {
        for (const [key, value] of rawHeaders) headers[key] = value;
      } else {
        headers = { ...(rawHeaders as Record<string, string>) };
      }
    }
    const body = typeof init?.body === 'string' ? init.body : undefined;

    /*
     * 这两类请求绝不能过原生桥：
     * - 回环地址（LocalAudioServer / 歌词代理）：本来就带 CORS，过桥只是白搬一遍；
     * - 带 Range 的媒体分段：原生桥没有流式通道，整包读进 ByteArrayOutputStream 再 base64
     *   （膨胀 4/3）交给 JS —— 真机上一段 78MB 的音频直接变成 104MB 的字符串分配，
     *   FATAL EXCEPTION: CapacitorPlugins / OutOfMemoryError at Base64.encodeToString。
     * 浏览器自己会流式处理这些请求。
     */
    if (isLoopbackUrl(url) || hasRangeHeader(headers)) return originalFetch(input, init);

    try {
      // 二进制请求走 base64（二维码 PNG 等经参考层 base64 化时需字节完整）
      const answer = await bridgeRequest({ url, method, headers, body, timeoutMs: 30_000, binary: true });
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(answer.headers ?? {})) {
        if (key.toLowerCase() === 'set-cookie') continue;
        if (value != null) responseHeaders.set(key, String(value));
      }
      // 参考项目约定：Set-Cookie 镜像到 x-folia-set-cookie（reference/*.js 经 setCookieHeaders.js 读取）
      const shimSetCookies = (answer as { setCookies?: string[] }).setCookies ?? [];
      for (const value of shimSetCookies) responseHeaders.append('x-folia-set-cookie', value);

      let responseBody: BodyInit = answer.body ?? '';
      const bodyB64 = (answer as { bodyBase64?: string }).bodyBase64;
      if (bodyB64) {
        try {
          const binStr = atob(bodyB64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
          responseBody = bytes;
        } catch { /* 解码失败退回文本 */ }
      }
      return new Response(responseBody, {
        status: answer.status,
        headers: responseHeaders,
      });
    } catch {
      // 原生桥失败时回退浏览器 fetch（保持可诊断性）
      return originalFetch(input, init);
    }
  };
};
