// src/platform/bootErrorOverlay.ts
//
// 启动诊断：把启动期间的所有报错收集起来，20 秒后如果应用还没进入主界面
// （闪屏元素还在），就把错误直接显示在屏幕上。
//
// 起因：别人的 Android 12 设备卡在 Folia 闪屏，而那台设备连不上电脑、取不到日志。
// 有了这个，对方截个图就能把卡住的原因发过来。

const BOOT_ERRORS: string[] = [];

export const recordBootError = (message: string): void => {
  if (BOOT_ERRORS.length > 60) return;
  BOOT_ERRORS.push(`[${new Date().toLocaleTimeString()}] ${message}`);
};

const describe = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'object' && value !== null) {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

export const installBootErrorOverlay = (): void => {
  if (typeof window === 'undefined') return;

  recordBootError(`设备: ${navigator.userAgent}`);
  window.addEventListener('error', (event) => {
    recordBootError(`window.onerror: ${describe(event.error ?? event.message)}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordBootError(`未处理的 Promise 拒绝: ${describe(event.reason)}`);
  });
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    recordBootError(args.map(describe).join(' '));
    originalError(...args);
  };

  window.setTimeout(() => {

    // 闪屏元素还在 = 还没进入主界面。
    if (!document.getElementById('app-splash')) return;
    if (BOOT_ERRORS.length === 0) {
      recordBootError('20 秒内没有任何报错，但启动未完成 —— 大概率在等待后端/网络就绪');
    }
    const box = document.createElement('div');
    box.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:12px',
      'max-height:70vh', 'overflow:auto',
      'background:rgba(12,12,16,.95)', 'color:#e4e4e7',
      'font:12px/1.6 monospace', 'padding:12px', 'border-radius:10px',
      'z-index:2147483647', 'white-space:pre-wrap', 'word-break:break-all',
      'text-align:left',
    ].join(';');
    box.textContent = `【启动诊断】共 ${BOOT_ERRORS.length} 条\n` + BOOT_ERRORS.join('\n');
    (document.body || document.documentElement).appendChild(box);
  }, 20000);
};
