import { useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValue, type MotionValue } from 'framer-motion';
import { PlayerState, type AudioBands } from '../../types';
import type {
    ObsBrowserSourceAudio,
    ObsBrowserSourceClock,
    ObsBrowserSourceConfig,
} from '../../types/obsBrowserSource';
import { findLatestActiveLineIndex } from '../../utils/appPlaybackHelpers';
import { buildObsBrowserSourceConfigSignature, resolveObsBrowserSourceClockTime } from '../../utils/obsBrowserSource';

// src/components/playbackStage/usePublishedPlaybackSource.ts
// 「被外部推着走的只读播放面」的状态机：OBS 浏览器源和背屏歌词页共用。
//
// 两边的数据来源不同（OBS 走 SSE，背屏走原生 WebView 桥），但收到的载荷完全同构，
// 之后的处理一模一样：config 按签名去重、clock 存引用并外推、audio 直接写进 motion value，
// 再用一个 rAF 循环把外推出来的播放时间换算成当前歌词行。这段逻辑只写一次。

const EMPTY_SPECTRUM = new Uint8Array(0);

/** 订阅回调集合；四个 on* 都必须在同一个 tick 内返回，不能阻塞。 */
export interface PublishedPlaybackHandlers {
    onOpen: () => void;
    onError: () => void;
    onConfig: (config: ObsBrowserSourceConfig) => void;
    onClock: (clock: ObsBrowserSourceClock) => void;
    onAudio: (audio: ObsBrowserSourceAudio) => void;
}

/**
 * 订阅函数，返回取消订阅。
 *
 * <p>必须是稳定引用（调用方用 useCallback / useMemo 固定），否则每次渲染都会重新订阅。
 */
export type PublishedPlaybackSubscribe = (handlers: PublishedPlaybackHandlers) => () => void;

export interface PublishedPlaybackSource {
    config: ObsBrowserSourceConfig | null;
    connected: boolean;
    playbackState: PlayerState;
    currentLineIndex: number;
    currentTime: MotionValue<number>;
    audioPower: MotionValue<number>;
    audioBands: AudioBands;
}

export const usePublishedPlaybackSource = (
    subscribe: PublishedPlaybackSubscribe,
): PublishedPlaybackSource => {
    const [config, setConfig] = useState<ObsBrowserSourceConfig | null>(null);
    const [connected, setConnected] = useState(false);
    const [currentLineIndex, setCurrentLineIndex] = useState(-1);
    const [playbackState, setPlaybackState] = useState<PlayerState>(PlayerState.IDLE);
    const currentLineIndexRef = useRef(-1);
    const clockRef = useRef<ObsBrowserSourceClock | null>(null);
    const configRef = useRef<ObsBrowserSourceConfig | null>(null);
    const configSignatureRef = useRef<string | null>(null);
    const currentTime = useMotionValue(0);
    const audioPower = useMotionValue(0);
    const bass = useMotionValue(0);
    const lowMid = useMotionValue(0);
    const mid = useMotionValue(0);
    const vocal = useMotionValue(0);
    const treble = useMotionValue(0);
    const spectrum = useMotionValue(EMPTY_SPECTRUM);
    const audioBands = useMemo(() => ({
        bass,
        lowMid,
        mid,
        vocal,
        treble,
        spectrum,
    }), [bass, lowMid, mid, spectrum, treble, vocal]);

    useEffect(() => {
        configRef.current = config;
    }, [config]);

    useEffect(() => subscribe({
        onOpen: () => setConnected(true),
        onError: () => setConnected(false),
        onConfig: nextConfig => {
            const nextSignature = buildObsBrowserSourceConfigSignature(nextConfig);
            if (nextSignature === configSignatureRef.current) return;
            configSignatureRef.current = nextSignature;
            setConfig(nextConfig);
        },
        onClock: nextClock => {
            clockRef.current = nextClock;
            setPlaybackState(prev => (prev === nextClock.playerState ? prev : nextClock.playerState));
        },
        onAudio: nextAudio => {
            audioPower.set(nextAudio.audioPower);
            bass.set(nextAudio.bands.bass);
            lowMid.set(nextAudio.bands.lowMid);
            mid.set(nextAudio.bands.mid);
            vocal.set(nextAudio.bands.vocal);
            treble.set(nextAudio.bands.treble);
            spectrum.set(new Uint8Array(nextAudio.spectrum));
        },
    }), [subscribe, audioPower, bass, lowMid, mid, spectrum, treble, vocal]);

    useEffect(() => {
        let frameId = 0;
        const tick = () => {
            const lyricTime = resolveObsBrowserSourceClockTime(clockRef.current);
            currentTime.set(lyricTime);

            const lines = configRef.current?.lyrics?.lines ?? [];
            const nextLineIndex = lines.length > 0 ? findLatestActiveLineIndex(lines, lyricTime) : -1;
            if (nextLineIndex !== currentLineIndexRef.current) {
                currentLineIndexRef.current = nextLineIndex;
                setCurrentLineIndex(nextLineIndex);
            }

            frameId = window.requestAnimationFrame(tick);
        };

        frameId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frameId);
    }, [currentTime]);

    return {
        config,
        connected,
        playbackState,
        currentLineIndex,
        currentTime,
        audioPower,
        audioBands,
    };
};