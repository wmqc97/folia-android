import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMotionValue, useMotionValueEvent } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react';
import type { Theme, VisualizerMode } from '../../types';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import VisualizerRenderer from '../visualizer/VisualizerRenderer';
import VisualizerBackgroundRenderer from '../visualizer/backgrounds/VisualizerBackgroundRenderer';
import { setStageViewportOverride } from '../visualizer/stageViewport';
import {
    resolveRearCameraTransform,
    resolveRearContentFrame,
    resolveRearContentTransform,
    type RearContentFrameInput,
} from '../playbackStage/rearFrameGeometry';
import { findPreviewPlaceholderLineIndex, VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS } from '../visualizer/PreviewPlaceholder';
import { useVisPlaygroundPreviewPlayback } from '../visualizer/useVisPlaygroundPreviewPlayback';

// src/components/rear/RearLyricsStylePreview.tsx
// 「背屏歌词样式」窗口里的实时预览：一块真实的 347x212 背屏，再整体缩放到窗口宽度。
//
// 预览和真机共用同一份几何（rearFrameGeometry.resolveRearContentTransform）与同一个舞台视口：
//   - 内容按 347x212 排版，和背屏 WebView 的 CSS 视口完全一致；
//   - 画布本身不缩放，只有外层把 347 缩到预览宽度，所以「窗口里看到的位置」就是背屏上的位置；
//   - 左侧摄像头带只作为半透明遮罩画出来，不参与内容排版。

/** 背屏真实比例 976x596。 */
const REAR_SCREEN_ASPECT = 976 / 596;
/** 背屏 CSS 视口（小米 17 Pro Max 实测）。 */
const REAR_STAGE_WIDTH = 347;
const REAR_STAGE_HEIGHT = 212;

export interface RearLyricsStylePreviewFrame extends RearContentFrameInput {
    /** 该效果专属字号倍率。 */
    fontScale: number;
}

interface RearLyricsStylePreviewProps {
    config: ObsBrowserSourceConfig;
    theme: Theme;
    isDaylight: boolean;
    /** 摄像头竖带宽度（CSS px），只用于画左侧遮罩。 */
    safeLeftCss: number;
    /** 当前效果的构图。 */
    frame: RearLyricsStylePreviewFrame;
    visualizerMode: VisualizerMode;
}

