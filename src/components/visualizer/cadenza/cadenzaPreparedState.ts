import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import { Line, Theme } from '../../../types';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../../utils/fontStacks';
import type { PreparedStateCacheContext } from './cadenzaTypes';
import { clamp, isCJK, splitGraphemes } from './cadenzaEnvelopes';
import { buildLineFragments, buildSegmentMetas, findWordRanges } from './cadenzaFragments';
import { buildWordPlacements } from './cadenzaPlacements';

// src/components/visualizer/cadenza/cadenzaPreparedState.ts
// 一行歌词的完整准备：选字号、pretext 测量换行、切片段、算落点。整个模式最贵的一步，结果由组件缓存。

const chooseFontPx = (width: number, line: Line) => {
    const graphemeCount = splitGraphemes(line.fullText).length || 1;
    const wordCount = line.words.length || 1;
    const widthBase = clamp(width * 0.086, 34, 94);
    const lengthPenalty = graphemeCount > 12 ? Math.min((graphemeCount - 12) * 1.8, 34) : 0;
    const densityPenalty = wordCount > 7 ? Math.min((wordCount - 7) * 1.5, 18) : 0;
    return clamp(widthBase - lengthPenalty - densityPenalty, 28, 104);
};

const buildCanvasFont = (theme: Theme, fontPx: number) => `${resolveThemeFontWeight(theme, 700)} ${fontPx}px ${resolveThemeFontStack(theme)}`;

/**
 * 选字号用的「表观宽度」：背屏画布比屏幕宽，真正能看到的只有可见区那条竖带。
 *
 * <p>字号和换行宽度必须按同一个口径算，否则就是「按整块画布选了 60px 的字，却要塞进 242px 的
 * 可见区里换行」：行被挤成窄条，上半截直接超出屏幕上缘。主屏 / OBS 的可见区就是整块画布，
 * 取到的表观宽度和原来完全一致，行为不变。
 */
const chooseTypeWidth = (viewport: PreparedStateCacheContext['viewport']) => {
    const visibleWidth = viewport.visibleRight - viewport.visibleLeft;
    return visibleWidth > 0 && visibleWidth < viewport.width - 0.5
        ? visibleWidth
        : viewport.width;
};

export const buildPreparedState = (
    line: Line,
    context: PreparedStateCacheContext,
) => {
    const { showText, viewport, theme, tuning, lyricsFontScale } = context;

    if (!showText || viewport.width <= 0 || viewport.height <= 0) {
        return null;
    }

    // 字号倍率要连下限一起缩放：只乘中间值的话，背屏这种小视口会永远被 24px 下限顶住，
    // 表现就是「背屏调小字号，这个模式纹丝不动」。
    // 字号按可见区宽度选，别再按画布宽度：背屏画布被加宽过，直接用它选字会偏大。
    const fontPx = clamp(
        chooseFontPx(chooseTypeWidth(viewport), line) * tuning.fontScale * lyricsFontScale,
        24 * lyricsFontScale,
        132,
    );
    const font = buildCanvasFont(theme, fontPx);
    // This is the expensive part of the mode.
    // Once a line reaches here, we fully measure it, wrap it, split it, and convert it into placement-ready fragments.
    const prepared = prepareWithSegments(line.fullText, font);
    const text = prepared.segments.join('');
    const { segmentMetas, graphemes } = buildSegmentMetas(prepared);
    const lineHeight = Math.round(fontPx * (isCJK(text) ? 1.22 : 1.1));
    /*
     * 换行宽度按「真实可见宽度」算，而不是整块画布宽度。
     *
     * 背屏画布比屏幕宽（右边多出一截落在屏幕外），可见区又因为左侧摄像头和构图微调
     * 只占画布里的一条竖带；按画布宽度换行的话，文字居中之后右半截会直接溢出屏幕。
     * 主屏 / OBS 的可见宽度就等于画布宽度，行为不变。
     */
    const visibleLeft = viewport.visibleLeft;
    const visibleRight = viewport.visibleRight;
    const visibleWidth = Math.max(visibleRight - visibleLeft, 1);
    const availableWidth = Math.max(visibleWidth - 48, 120);
    const minWidth = Math.min(220, availableWidth);
    const wrapCompression = graphemes.length > 12
        ? clamp(0.92 - (graphemes.length - 12) * 0.018, 0.62, 0.92)
        : 0.92;
    const compactWidthRatio = tuning.widthRatio * wrapCompression;
    const maxWidth = clamp(Math.min(visibleWidth * compactWidthRatio, 820), minWidth, availableWidth);
    const layout = layoutWithLines(prepared, maxWidth, lineHeight);
    const ranges = findWordRanges(line, graphemes, theme);
    const lineFragments = buildLineFragments(prepared, segmentMetas, graphemes, layout, ranges);
    /*
     * 只有可见区真的比画布窄（背屏）时才收紧横向漂移边界：散落的字最远只能漂到可见区边缘，
     * 不能再像主屏那样多留 72px 的余量，否则又会从屏幕右边溢出去。
     */
    const strictHorizontalHalfWidth = visibleWidth < viewport.width - 0.5 ? visibleWidth / 2 : null;
    const placements = buildWordPlacements(
        lineFragments,
        fontPx,
        lineHeight,
        maxWidth,
        theme.animationIntensity,
        line.startTime * 1000,
        line.fullText === '......',
        strictHorizontalHalfWidth,
        // 可见区半宽只够夹住「初始落点」，每帧的 passed 漂移和局部浮动是在渲染阶段叠上去的，
        // 会把字推出屏幕。所以把可见区本身的边界一起交给落点层，让它算 drift 的安全余量。
        visibleWidth < viewport.width - 0.5
            ? { left: visibleLeft, right: visibleRight }
            : null,
    );

    return {
        prepared,
        text,
        font,
        fontPx,
        lineHeight,
        maxWidth,
        layout,
        segmentMetas,
        graphemes,
        placements,
    };
};
