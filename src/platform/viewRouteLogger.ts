import { useAppViewStore } from '../stores/useAppViewStore';

// src/platform/viewRouteLogger.ts
//
// 把当前视图打进控制台，方便远程（adb logcat）判断用户停在哪个界面。
//
// 起因：截图在这个环境里取不回来，而 App 原本不记录视图变化，导致"用户在哪个页面"
// 完全靠猜。视图状态是 zustand store（src/stores/useAppViewStore.ts），
// 直接订阅即可，不需要改动任何业务代码。

const describe = (view: string): string => {
  switch (view) {
    case 'home':
      return '主页';
    case 'player':
      return '播放页';
    case 'lattice':
      return '格子/Lattice';
    default:
      return view;
  }
};

export const installViewRouteLogger = (): void => {
  try {
    // 先打一行初始值，避免"启动后没切换过"时看不到任何信息。
    const initial = useAppViewStore.getState().view;
    console.log(`[Route] view=${initial} (${describe(initial)})`);

    let previous = initial;
    useAppViewStore.subscribe((state) => {
      if (state.view === previous) return;
      previous = state.view;
      console.log(`[Route] view=${state.view} (${describe(state.view)})`);
    });
  } catch (error) {
    console.warn('[Route] 视图日志安装失败', error);
  }
};
