import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MotionValue } from 'framer-motion';
import VisualizerRenderer from '../visualizer/VisualizerRenderer';
import {
    resolveRearCameraTransform,
    resolveRearContentFrame,
    resolveRearContentTransform,
    type RearContentFrameInput,
} from './rearFrameGeometry';
import { NO_LYRIC_LINES } from '../../utils/lyrics/noLyricLines';
import { PlayerState, type AudioBands } from '../../types';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';

// src/components/playbackStage/RemotePlaybackStage.tsx
// 只读播放面：把一份「外部推过来的 config + 时钟 + 频谱」渲染成完整的 visualizer。
//
// OBS 浏览器源和背屏歌词页共用它，区别只有两处：
//   - OBS 在 OBS 的浏览器里铺满整屏，背景由它自己画；
//   - 背屏的背景交给调用方单独铺满整屏（renderBackground=false），
//     并且用 rearLyricsFrame 告诉它「歌词画布从哪开始、渲染中心偏多少」。
//
// 背屏构图（v6，相机平移）：
//   可视画布 = 背屏整屏 347x212，大小永远不变；
//   渲染面 = 可视区域四周各多出 overscan，visualizer 画在这块大面上；
//   centerOffset 移动的是相机取景窗在渲染面上的位置：
//     取景窗右移 = 画面内容右移，左侧仍然是大面上的内容，不会被裁成空白；
//   canvasX / canvasY 只移动可视画布，effectScale 只改内容大小。
//   背景由外层单独铺满，相机平移时可视画布和背景不动。

interface RemotePlaybackStageProps {
    config: ObsBrowserSourceConfig;
    currentTime: MotionValue<number>;
    currentLineIndex: number;
    playbackState: PlayerState;
    audioPower: MotionValue<number>;
    audioBands: AudioBands;
    /**
     * 是否由本组件自己铺背景。false 时把背景标记为 transparent 交给 shell 跳过，
     * 由调用方在外面单独渲染一层铺满屏的背景。
     */
    renderBackground?: boolean;
    /**
     * 背屏构图：歌词画布起点 + 画布内渲染中心偏移 + 效果缩放。
     *
     * <p>只有背屏会传；OBS / 主屏不传，行为与原来完全一致（画布就是视口，内容不缩放）。
     */
    rearLyricsFrame?: RearContentFrameInput & {
        /** 该效果专属的字号倍率，和 config.lyricsFontScale 叠乘；缺省 1。 */
        fontScale?: number;
    };
    /**
     * 是否按背屏版式渲染 visualizer（三行窗口、右侧可读区…）。
     *
     * <p>只有背屏页传 true；OBS 不传，主屏不走本组件。见 utils/rearRenderSurface.ts。
     */
    rearLayout?: boolean;

    className?: string;
    style?: React.CSSProperties;
}

