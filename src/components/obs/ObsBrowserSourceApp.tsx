import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import RemotePlaybackStage from '../playbackStage/RemotePlaybackStage';
import { usePublishedPlaybackSource, type PublishedPlaybackSubscribe } from '../playbackStage/usePublishedPlaybackSource';

// src/components/obs/ObsBrowserSourceApp.tsx
// Read-only OBS browser source renderer driven by Folia's main playback clock.
//
// 数据通道是 Electron 主进程转发的 SSE（/obs/events），渲染本身交给共用的 RemotePlaybackStage。
// 本文件只剩两件 OBS 特有的事：透明页面样式，以及把视口伪造成 1920x1080 再整体缩放。

const buildEventSourceUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') ?? '';
    const devPort = params.get('obsPort');
    const baseUrl = devPort ? `http://127.0.0.1:${devPort}` : window.location.origin;
    const url = new URL('/obs/events', baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
};

const ObsBrowserSourceApp: React.FC = () => {
    const { t } = useTranslation();
    const [obsScale, setObsScale] = useState(1);
    const [obsDimensions, setObsDimensions] = useState({ width: '100vw', height: '100vh' });

    useEffect(() => {
        document.body.style.backgroundColor = 'transparent';
        document.documentElement.style.backgroundColor = 'transparent';
        document.body.style.overflow = 'hidden';
        document.title = 'Folia OBS';
    }, []);

    useEffect(() => {
        let isHandlingResize = false;

        const handleResize = () => {
            if (isHandlingResize) return;
            isHandlingResize = true;

            try {
                const isPortrait = window.innerHeight > window.innerWidth;
                const baseWidth = isPortrait ? 1080 : 1920;

                // Read the physical dimensions from documentElement to avoid infinite loops when mocking innerWidth
                const realWidth = window.document.documentElement.clientWidth;
                const realHeight = window.document.documentElement.clientHeight;

                const scale = Math.max(1, realWidth / baseWidth);
                setObsScale(scale);
                setObsDimensions({
                    width: `${realWidth / scale}px`,
                    height: `${realHeight / scale}px`
                });

                // Globally override devicePixelRatio and window size for the OBS browser source.
                // This forces all child components to naturally render and layout exactly
                // as if they were in a 1920x1080 screen, while natively maintaining 4K text rasterization.
                try {
                    Object.defineProperty(window, 'devicePixelRatio', { get: () => scale, configurable: true });
                    Object.defineProperty(window, 'innerWidth', { get: () => realWidth / scale, configurable: true });
                    Object.defineProperty(window, 'innerHeight', { get: () => realHeight / scale, configurable: true });
                } catch {
                    // Ignore
                }

                // Force an event so any visualizer that caches window dimensions updates to the mocked size
                if (scale > 1.0) {
                    window.dispatchEvent(new Event('resize'));
                }
            } finally {
                isHandlingResize = false;
            }
        };
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // SSE 订阅只建一次：载荷处理（config 去重 / 时钟外推 / 频谱写入）都在共用 hook 里。
    const subscribe = useMemo<PublishedPlaybackSubscribe>(() => (handlers) => {
        const eventSource = new EventSource(buildEventSourceUrl());

        eventSource.onopen = () => handlers.onOpen();
        eventSource.onerror = () => handlers.onError();
        eventSource.addEventListener('config', event => {
            handlers.onConfig(JSON.parse((event as MessageEvent).data));
        });
        eventSource.addEventListener('clock', event => {
            handlers.onClock(JSON.parse((event as MessageEvent).data));
        });
        eventSource.addEventListener('audio', event => {
            handlers.onAudio(JSON.parse((event as MessageEvent).data));
        });

        return () => {
            eventSource.close();
        };
    }, []);

    const {
        config,
        connected,
        playbackState,
        currentLineIndex,
        currentTime,
        audioPower,
        audioBands,
    } = usePublishedPlaybackSource(subscribe);

    if (!config) {
        return (
            <div className="h-screen w-screen bg-transparent grid place-items-center text-white/70 text-sm">
                {connected ? t('obs.waitingForPlayback', 'Waiting for Folia playback') : t('obs.connecting', 'Connecting to Folia')}
            </div>
        );
    }

    return (
        <RemotePlaybackStage
            config={config}
            currentTime={currentTime}
            currentLineIndex={currentLineIndex}
            playbackState={playbackState}
            audioPower={audioPower}
            audioBands={audioBands}
            style={{
                width: obsDimensions.width,
                height: obsDimensions.height,
                zoom: obsScale,
            }}
        />
    );
};

export default ObsBrowserSourceApp;