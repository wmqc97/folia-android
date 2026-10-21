import { useSyncExternalStore } from 'react';

// src/components/visualizer/stageViewport.ts
// 当前文件：舞台视口（stage viewport）——visualizer 内部做布局时应当测量的那块矩形。
//
// 为什么需要它：各 visualizer 的字号、换行宽度、随机对齐大多按 window.innerWidth 算，
// 默认就等于「整块画布」。背屏是个例外：屏幕左边有一条被摄像头挖掉的窄带，
// 但歌词画布仍然是整块屏幕 —— 背景要铺满，歌词也可以压到摄像头下面一点点，
// 需要挪的只是「构图中心」：它要落到摄像头右边那块可见区的中心上。
//
// 所以背屏舞台发布的仍然是整块屏幕的宽高（字号因此不会被压小），
// 另外多带一个水平中心偏移 offsetX（正数 = 渲染中心右移）。
//
// 舞台层实际兑现这个偏移的方式见 RemotePlaybackStage：画布从屏幕左缘起算、
// 向右多出 `2 * offsetX` 宽（落在屏幕外被裁掉），于是画布仍然铺满整屏，
// 而画布中心正好右移了 offsetX、落到可见区中心上。这里发布的 offsetX 是
// 「渲染中心相对整屏中心」的偏移量，供需要自己摆位置的渲染层使用
// （按自身宽度居中的渲染层不用管，画布已经替它们偏好了）。
//
// 背屏还会额外叠加「构图微调」（scale / offset）：画布被整体缩放平移之后，
// 可见区在画布自己的坐标系里只剩一条竖带，和「整块画布居中」不再是同一个中心。
// 所以这里再发布 visibleLeft / visibleRight：需要自己换行、自己摆中心的渲染层
// （见 cadenzaPreparedState / VisualizerCadenza）用这两个值算真实可见宽度与可见中心，
// 否则内容会按整块画布居中、从屏幕右边溢出去。
// 主屏 / OBS 没有发布者，取到的就是真实视口 + offsetX 0 + 可见区 [0, width]，行为完全不变。
//
// 两种读法：
//   - 组件里：useStageViewport()（订阅式，覆盖值变化会触发重渲染，必须订阅才能跟着改）；
//   - 普通函数里：getStageViewportWidth() / getStageViewportHeight() / getStageViewportOffsetX()。

export interface StageViewport {
    width: number;
    height: number;
    /**
     * 渲染中心相对**整屏中心**的水平偏移（CSS px，正数 = 中心右移）。
     *
     * <p>背屏 = 左侧摄像头安全带宽度的一半：可见区中心比整屏中心正好靠右这么多。
     * 主屏 / OBS 恒为 0。
     */
    offsetX: number;
    /**
     * 可见区在「visualizer 自己测量的画布坐标系」里的左右边界。
     *
     * <p>主屏 / OBS 恒为 `[0, width]`。背屏在左侧摄像头竖带 + 构图微调之后，可见区
     * 只是整块画布里的一条竖带，所以这两个值可能比画布本身窄，甚至边界落在画布之外。
     * 需要自己换行 / 自己摆中心的渲染层必须用它们算「可见宽度」和「可见中心」，
     * 而不是直接拿画布宽度居中，否则内容会从右侧溢出屏幕。
     */
    visibleLeft: number;
    visibleRight: number;
}

const FALLBACK_WIDTH = 1200;
const FALLBACK_HEIGHT = 800;

const readWindowViewport = (): StageViewport => {
    if (typeof window === 'undefined') {
        return {
            width: FALLBACK_WIDTH,
            height: FALLBACK_HEIGHT,
            offsetX: 0,
            visibleLeft: 0,
            visibleRight: FALLBACK_WIDTH,
        };
    }
    const width = window.innerWidth;
    return {
        width,
        height: window.innerHeight,
        offsetX: 0,
        visibleLeft: 0,
        visibleRight: width,
    };
};

let override: StageViewport | null = null;
let current: StageViewport = readWindowViewport();
const listeners = new Set<() => void>();

const emit = () => {
    listeners.forEach(listener => listener());
};

