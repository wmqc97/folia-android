import { useEffect, useMemo, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import {
    RearProjection,
    isRearProjectionAvailable,
    publishRearSnapshot,
} from '../platform/rearProjection';
import type { ObsBrowserSourcePublishTransport } from './useObsBrowserSourcePublisher';
import { useRearLyricsStore } from '../stores/useRearLyricsStore';

// src/hooks/useRearLyricsTransport.ts
// 主屏侧的背屏通道：告诉发布器「背屏在不在线」，并提供一条把载荷推给背屏 WebView 的传输层。
//
// 背屏在线与否只由原生事件决定（背屏页 JS 调 ready() 时原生上报 active=true，
// 页面开始加载或 Activity 销毁时上报 false）。主屏不猜、不轮询。

export interface RearLyricsTransportState {
    /** 背屏歌词页是否在线；在线时发布器要持续推 config / clock / audio。 */
    active: boolean;
    /** 推给背屏 WebView 的传输层；非安卓原生环境下是 null。 */
    transport: ObsBrowserSourcePublishTransport | null;
}

export const useRearLyricsTransport = (): RearLyricsTransportState => {
    const [active, setActive] = useState(false);
    /*
     * store 里的 active / projecting 是另一条独立的状态来源：
     * - active：背屏页 JS 已 ready；
     * - projecting：原生任务还在背屏上（页面可能正在重载）。
     *
     * 只要任务还在，就把 config 继续推给原生缓存；页面 ready 后补推的就是最新设置，
     * 不会出现「主屏改了参数、背屏重载后拿到的还是旧快照」。
     */
    const storeActive = useRearLyricsStore(state => state.active);
    const storeProjecting = useRearLyricsStore(state => state.projecting);

    useEffect(() => {
        if (!isRearProjectionAvailable()) {
            return;
        }

        let disposed = false;
        let handle: PluginListenerHandle | null = null;

        void RearProjection.addListener('rearState', payload => {
            if (!disposed) {
                setActive(payload.active);
            }
        }).then(nextHandle => {
            if (disposed) {
                void nextHandle.remove();
                return;
            }
            handle = nextHandle;
        }).catch(() => undefined);

        // 首帧兜底：投屏任务已经在背屏上时，即使 ready() 事件早于本监听注册，也要先当作在线。
        void RearProjection.getStatus().then(status => {
            if (!disposed && status.projecting) {
                setActive(true);
            }
        }).catch(() => undefined);

        return () => {
            disposed = true;
            void handle?.remove();
        };
    }, []);

    const transport = useMemo<ObsBrowserSourcePublishTransport | null>(() => {
        if (!isRearProjectionAvailable()) {
            return null;
        }
        return {
            publishConfig: config => publishRearSnapshot({ kind: 'config', json: JSON.stringify(config) }),
            publishClock: clock => publishRearSnapshot({ kind: 'clock', json: JSON.stringify(clock) }),
            publishAudio: audio => publishRearSnapshot({ kind: 'audio', json: JSON.stringify(audio) }),
        };
    }, []);

    return { active: active || storeActive || storeProjecting, transport };
};