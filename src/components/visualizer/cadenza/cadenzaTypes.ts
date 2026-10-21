import type { layoutWithLines, PreparedTextWithSegments } from '@chenglou/pretext';
import type { CadenzaTuning, Line, Theme, Word as WordType } from '../../../types';
import type { GraphemeTiming } from '../../../utils/lyrics/graphemeTiming';
import type { LineTransitionTiming } from '../../../utils/lyrics/renderHints';

// src/components/visualizer/cadenza/cadenzaTypes.ts
// Cadenza 的布局 / 动画中间结构：pretext 分段元信息、词范围、跨行片段、落点，以及运行时缓存的准备态。

export interface SegmentMeta {
    graphemeStart: number;
    graphemeEnd: number;
    graphemeCount: number;
}

export interface WordRange {
    wordIndex: number;
    word: WordType;
    start: number;
    end: number;
    color: string;
    graphemeTimings: GraphemeTiming[];
}

export interface WordFragment {
    wordIndex: number;
    lineIndex: number;
    word: WordType;
    text: string;
    color: string;
    startX: number;
    endX: number;
    fragmentStartInWord: number;
    fragmentEndInWord: number;
    wordGraphemeCount: number;
    wordGraphemeTimings: GraphemeTiming[];
    fragmentIndexInWord: number;
    fragmentCountInWord: number;
    isPrimaryFragment: boolean;
    isSplitAcrossLines: boolean;
}

export interface WordPlacement {
    id: string;
    wordIndex: number;
    word: WordType;
    text: string;
    color: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotate: number;
    scale: number;
    passedRotate: number;
    passedDriftX: number;
    passedDriftY: number;
    entryOffsetX: number;
    entryOffsetY: number;
    fragmentStartInWord: number;
    fragmentEndInWord: number;
    wordGraphemeCount: number;
    wordGraphemeTimings: GraphemeTiming[];
    emphasis: number;
    isInterlude: boolean;
}

export interface AnimatedPlacementState {
    x: number;
    y: number;
    rotation: number;
    scale: number;
    bodyAlpha: number;
    blur: number;
    activeMix: number;
    glowAlpha: number;
}

export interface OverlayWordNodes {
    outer: HTMLDivElement;
    inner: HTMLDivElement;
    body: HTMLSpanElement;
    glow: HTMLSpanElement;
    glyphSpans: HTMLSpanElement[];
    glyphSignature: string;
    /** What the nodes currently show, so a frame only touches what changed; null before the first write. */
    written: OverlayWordFrame | null;
    /** The text-shadow each glyph span currently has, index-aligned with `glyphSpans`. */
    glyphShadows: string[];
    /** The draw-loop frame that last used these nodes; older ones are removed at the end of a frame. */
    frame: number;
}

/** One word's DOM state for a frame, as strings ready to assign. */
export interface OverlayWordFrame {
    outerTransform: string;
    willChange: string;
    font: string;
    innerTransform: string;
    text: string;
    color: string;
    opacity: string;
    filter: string;
}

export interface PreparedState {
    prepared: PreparedTextWithSegments;
    text: string;
    font: string;
    fontPx: number;
    lineHeight: number;
    maxWidth: number;
    layout: ReturnType<typeof layoutWithLines>;
    segmentMetas: SegmentMeta[];
    graphemes: string[];
    placements: WordPlacement[];
}

export interface PreparedStateCacheContext {
    showText: boolean;
    /**
     * 画布尺寸 + 可见区边界（画布坐标系）。背屏只有一条竖带可见，
     * 换行宽度和落点都要按 visibleLeft / visibleRight 算，不能按 width 居中。
     */
    viewport: {
        width: number;
        height: number;
        visibleLeft: number;
        visibleRight: number;
    };
    theme: Theme;
    tuning: Pick<CadenzaTuning, 'fontScale' | 'widthRatio'>;
    /** 宿主的歌词字号倍率（背屏用的是背屏那一份），必须进缓存 key，否则改字号会复用旧布局。 */
    lyricsFontScale: number;
}

export interface ResolvedLineRenderTiming {
    renderHints: NonNullable<Line['renderHints']> | null;
    lineRenderEndTime: number;
    wordRevealMode: 'normal' | 'fast' | 'instant';
    lastWordEndTime: number;
    linePassHold: number;
    transitionTiming: LineTransitionTiming;
}