const RemotePlaybackStage: React.FC<RemotePlaybackStageProps> = ({
    config,
    currentTime,
    currentLineIndex,
    playbackState,
    audioPower,
    audioBands,
    renderBackground = true,
    rearLyricsFrame,
    rearLayout = false,
    className = '',
    style,
}) => {
    // 背景透明时 shell 的 VisualizerBackgroundRenderer 会直接返回 null（见 backgrounds/VisualizerBackgroundRenderer.tsx），
    // 所以「不画背景」= 把 transparent 置位，不需要别的开关。
    const background = renderBackground
        ? config.background
        : { ...config.background, transparent: true };

    /*
     * 播放态抖一下（缓冲、音频焦点在别的 App 之间来回、时钟包晚到）不该让背屏在
     * 「静态场景 / 动画场景」两棵不同的树之间来回切 —— 每切一次就是一次可见的闪。
     * 只有持续 800ms 的暂停才真的转静态；恢复播放立刻转回来。
     */
    const [stablePaused, setStablePaused] = useState(playbackState !== PlayerState.PLAYING);
    useEffect(() => {
        if (playbackState === PlayerState.PLAYING) {
            setStablePaused(false);
            return undefined;
        }
        const timer = window.setTimeout(() => setStablePaused(true), 800);
        return () => window.clearTimeout(timer);
    }, [playbackState]);

    const stageRef = useRef<HTMLDivElement | null>(null);
    /*
     * 舞台尺寸只用于把「歌词画布 / 画布」的比例算成具体像素。它只在挂载和尺寸变化时更新，
     * 不参与播放时钟，所以不会引入逐帧渲染。OBS 不传 rearLyricsFrame，这个 state 一直是 0，
     * 不会产生额外的 ResizeObserver。
     */
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        if (!rearLyricsFrame) {
            return;
        }
        const element = stageRef.current;
        if (!element) {
            return;
        }
        const measure = () => {
            const width = element.clientWidth;
            const height = element.clientHeight;
            setStageSize(previous => (
                previous.width === width && previous.height === height
                    ? previous
                    : { width, height }
            ));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [rearLyricsFrame]);

    /*
     * 舞台尺寸优先用实测值；首帧 ResizeObserver 还没回调时退回 window，
     * 避免 stageSize 为 0 导致相机层完全不生效（渲染中心看起来「没反应」）。
     */
    const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const fallbackHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const stageWidth = stageSize.width > 0 ? stageSize.width : fallbackWidth;
    const stageHeight = stageSize.height > 0 ? stageSize.height : fallbackHeight;
    const contentFrame = rearLyricsFrame && stageWidth > 0 && stageHeight > 0
        ? resolveRearContentFrame({
            stageWidth,
            stageHeight,
            frame: rearLyricsFrame,
        })
        : null;
    const contentTransform = contentFrame
        ? resolveRearContentTransform({
            stageWidth,
            stageHeight,
            frame: rearLyricsFrame!,
        })
        : undefined;
    const cameraTransform = contentFrame
        ? resolveRearCameraTransform({
            stageWidth,
            stageHeight,
            frame: rearLyricsFrame!,
        })
        : undefined;
    /*
     * 效果专属字号：在背屏全局字号（已经由 RearLyricsApp 覆盖进 config.lyricsFontScale）之上
     * 再叠一档每个效果各自的倍率。主屏 / OBS 不传 rearLyricsFrame，倍率恒为 1。
     */
    const frameFontScale = Number.isFinite(rearLyricsFrame?.fontScale)
        ? Math.max(0.1, rearLyricsFrame!.fontScale as number)
        : 1;

    return (
        <div
            ref={stageRef}
            className={`overflow-hidden ${className}`.trim()}
            style={{
                ...style,
                position: 'relative',
                backgroundColor: renderBackground && !config.background?.transparent
                    ? config.theme.backgroundColor
                    : 'transparent',
                color: config.theme.primaryColor,
            }}
        >
            {/*
              * 内容层：铺满整块画布，只做「缩放 + 平移」。
              *
              * transform-origin 是画布中心，所以缩放后中心不动，再平移 canvasX/2 + centerOffset
              * 就落到歌词画布中心。缩放比例 = 歌词画布宽 / 画布宽，于是 0..347 的构图正好
              * 映射到 canvasX..347，左侧不会多出一条被裁掉的内容。
              *
              * 背景不走这一层：背屏的背景由外层单独铺满整屏（含摄像头竖带）。
              */}
            <div className="absolute inset-0" style={contentTransform}>
                {/*
                  * 渲染面：比可视区域四周各多出 overscan，visualizer 画在这块大面上。
                  * 相机平移只移动这块大面，可视区域大小和画布位置都不变；
                  * 取景窗右移时，左侧仍然是大面上的内容，不会出现空白裁切。
                  */}
                <div
                    className="absolute"
                    style={{
                        left: contentFrame?.surfaceLeft ?? 0,
                        top: contentFrame?.surfaceTop ?? 0,
                        width: contentFrame?.surfaceWidth ?? stageSize.width,
                        height: contentFrame?.surfaceHeight ?? stageSize.height,
                        ...cameraTransform,
                    }}
                >
                <VisualizerRenderer
                    mode={config.visualizerMode}
                    rearLayout={rearLayout}
                    visualizerTunings={config.visualizerTunings}
                    currentTime={currentTime}
                    currentLineIndex={currentLineIndex}
                    lines={config.lyrics?.lines ?? NO_LYRIC_LINES}
                    theme={config.theme}
                    subtitleTheme={config.subtitleTheme}
                    isDaylight={config.isDaylight}
                    audioPower={audioPower}
                    audioBands={audioBands}
                    songTitle={config.song?.name}
                    songArtist={config.songArtist}
                    songAlbum={config.songAlbum}
                    coverUrl={config.coverUrl}
                    showText={true}
                    seed={config.seed}
                    staticMode={config.staticMode}
                    paused={stablePaused}
                    visualizerOpacity={config.visualizerOpacity}
                    background={background}
                    lyricsFontScale={config.lyricsFontScale * frameFontScale}
                    subtitleFontScale={config.subtitleFontScale}
                    subtitleOverlayOpacity={config.subtitleOverlayOpacity}
                    subtitleOverlayBackground={config.subtitleOverlayBackground ?? true}
                    subtitleUpcomingLyricsBlur={config.subtitleUpcomingLyricsBlur ?? true}
                    showHarmonySubtitle={config.showHarmonySubtitle ?? true}
                    harmonySubtitleBackground={config.harmonySubtitleBackground ?? true}
                    isPlayerChromeHidden={true}
                    hideTranslationSubtitle={config.hideTranslationSubtitle}
                    showSubtitleTranslation={config.showSubtitleTranslation ?? true}
                    subtitleContentMode={config.subtitleContentMode}
                    cappellaCustomEmojiImages={config.cappellaCustomEmojiImages}
                    cappellaCustomAvatarImages={config.cappellaCustomAvatarImages}
                    monetPortraitImage={config.monetPortraitImage}
                    temperaLayerImageAssets={config.temperaLayerImageAssets}
                />
                </div>
            </div>
        </div>
    );
};

export default RemotePlaybackStage;
