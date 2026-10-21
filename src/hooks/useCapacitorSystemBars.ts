import { useEffect } from 'react';
import { Style, StatusBar } from '@capacitor/status-bar';
import { isCapacitorAndroid } from '../platform/runtime';

// 当前文件：让 Android 系统栏跟随 Folia 明暗主题，并标记原生安全区环境。
//
// 注意：原生 MainActivity 已经在窗口层收起了系统栏（沉浸式全屏），这里必须同样调用
// StatusBar.hide()，否则 Capacitor 的 StatusBar 插件在设置 overlay/颜色时会重新把状态栏
// 显示出来，结果就是“画面没有真正全屏”。

export const useCapacitorSystemBars = (isDaylight: boolean): void => {
  useEffect(() => {
    if (!isCapacitorAndroid()) return;

    document.documentElement.dataset.runtime = 'capacitor-android';

    void (async () => {
      try {
        // 内容铺到系统栏下面，再整体收起，得到真正的全屏。
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setBackgroundColor({ color: '#00000000' });
        await StatusBar.setStyle({ style: isDaylight ? Style.Dark : Style.Light });
        await StatusBar.hide();
      } catch {
        // 系统栏操作失败不应影响播放体验，原生侧仍会兜底收起。
      }
    })();

    return () => {
      delete document.documentElement.dataset.runtime;
    };
  }, [isDaylight]);
};
