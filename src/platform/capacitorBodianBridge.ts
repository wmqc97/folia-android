import { isCapacitorAndroid } from './runtime';

/**
 * 电容端（安卓）的波点音源桥。
 *
 * 背景：0.7.16 的 `bodianTransport.ts` 只认 `window.electron.bodianRequest`（Electron 主进程
 * 实现的）。安卓 WebView 里没有这个桥，所以这里注入一个同签名的函数，转发到设备本地
 * Node 里的波点服务（由 assets/nodejs-project/index.js 起在 3100）。
 *
 * ⚠️ 关键：桥接函数挂在**独立全局** `__foliaBodianRequest` 上，绝对不要挂到 `window.electron`。
 * 因为 App 里大量代码用 `if (window.electron) { ... electron.xxx() }` 这种「对象存在即认为是
 * 桌面端」的守卫（例如 SettingsModal 里的 getSettings）。一旦 window.electron 变成存在但缺方法，
 * 那些守卫会通过、随后调用不存在的方法抛 TypeError，直接导致整页渲染崩溃 —— 表现就是
 * **一打开设置就黑屏**。bodianTransport 那边已改成同时认这个独立全局。
 */

/** 波点桥接服务地址；跑在设备本地 Node 里。 */
const BODIAN_BRIDGE_BASE = 'http://127.0.0.1:3100';

type BodianRequestFn = (
  operation: string,
  params?: Record<string, unknown>,
) => Promise<unknown>;

export const installCapacitorBodianBridge = (): void => {
  if (typeof window === 'undefined') return;
  if (!isCapacitorAndroid()) return;

  const target = window as typeof window & {
    __foliaBodianRequest?: BodianRequestFn;
  };

  // 已经有真的 Electron 桥就不覆盖。
  if (typeof window.electron?.bodianRequest === 'function') return;
  if (typeof target.__foliaBodianRequest === 'function') return;

  target.__foliaBodianRequest = async (operation, params) => {
    try {
      const response = await fetch(`${BODIAN_BRIDGE_BASE}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, params: params ?? {} }),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: { code: 'unavailable', message: `bodian bridge HTTP ${response.status}` },
        };
      }

      return await response.json();
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'network',
          message: `bodian bridge unreachable: ${String((error as Error)?.message ?? error)}`,
        },
      };
    }
  };
};