const RearLyricsStylePreview: React.FC<RearLyricsStylePreviewProps> = ({
    config,
    theme,
    isDaylight,
    safeLeftCss,
    frame,
    visualizerMode,
}) => {
    const { t } = useTranslation();
    const placeholder = VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS.default;

    // 预览专用运动值：和 VisPlayground 同一套做法，不进 store、不进 React state。
    const currentTime = useMotionValue(0);
    const audioPower = useMotionValue(0.24);
    const bass = useMotionValue(0.18);
    const lowMid = useMotionValue(0.15);
    const mid = useMotionValue(0.12);
    const vocal = useMotionValue(0.2);
    const treble = useMotionValue(0.1);
    const spectrum = useMotionValue(new Uint8Array(64));

    const audioBands = useMemo(
        () => ({ bass, lowMid, mid, vocal, treble, spectrum }),
        [bass, lowMid, mid, spectrum, treble, vocal],
    );

    useVisPlaygroundPreviewPlayback({
        audioPower,
        bass,
        lowMid,
        mid,
        vocal,
        treble,
        spectrum,
        currentTime,
        visualizerMode,
        loopDuration: placeholder.loopDuration,
        playbackKey: placeholder.id,
        isPaused: false,
    });

    // 当前行是离散状态，只有它进 React state；连续时间始终留在 MotionValue 里。
    const [currentLineIndex, setCurrentLineIndex] = useState(
        () => findPreviewPlaceholderLineIndex(placeholder.lines, 0),
    );
    useMotionValueEvent(currentTime, 'change', latest => {
        const next = findPreviewPlaceholderLineIndex(placeholder.lines, latest);
        setCurrentLineIndex(previous => (previous === next ? previous : next));
    });

    /*
     * 预览容器宽度：外层把 347x212 的舞台整体缩放到这个宽度。
     * 只在窗口尺寸变化时更新，不参与播放时钟。
     */
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    useLayoutEffect(() => {
        const element = containerRef.current;
        if (!element) {
            return;
        }
        const measure = () => {
            const width = element.clientWidth;
            setContainerWidth(previous => (previous === width ? previous : width));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    /*
     * 舞台视口：预览挂载期间把全局视口切成背屏的 347x212，visualizer 内部的字号 / 换行
     * 才和真机一致。窗口关闭时清掉，主界面恢复自己的视口。
     */
    useLayoutEffect(() => {
        setStageViewportOverride({
            width: REAR_STAGE_WIDTH,
            height: REAR_STAGE_HEIGHT,
            offsetX: 0,
            visibleLeft: 0,
            visibleRight: REAR_STAGE_WIDTH,
        });
        return () => setStageViewportOverride(null);
    }, []);

    const previewScale = containerWidth > 0 ? containerWidth / REAR_STAGE_WIDTH : 0;
    const cameraRatio = Math.max(0, Math.min(1, safeLeftCss / REAR_STAGE_WIDTH));
    const contentTransform = resolveRearContentTransform({
        stageWidth: REAR_STAGE_WIDTH,
        stageHeight: REAR_STAGE_HEIGHT,
        frame,
    });
    const cameraTransform = resolveRearCameraTransform({
        stageWidth: REAR_STAGE_WIDTH,
        stageHeight: REAR_STAGE_HEIGHT,
        frame,
    });
    /*
     * 画布框：只画在预览里，让「画布位置」和「相机取景窗」的差别肉眼可见。
     * 画布尺寸恒为 347x212，canvasX/canvasY 只移动这个框；渲染中心只移动取景窗。
     */
    const canvasFrame = resolveRearContentFrame({
        stageWidth: REAR_STAGE_WIDTH,
        stageHeight: REAR_STAGE_HEIGHT,
        frame,
    });
    const fontScale = config.lyricsFontScale * frame.fontScale;

    return (
        <div
            ref={containerRef}
            className="relative mx-auto w-full max-w-md overflow-hidden rounded-xl border"
            style={{
                aspectRatio: `${REAR_SCREEN_ASPECT}`,
                borderColor: 'rgba(255,255,255,0.14)',
                backgroundColor: 'rgba(0,0,0,0.35)',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: REAR_STAGE_WIDTH,
                    height: REAR_STAGE_HEIGHT,
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top left',
                }}
            >
                {/* 背景层：和真机一样铺满整块舞台，不参与内容 transform。 */}
                <div className="absolute inset-0">
                    <VisualizerBackgroundRenderer
                        config={config.background}
                        theme={theme}
                        isDaylight={isDaylight}
                        coverUrl={placeholder.coverUrl}
                        audioPower={audioPower}
                        audioBands={audioBands}
                        seed={config.seed}
                        staticMode={config.staticMode}
                        paused={false}
                    />
                </div>

                {/*
                  * 内容层：画布位置 + 渲染中心 + 缩放。
                  * 背景不在这里，所以拖动渲染中心时背景/画布不会跟着走。
                  */}
                <div className="absolute inset-0 overflow-hidden" style={contentTransform}>
                    {/* 渲染面：比可视区域大一圈，相机平移只移动这一层。 */}
                    <div
                        className="absolute"
                        style={{
                            left: canvasFrame.surfaceLeft,
                            top: canvasFrame.surfaceTop,
                            width: canvasFrame.surfaceWidth,
                            height: canvasFrame.surfaceHeight,
                            ...cameraTransform,
                        }}
                    >
                    <VisualizerRenderer
                        mode={visualizerMode}
                        currentTime={currentTime}
                        currentLineIndex={currentLineIndex}
                        lines={placeholder.lines}
                        theme={theme}
                        subtitleTheme={theme}
                        isDaylight={isDaylight}
                        audioPower={audioPower}
                        audioBands={audioBands}
                        songTitle={placeholder.title}
                        showText
                        isPreviewMode
                        visualizerOpacity={config.visualizerOpacity}
                        coverUrl={placeholder.coverUrl}
                        background={{ ...config.background, transparent: true }}
                        lyricsFontScale={fontScale}
                        subtitleFontScale={config.subtitleFontScale}
                        visualizerTunings={config.visualizerTunings}
                        staticMode={config.staticMode}
                    />
                    </div>
                </div>

                {/* 画布框：只用于预览。canvasX/Y 移动它，渲染中心不移动它。 */}
                <div
                    className="pointer-events-none absolute border border-dashed"
                    style={{
                        left: canvasFrame.canvasLeft,
                        top: canvasFrame.canvasTop,
                        width: canvasFrame.canvasWidth,
                        height: canvasFrame.canvasHeight,
                        borderColor: 'rgba(255,255,255,0.22)',
                    }}
                />

                {/* 摄像头竖带：只做半透明遮罩，背景和效果仍然在它下面。 */}
                <div
                    className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center border-r"
                    style={{
                        width: `${cameraRatio * 100}%`,
                        borderColor: 'rgba(255,255,255,0.16)',
                        backgroundColor: 'rgba(255,255,255,0.08)',
                    }}
                >
                    <Monitor size={14} className="opacity-50" />
                </div>
            </div>

            <span className="pointer-events-none absolute bottom-1 right-2 text-[10px] font-medium opacity-40">
                {t('options.rearLyricsStyleVisibleArea')}
            </span>
        </div>
    );
};

export default RearLyricsStylePreview;
