import { useEffect, useRef } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import { RearProjection, isRearProjectionAvailable } from '../platform/rearProjection';
import type { RearLyricsCommand, RearLyricsSettingsPatch } from '../services/rearLyricsBridge';
import type { Theme, VisualizerBackgroundMode } from '../types';

// src/hooks/useRearLyricsHostActions.ts
// 主屏侧的背屏指令接收端。
//
// 背屏只发意图，主屏是唯一真源：切歌、暂停、seek、换效果模式、改歌词字号全部落到主屏的
// store / handler 上，改完由发布器推回背屏。这样背屏不会出现「本地改了但主屏没改」的分叉。
//
// 回调放在 ref 里，监听只注册一次；否则 App 每次重渲染都要重新 addListener。

export interface RearLyricsHostActions {
    next: () => void;
    prev: () => void;
    togglePlay: () => void;
    /** 参数是秒。 */
    seek: (timeSec: number) => void;
    /** 只接受注册表里存在的模式，非法值由调用方过滤。 */
    setVisualizerMode: (mode: string) => void;
    setLyricsFontScale: (scale: number) => void;
    /** 背屏设置面板提交的设置补丁，由调用方落到各 store 的 handler 上。 */
    applySettings: (patch: RearLyricsSettingsPatch) => void;
    /** 背屏页 ready / 恢复：请求主屏强制重发一份当前 config。 */
    requestSnapshot: () => void;
    /** 背屏「控制」页：拖动中的音量预览（只改输出增益，不写 store）。 */
    previewVolume: (value: number) => void;
    /** 背屏「控制」页：音量落定（写 store 与本地存储）。 */
    setVolume: (value: number) => void;
    toggleMute: () => void;
    toggleLoopMode: () => void;
    setLoopMode: (mode: 'off' | 'all' | 'one') => void;
    toggleLike: () => void;
    toggleAutomix: () => void;
    openAudioEqualizer: () => void;
    openVisualizerSettings: () => void;
    openBackgroundSettings: () => void;
    /** 在主屏打开「背屏歌词样式」专属页（逐个效果调边界与字号）。 */
    openRearLyricsStyleSettings: () => void;
    setBackgroundMode: (mode: VisualizerBackgroundMode) => void;
    setTheme: (theme: Theme) => void;
    /** 背屏「列表」页：播放队列里第 index 首（主屏按自己那份 playQueue 解析）。 */
    playQueueIndex: (index: number) => void;
    removeQueueSong: (index: number) => void;
    moveQueueSongToNext: (index: number) => void;
    moveQueueSongToEnd: (index: number) => void;
    shuffleQueue: () => void;
}

export const useRearLyricsHostActions = (actions: RearLyricsHostActions): void => {
    const actionsRef = useRef(actions);
    actionsRef.current = actions;

    useEffect(() => {
        if (!isRearProjectionAvailable()) {
            return;
        }

        let disposed = false;
        let handle: PluginListenerHandle | null = null;

        void RearProjection.addListener('command', payload => {
            let command: RearLyricsCommand;
            try {
                command = JSON.parse(payload.json) as RearLyricsCommand;
            } catch {
                return;
            }

            const current = actionsRef.current;
            switch (command.type) {
                case 'next':
                    current.next();
                    break;
                case 'prev':
                    current.prev();
                    break;
                case 'togglePlay':
                    current.togglePlay();
                    break;
                case 'seek':
                    if (Number.isFinite(command.time)) {
                        current.seek(command.time);
                    }
                    break;
                case 'setVisualizerMode':
                    current.setVisualizerMode(command.mode);
                    break;
                case 'setLyricsFontScale':
                    if (Number.isFinite(command.value)) {
                        current.setLyricsFontScale(command.value);
                    }
                    break;
                case 'applySettings':
                    if (command.patch && typeof command.patch === 'object') {
                        current.applySettings(command.patch);
                    }
                    break;
                case 'requestSnapshot':
                    current.requestSnapshot();
                    break;
                case 'previewVolume':
                    if (Number.isFinite(command.value)) {
                        current.previewVolume(command.value);
                    }
                    break;
                case 'setVolume':
                    if (Number.isFinite(command.value)) {
                        current.setVolume(command.value);
                    }
                    break;
                case 'toggleMute':
                    current.toggleMute();
                    break;
                case 'toggleLoopMode':
                    current.toggleLoopMode();
                    break;
                case 'setLoopMode':
                    current.setLoopMode(command.mode);
                    break;
                case 'toggleLike':
                    current.toggleLike();
                    break;
                case 'toggleAutomix':
                    current.toggleAutomix();
                    break;
                case 'openAudioEqualizer':
                    current.openAudioEqualizer();
                    break;
                case 'openVisualizerSettings':
                    current.openVisualizerSettings();
                    break;
                case 'openBackgroundSettings':
                    current.openBackgroundSettings();
                    break;
                case 'openRearLyricsStyleSettings':
                    current.openRearLyricsStyleSettings();
                    break;
                case 'setBackgroundMode':
                    current.setBackgroundMode(command.mode);
                    break;
                case 'setTheme':
                    if (command.theme && typeof command.theme === 'object') {
                        current.setTheme(command.theme);
                    }
                    break;
                case 'playQueueIndex':
                    if (Number.isInteger(command.index)) {
                        current.playQueueIndex(command.index);
                    }
                    break;
                case 'removeQueueSong':
                    if (Number.isInteger(command.index)) {
                        current.removeQueueSong(command.index);
                    }
                    break;
                case 'moveQueueSongToNext':
                    if (Number.isInteger(command.index)) {
                        current.moveQueueSongToNext(command.index);
                    }
                    break;
                case 'moveQueueSongToEnd':
                    if (Number.isInteger(command.index)) {
                        current.moveQueueSongToEnd(command.index);
                    }
                    break;
                case 'shuffleQueue':
                    current.shuffleQueue();
                    break;
                default:
                    // exit 等指令由原生直接处理，不会走到这里。
                    break;
            }
        }).then(nextHandle => {
            if (disposed) {
                void nextHandle.remove();
                return;
            }
            handle = nextHandle;
        }).catch(() => undefined);

        return () => {
            disposed = true;
            void handle?.remove();
        };
    }, []);
};
