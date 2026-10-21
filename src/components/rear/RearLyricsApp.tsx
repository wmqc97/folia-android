import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import RemotePlaybackStage from '../playbackStage/RemotePlaybackStage';
import VisualizerBackgroundRenderer from '../visualizer/backgrounds/VisualizerBackgroundRenderer';
import RearLyricsControls from './RearLyricsControls';
import { useRearLyricsSource } from './useRearLyricsSource';
import { PlayerState } from '../../types';
import {
    DEFAULT_REAR_SAFE_LEFT_CSS,
    resolveRearSafeLeftCss,
    sendRearLyricsCommand,
} from '../../services/rearLyricsBridge';
import { resolveRearLyricsFrame } from '../../stores/useTypographySettingsStore';
import { mergeRearLyricsVisualConfig } from '../../utils/rearLyricsVisualSettings';

// src/components/rear/RearLyricsApp.tsx
// 背屏歌词页根组件（?rear=1，由原生 RearLyricsActivity 的 WebView 加载）。
//
// 分三层，从下到上：
//   1) 背景层：铺满整屏（含左侧摄像头竖带），背景效果可以越界；
//   2) 歌词层：整屏定位，画布本身不平移、不右扩；
//      每个样式自己的 canvasX / canvasY 决定歌词画布起点，舞台把整块内容按
//      「歌词画布 / 画布」的比例缩放，再平移到画布内的渲染中心。
//      左侧 0..canvasX 仍然由背景层铺满，不会出现空条，也不会把歌词切掉；
//   3) 触控层：手势（底部上滑开面板、左右滑动切歌）、切歌控制条与上滑唤出的面板；
//      左侧竖带由原生 View 吞掉触摸，这里不需要再处理。
//
// 本组件不持有任何可写的业务状态：字号、模式都来自主屏推下来的 config，
// 改动一律发指令回主屏，主屏改完再推回来。
//
// 字号是唯一一处本地派生：主屏推来的 config 同时带 lyricsFontScale（主屏自己的）和
// rearLyricsFontScale（背屏专用的），这里只把后者覆盖到前者上再渲染，所以背屏和主屏的
// 字号可以不一样，而 config 的构建与发布仍然只有一份。

const RearLyricsApp: React.FC = () => {
    const { t } = useTranslation();
    const [safeLeftCss, setSafeLeftCss] = useState(DEFAULT_REAR_SAFE_LEFT_CSS);
    const {
        config,
        connected,
        playbackState,
        currentLineIndex,
        currentTime,
        audioPower,
        audioBands,
    } = useRearLyricsSource();

    useEffect(() => {
        document.body.style.backgroundColor = '#000';
        document.body.style.overflow = 'hidden';
        document.documentElement.style.backgroundColor = '#000';
        document.title = 'Folia 背屏歌词';
    }, []);

    // 安全带宽度依赖当前 CSS 视口宽，背屏 WebView 首次布局可能还没定下来，所以跟着 resize 重算。
    useEffect(() => {
        const update = () => setSafeLeftCss(resolveRearSafeLeftCss());
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    const handleCommand = useCallback((command: Parameters<typeof sendRearLyricsCommand>[0]) => {
        sendRearLyricsCommand(command);
    }, []);

    /**
     * 背屏渲染用的 config：主屏 config 叠加背屏独立视觉覆盖，再把背屏专用字号压到
     * lyricsFontScale 上。合并顺序与覆盖语义都在 mergeRearLyricsVisualConfig 里，
     * 背屏页只负责拿合并结果渲染。
     */
    const rearConfig = useMemo(() => {
        if (!config) return null;
        return mergeRearLyricsVisualConfig(config, config.rearLyricsVisual);
    }, [config]);

    /*
     * 当前效果的构图：canvasX / canvasY（歌词画布起点）、centerOffset（画布内渲染中心）、
     * fontScale / effectScale（字号与效果大小）。每个 visualizer 模式各存一份，
     * 主屏 useTypographySettingsStore.handleSetRearLyricsFrame 写，随 config 推下来。
     *
     * canvasX / canvasY 是画布位置，默认 0 = 屏幕左/上缘（含左侧摄像头区域）；
     * centerOffset 0 = 画布中心，负数往左/上。舞台不再按摄像头宽度自动右推内容。
     */
    const rearLyricsFrame = useMemo(() => {
        const frames = rearConfig?.rearLyricsFrames;
        const mode = rearConfig?.visualizerMode;
        if (!mode) {
            return undefined;
        }
        return resolveRearLyricsFrame(mode, frames?.[mode]);
    }, [rearConfig?.rearLyricsFrames, rearConfig?.visualizerMode]);

    const theme = rearConfig?.theme;

    /*
     * 控制层 / 空态的左边界：仍然用原生实测的摄像头竖带宽度。
     *
     * 全局的 rearLyricsSafeLeftCss 已不再参与歌词排版（左侧规避改成每个样式自己的 canvasX），
     * 这里只服务控制条与面板，避免它们压到摄像头。
     */
    const effectiveSafeLeftCss = safeLeftCss;

    return (
        <div
            className="fixed inset-0 overflow-hidden"
            style={{
                backgroundColor: theme?.backgroundColor ?? '#000',
                color: theme?.primaryColor ?? '#e5e7eb',
            }}
        >
            {/* 背景层：铺满整屏，可以压到左侧摄像头竖带下面 */}
            {rearConfig && (
                <div className="absolute inset-0">
                    <VisualizerBackgroundRenderer
                        config={rearConfig.background}
                        theme={rearConfig.theme}
                        isDaylight={rearConfig.isDaylight}
                        coverUrl={rearConfig.coverUrl}
                        audioPower={audioPower}
                        audioBands={audioBands}
                        seed={rearConfig.seed}
                        staticMode={rearConfig.staticMode}
                        paused={playbackState !== PlayerState.PLAYING}
                    />
                </div>
            )}

            {/*
              * 歌词层：整屏定位。画布本身不动，舞台内部按当前样式的 canvasX / canvasY
              * 把内容整体缩放并平移到歌词画布，左侧摄像头带继续由背景层铺满。
              */}
            <div className="absolute inset-0">
                {rearConfig ? (
                    <RemotePlaybackStage
                        config={rearConfig}
                        currentTime={currentTime}
                        currentLineIndex={currentLineIndex}
                        playbackState={playbackState}
                        audioPower={audioPower}
                        audioBands={audioBands}
                        renderBackground={false}
                        rearLyricsFrame={rearLyricsFrame}
                        style={{ height: '100%' }}
                    />
                ) : (
                    <div
                        className="h-full grid place-items-center text-center text-[11px] text-white/45 px-3"
                        // 空态也要和舞台同宽：右侧可见区，不含左侧摄像头竖带。
                        style={{ marginLeft: effectiveSafeLeftCss, width: `calc(100% - ${effectiveSafeLeftCss}px)` }}
                    >
                        {connected
                            ? t('rear.waitingForPlayback', '等待主屏推送歌词…')
                            : t('rear.waitingForHost', '背屏通道未连接')}
                    </div>
                )}
            </div>

            <RearLyricsControls
                config={rearConfig}
                playbackState={playbackState}
                currentLineIndex={currentLineIndex}
                safeLeftCss={effectiveSafeLeftCss}
                onCommand={handleCommand}
            />
        </div>
    );
};

export default RearLyricsApp;
