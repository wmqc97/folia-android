import { useEffect } from 'react';
import { isCapacitorAndroid } from '../platform/runtime';
import { PlayerState } from '../types';
import { selectDisplayPlayerState, usePlaybackStore } from '../stores/usePlaybackStore';
import { useRearLyricsStore } from '../stores/useRearLyricsStore';

// src/hooks/useRearLyricsAutoStop.ts
// 背屏投屏的自动收尾：停止播放（暂停 / 空闲）超过 10 秒后自动结束投屏。
//
// 背屏歌词是「正在播放」的展示面：不播歌时还常驻在背屏上，既浪费电，也挡住背屏
// 自己的时钟/通知。这里只处理已经投着的情况；开始播放仍然由 useRearLyricsAutoStart 负责。
// 用户手动暂停超过 10 秒也会收掉，恢复播放后需要重新投屏（或在设置里打开「播放即自动投屏」）。

const AUTO_STOP_DELAY_MS = 10_000;

export const useRearLyricsAutoStop = (): void => {
    const playerState = usePlaybackStore(state => selectDisplayPlayerState(state));
    const projecting = useRearLyricsStore(state => state.projecting);
    const busy = useRearLyricsStore(state => state.busy);

    useEffect(() => {
        if (!isCapacitorAndroid() || !projecting || busy) {
            return;
        }
        // 正在播放就取消倒计时；暂停/空闲从这一刻起算 10 秒。
        if (playerState === PlayerState.PLAYING) {
            return;
        }
        const timer = window.setTimeout(() => {
            const store = useRearLyricsStore.getState();
            if (!store.projecting || store.busy) {
                return;
            }
            // silent：自动收尾不弹「背屏歌词已退出」的 toast，背屏关掉本身已经足够明显。
            void store.stop(true);
        }, AUTO_STOP_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [busy, playerState, projecting]);
};
