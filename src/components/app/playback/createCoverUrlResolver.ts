import type { SongResult } from '../../../types';
import { getSongCoverUrl } from '../../../services/onlineMusic/songMetadata';
import { toSafeRemoteUrl } from '../../../utils/appPlaybackHelpers';

// src/components/app/playback/createCoverUrlResolver.ts

// ---------------------------------------------------------------------------
// 「粘性封面」：解决切歌/换画面时封面闪一下的问题。
//
// 原实现直接返回目标 URL（在线歌曲就是远程 URL）。当目标从上一首变成下一首时，
// <img> 的 src 被替换，浏览器会**先清空旧图再去加载新图**，中间必然出现一帧空白 ——
// 这就是肉眼看到的"闪一闪"。
//
// 做法：记住"上一张已经显示成功的封面"，在新封面预加载完成之前继续返回它。
// 预加载完成后把记录更新为新图；下次重渲染（播放中时间轴一直在 tick，所以很快就来）
// 就能直接从浏览器缓存里瞬时拿到新图，不再有空白帧。
// ---------------------------------------------------------------------------

/** 最近一次已确认可用的封面（含本地缓存生成的 blob: URL）。 */
let lastGoodCoverUrl: string | null = null;

/** 正在后台预加载的 URL，避免同一张图反复触发预加载。 */
let pendingCoverUrl: string | null = null;

const isPreloadable = (url: string): boolean => (
    url.startsWith('blob:') === false && url.startsWith('data:') === false
);

const preload = (url: string): void => {
    if (typeof Image === 'undefined') {
        lastGoodCoverUrl = url;
        pendingCoverUrl = null;
        return;
    }
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
        lastGoodCoverUrl = url;
        pendingCoverUrl = null;
    };
    image.onerror = () => {
        // 加载失败就把控制权交回新目标，免得一直卡在旧图上。
        lastGoodCoverUrl = url;
        pendingCoverUrl = null;
    };
    image.src = url;
};

const resolveStickyCoverUrl = (target: string | null): string | null => {
    if (!target) {
        // 没有目标（例如当前歌没有封面）时沿用上一张，避免突然变空白。
        return lastGoodCoverUrl;
    }
    if (target === lastGoodCoverUrl) {
        return lastGoodCoverUrl;
    }
    // blob:/data: 是本地即时可用的，直接采用无需预加载。
    if (!isPreloadable(target)) {
        lastGoodCoverUrl = target;
        pendingCoverUrl = null;
        return target;
    }
    if (target !== pendingCoverUrl) {
        pendingCoverUrl = target;
        preload(target);
    }
    // 新图还在加载 —— 先继续显示上一张，避免空白帧。
    return lastGoodCoverUrl ?? target;
};

// Resolves the effective cover URL by preferring the cached cover over remote metadata.
export const createCoverUrlResolver = (
    cachedCoverUrl: string | null,
    currentSong: SongResult | null,
) => {
    return () => {
        const target = cachedCoverUrl
            || toSafeRemoteUrl(getSongCoverUrl(currentSong) || null)
            || null;
        return resolveStickyCoverUrl(target);
    };
};
