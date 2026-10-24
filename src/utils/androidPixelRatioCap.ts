import { isCapacitorAndroid } from '../platform/runtime';

// src/utils/androidPixelRatioCap.ts
// 安卓 WebView 的 devicePixelRatio 通常是 3~3.5，背屏也有 2.8。
// Canvas / Pixi / Three 都按这个值分配后备缓冲，2K 屏上一张全屏画布就是几千万像素，
// 再叠背屏投屏时 GPU 带宽和显存会明显吃紧，表现为可视化掉帧、音频偶发爆音。
//
// 这里只改「画布后备分辨率」，不改 CSS 布局、不改字号：
//   - 主屏上限 2.0：2K 屏仍然清晰，像素量比 3.5 少约 2/3；
//   - 背屏上限 1.5：背屏物理 976x596，1.5 倍已经接近原生像素，足够看。
// 桌面 / 网页版不受影响。

const readCap = (): number => {
    const isRear = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('rear') === '1';
    return isRear ? 1.5 : 2;
};

export const installAndroidPixelRatioCap = (): void => {
    if (typeof window === 'undefined' || !isCapacitorAndroid()) {
        return;
    }
    const nativeRatio = window.devicePixelRatio;
    const cap = readCap();
    if (!Number.isFinite(nativeRatio) || nativeRatio <= cap) {
        return;
    }
    try {
        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            get: () => cap,
        });
    } catch {
        // 个别 WebView 不允许重定义；失败就维持原生 DPR，不影响功能。
    }
};
