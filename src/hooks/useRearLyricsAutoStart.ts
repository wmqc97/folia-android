import { useEffect } from 'react';
import { PlayerState } from '../types';
import { isRearProjectionAvailable } from '../platform/rearProjection';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useRearLyricsStore } from '../stores/useRearLyricsStore';

// src/hooks/useRearLyricsAutoStart.ts
// 「播放歌曲就自动投到背屏」的触发器。
//
// 设置卡片里的开关（useRearLyricsStore.autoStartOnPlayback）打开后，只要主屏开始播放一首歌、
// 背屏还没在投、且特权通道可用，就自动调一次 start()。判断条件全部从 store 现读，
// 不在这个 hook 里复制投屏状态，避免出现第二份真相。
//
// 只在「开始播放」这一个时刻触发：暂停再播放会重新触发（用户可能手动退出过），
// 但单纯的暂停、切歌不会重复投屏。投屏失败也不会在这里重试——重试交给用户或下一次播放。

export const useRearLyricsAutoStart = (): void => {
    const autoStartOnPlayback = useRearLyricsStore(state => state.autoStartOnPlayback);
    const playerState = usePlaybackStore(state => state.playerState);
    const hasTrack = usePlaybackStore(state => Boolean(state.currentSong));

    useEffect(() => {
        if (!autoStartOnPlayback || !hasTrack || playerState !== PlayerState.PLAYING) {
            return;
        }
        if (!isRearProjectionAvailable()) {
            return;
        }

        const { supported, privileged, projecting, busy, start } = useRearLyricsStore.getState();
        if (!supported || !privileged || projecting || busy) {
            return;
        }
        void start();
    }, [autoStartOnPlayback, hasTrack, playerState]);
};