const sameViewport = (a: StageViewport | null, b: StageViewport | null) => (
    a === b || (
        Boolean(a) && Boolean(b)
        && a!.width === b!.width
        && a!.height === b!.height
        && a!.offsetX === b!.offsetX
        && a!.visibleLeft === b!.visibleLeft
        && a!.visibleRight === b!.visibleRight
    )
);

/**
 * 发布 / 清除舞台视口覆盖。背屏舞台挂载期间发布自己的画布尺寸与中心偏移，卸载时传 null 还原成真实视口。
 * 只有真的变了才通知订阅者，避免每帧重渲染。
 *
 * visibleLeft / visibleRight 省略时按「整块画布都可见」处理（`[0, width]`），
 * 也就是主屏 / OBS 的语义。
 */
export const setStageViewportOverride = (
    viewport: (Omit<StageViewport, 'offsetX' | 'visibleLeft' | 'visibleRight'> & {
        offsetX?: number;
        visibleLeft?: number;
        visibleRight?: number;
    }) | null,
): void => {
    const next = viewport && viewport.width > 0 && viewport.height > 0
        ? (() => {
            const width = Math.round(viewport.width);
            const visibleLeft = Number.isFinite(viewport.visibleLeft)
                ? Math.round(viewport.visibleLeft as number)
                : 0;
            const visibleRight = Number.isFinite(viewport.visibleRight)
                ? Math.round(viewport.visibleRight as number)
                : width;
            return {
                width,
                height: Math.round(viewport.height),
                offsetX: Math.round(viewport.offsetX ?? 0),
                visibleLeft,
                visibleRight: Math.max(visibleRight, visibleLeft),
            };
        })()
        : null;
    if (sameViewport(next, override)) {
        return;
    }
    override = next;
    current = next ?? readWindowViewport();
    emit();
};

/** 舞台视口当前值；返回同一个对象引用，可直接当 useSyncExternalStore 的快照用。 */
export const getStageViewport = (): StageViewport => current;
export const getStageViewportWidth = (): number => current.width;
export const getStageViewportHeight = (): number => current.height;
/** 舞台渲染中心相对画布中心的水平偏移（CSS px）。主屏 / OBS 恒为 0。 */
export const getStageViewportOffsetX = (): number => current.offsetX;

/**
 * 舞台上真正看得见的宽度（CSS px）。
 *
 * <p>主屏 / OBS 恒等于 {@link getStageViewportWidth}；背屏是 visibleRight - visibleLeft，
 * 因为左侧摄像头竖带不可见，画布还被整体加宽过。需要按「用户能看到多宽」做排版决策的
 * 渲染层（气泡最大宽度、横排列表上限）应该用这个值，别拿画布宽度算。
 */
export const getStageViewportVisibleWidth = (): number => (
    Math.max(1, current.visibleRight - current.visibleLeft)
);

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

// 没有覆盖时跟随窗口尺寸：窗口变了也要让订阅者重算，否则它们会一直用挂载时那次的值。
if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
        if (override) {
            return;
        }
        const next = readWindowViewport();
        if (
            next.width === current.width
            && next.height === current.height
            && next.offsetX === current.offsetX
            && next.visibleLeft === current.visibleLeft
            && next.visibleRight === current.visibleRight
        ) {
            return;
        }
        current = next;
        emit();
    });
}

/** 组件里订阅舞台视口。 */
export const useStageViewport = (): StageViewport => (
    useSyncExternalStore(subscribe, getStageViewport, getStageViewport)
);

/** 组件里只关心宽度时的简写。 */
export const useStageViewportWidth = (): number => useStageViewport().width;

/** 组件里只关心渲染中心偏移时的简写。 */
export const useStageViewportOffsetX = (): number => useStageViewport().offsetX;

/** 组件里订阅「看得见的宽度」。主屏等于画布宽度，背屏等于可见区宽度。 */
export const useStageViewportVisibleWidth = (): number => {
    const viewport = useStageViewport();
    return Math.max(1, viewport.visibleRight - viewport.visibleLeft);
};
