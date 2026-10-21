import { useMemo, useRef } from 'react';
import {
    hasRearLyricsNativeHost,
    installRearLyricsPushTarget,
    logRearLyrics,
    notifyRearLyricsReady,
    requestRearLyricsSnapshot,
} from '../../services/rearLyricsBridge';
import {
    usePublishedPlaybackSource,
    type PublishedPlaybackHandlers,
    type PublishedPlaybackSubscribe,
} from '../playbackStage/usePublishedPlaybackSource';

// src/components/rear/useRearLyricsSource.ts
// 背屏页的数据来源：原生 WebView 桥推下来的 config / clock / audio。
//
// 载荷形状与 OBS 源一致，所以这里只负责「把推送转成共用 hook 的回调」，
// 其余（config 去重、时钟外推、当前歌词行换算）全部复用 usePublishedPlaybackSource。

export const useRearLyricsSource = () => {
    // 原生可能在 ready() 之前就推过一帧（缓存快照），所以用 ref 保存当前回调集合，
    // 推送入口只注册一次、始终指向最新的 handlers。
    const handlersRef = useRef<PublishedPlaybackHandlers | null>(null);

    const subscribe = useMemo<PublishedPlaybackSubscribe>(() => (handlers) => {
        handlersRef.current = handlers;

        const disposePushTarget = installRearLyricsPushTarget((kind, json) => {
            const current = handlersRef.current;
            if (!current) {
                return;
            }
            try {
                const payload = JSON.parse(json);
                if (kind === 'config') current.onConfig(payload);
                else if (kind === 'clock') current.onClock(payload);
                else current.onAudio(payload);
            } catch (error) {
                logRearLyrics('背屏载荷解析失败: ' + String(error));
            }
        });

        if (hasRearLyricsNativeHost()) {
            handlers.onOpen();
            // 先告诉原生可以推了（原生会立刻补一帧缓存快照），再请主屏重发一次 config。
            notifyRearLyricsReady();
            requestRearLyricsSnapshot();
        } else {
            // 浏览器里直接打开 ?rear=1：没有原生宿主，页面只能显示等待态。
            handlers.onError();
        }

        return () => {
            handlersRef.current = null;
            disposePushTarget();
        };
    }, []);

    return usePublishedPlaybackSource(subscribe);
};