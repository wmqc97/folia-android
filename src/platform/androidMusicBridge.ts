import { isCapacitorAndroid } from './runtime';

// src/platform/androidMusicBridge.ts
//
// 安卓本地音乐导入桥（前端侧）。
//
// Folia 的本地曲库整套建立在浏览器 File System Access API 上：
// `window.showDirectoryPicker()` 返回 FileSystemDirectoryHandle，再用 handle.getFile() 拿 File。
// 但 Android WebView 没有这套 API，所以"导入文件夹"在手机上点了没反应。
//
// 这里不改造业务代码，而是**把这套 API 模拟出来**：
//   - Java 侧 LocalMusicBridge 用 SAF 选目录，把音频拷进 filesDir/local-music，
//     再把清单通过 window.__foliaOnMusicFolderPicked 回调过来
//   - 本地 Node 服务（nodejs-project/index.js 的 3101）用 HTTP 提供这些文件
//   - 本文件把清单包装成 FileSystemFileHandle 的形状，getFile() 走 HTTP 取字节
// 这样 localMusicService 一行都不用改。

/** 本地 Node 文件服务的地址。 */
const LOCAL_MUSIC_BASE = 'http://127.0.0.1:3101/local/';

interface BridgeFileItem {
  name: string;
  relativePath: string;
  storedName: string;
  size: number;
  lastModified: number;
}

interface BridgePayload {
  status?: string;
  message?: string;
  files?: BridgeFileItem[];
}

type PickResolver = (payload: BridgePayload) => void;

const pickFromBridge = (): Promise<BridgePayload> => {
  const api = (window as typeof window & { FoliaMusic?: { pickFolder: () => void } }).FoliaMusic;
  if (!api) {
    return Promise.resolve({ status: 'error', message: 'FoliaMusic bridge 不可用' });
  }
  return new Promise<BridgePayload>((resolve) => {
    let settled = false;
    const finish = (payload: BridgePayload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    // Java 侧会调用这个全局函数把结果送回来。
    (window as typeof window & { __foliaOnMusicFolderPicked?: (json: string) => void })
      .__foliaOnMusicFolderPicked = (json: string) => {
      try {
        finish(JSON.parse(json) as BridgePayload);
      } catch {
        finish({ status: 'error', message: '回调数据解析失败' });
      }
    };
    api.pickFolder();
  });
};

const makeFileHandle = (item: BridgeFileItem) => ({
  kind: 'file' as const,
  name: item.name,
  getFile: async (): Promise<File> => {
    const response = await fetch(`${LOCAL_MUSIC_BASE}${encodeURIComponent(item.storedName)}`);
    if (!response.ok) {
      throw new Error(`读取本地音频失败：${response.status}`);
    }
    const blob = await response.blob();
    return new File([blob], item.name, {
      type: blob.type || 'audio/mpeg',
      lastModified: item.lastModified || Date.now(),
    });
  },
});

const makeDirHandle = (files: BridgeFileItem[]) => ({
  kind: 'directory' as const,
  name: '本地音乐',
  // localMusicService 用 `for await (const entry of dirHandle.values())` 遍历。
  values: () => {
    let index = 0;
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => (
          index < files.length
            ? { value: makeFileHandle(files[index++]), done: false }
            : { value: undefined, done: true }
        ),
      }),
    };
  },
});

export const installAndroidMusicBridge = (): void => {
  if (typeof window === 'undefined') return;
  if (!isCapacitorAndroid()) return;
  if (typeof window.showDirectoryPicker === 'function') return;

  // 用 any 写，因为 File System Access API 不在标准 TS 定义里。
  const target = window as unknown as Record<string, unknown>;

  target.showDirectoryPicker = async () => {
    const payload = await pickFromBridge();
    if (payload.status !== 'ok') {
      const error = new Error(payload.message || '已取消');
      // 用户取消要给 AbortError，业务代码通常据此静默返回。
      error.name = payload.status === 'cancelled' ? 'AbortError' : 'NotAllowedError';
      throw error;
    }
    return makeDirHandle(payload.files || []);
  };

  // localLibraryAvailability 还会检查 navigator.storage.getDirectory，一并补上，
  // 否则本地曲库仍会被判成不可用。
  // 注意：Android WebView 里 **navigator.storage 本身可能就是 undefined**，
  // 那种情况下必须整个属性补出来（它是只读 getter，得用 defineProperty）。
  const nav = navigator as Navigator & { storage?: Record<string, unknown> };
  try {
    if (!nav.storage) {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {},
      });
    }
    if (typeof nav.storage?.getDirectory !== 'function') {
      (nav.storage as Record<string, unknown>).getDirectory = async () => makeDirHandle([]);
    }
  } catch (error) {
    console.warn('[AndroidMusicBridge] 补 navigator.storage 失败', error);
  }

  // 诊断日志：这些会出现在 logcat 的 Capacitor/Console 里，方便远程排查。
  console.info(
    '[AndroidMusicBridge] 已安装'
      + ' bridge=' + (typeof (target.FoliaMusic as { pickFolder?: unknown } | undefined)?.pickFolder === 'function')
      + ' picker=' + (typeof target.showDirectoryPicker === 'function')
      + ' storageDir=' + (typeof nav.storage?.getDirectory === 'function'),
  );
};
