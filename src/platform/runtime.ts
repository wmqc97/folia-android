import { Capacitor } from '@capacitor/core';

// 当前文件：统一描述 Web、Electron 与 Capacitor Android 的运行时能力。

export type RuntimeEnvironment = 'web' | 'electron' | 'capacitor-android';

export const hasElectronBridge = (): boolean => (
  typeof window !== 'undefined'
  && Boolean((window as typeof window & { electron?: unknown }).electron)
);

export const isCapacitorAndroid = (): boolean => (
  typeof window !== 'undefined'
  && Capacitor.isNativePlatform()
  && Capacitor.getPlatform() === 'android'
);

export const getRuntimeEnvironment = (): RuntimeEnvironment => {
  // 电容端优先判定：为了在安卓上跑通波点音源，我们会往 window.electron 上注入一个
  // bodianRequest 桥（见 capacitorBodianBridge.ts）。如果先判 Electron，这里会被误判成桌面端，
  // 导致安全区、系统栏、本地音乐入口等一堆电容端行为失效。
  if (isCapacitorAndroid()) return 'capacitor-android';
  if (hasElectronBridge()) return 'electron';
  return 'web';
};

// 安卓端由 androidMusicBridge.ts 用 SAF 桥模拟了这套 API，所以不再是 false。
// 实际可用性以 localLibraryAvailability 的探测结果为准。
export const supportsLocalMusicImport = (): boolean => true;
