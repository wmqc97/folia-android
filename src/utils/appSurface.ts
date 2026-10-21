// src/utils/appSurface.ts
// Which root this window mounts, decided once from the URL. bootstrap.tsx picks the React root with
// it; features that only make sense in the main app window (the video layer, mod clients) read the
// same answer instead of re-parsing the URL.

const searchParams = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

export const isObsBrowserSourceSurface = typeof window !== 'undefined'
    && (searchParams.get('obs') === '1' || window.location.pathname === '/obs');

export const obsSourceKind = searchParams.get('obsSource');

export const isRemoteControlSurface = !isObsBrowserSourceSurface && searchParams.get('remote') === '1';

// 背屏歌词页：由原生 RearLyricsActivity 的 WebView 加载 `?rear=1`。
// 它不是主界面，必须排在 isMainAppSurface 之前判定，否则 mod / 视频层 / 播放器都会在背屏再跑一份。
export const isRearLyricsSurface = typeof window !== 'undefined' && searchParams.get('rear') === '1';

export const isMainAppSurface = typeof window !== 'undefined'
    && !isObsBrowserSourceSurface
    && !isRemoteControlSurface
    && !isRearLyricsSurface;
