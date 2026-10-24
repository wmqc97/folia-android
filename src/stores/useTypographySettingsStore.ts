// src/stores/useTypographySettingsStore.ts
// Lyric and subtitle typography: the font stacks, scales and weights, plus how the bottom
// subtitle overlay presents itself.
//
// Split out of useSettingsUiStore. These are read by the visualizers and the subtitle overlay on
// every render, so they get their own subscription rather than riding a settings-wide snapshot.

import { create } from 'zustand';
import i18n from '../i18n/config';
import { clearUploadedLyricsFont, uploadAndRegisterLyricsFont } from '../services/customLyricsFont';
import { type StatusMessage, type StoredCustomLyricsFont, type SubtitleContentMode, type Theme } from '../types';
import { normalizeFontFamilyStack, normalizeFontWeight } from '../utils/fontStacks';
import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';
import { setStatusMessage } from './useStatusMessageStore';

export const SUBTITLE_OVERLAY_OPACITY_STORAGE_KEY = 'subtitle_overlay_opacity';

export const SUBTITLE_OVERLAY_BACKGROUND_STORAGE_KEY = 'subtitle_overlay_background';

export const SUBTITLE_UPCOMING_LYRICS_BLUR_STORAGE_KEY = 'subtitle_upcoming_lyrics_blur';

export const SHOW_HARMONY_SUBTITLE_STORAGE_KEY = 'show_harmony_subtitle';

export const HARMONY_SUBTITLE_BACKGROUND_STORAGE_KEY = 'harmony_subtitle_background';

export const SHOW_SUBTITLE_TRANSLATION_STORAGE_KEY = 'show_subtitle_translation';

export const SUBTITLE_CONTENT_MODE_STORAGE_KEY = 'subtitle_content_mode';

/**
 * 歌词 / 字幕字号倍率的可设范围。
 *
 * 下限放到 0.5：背屏只有 347x212 CSS px，而各 visualizer 模式的主歌词字号都带 rem 下限
 * （小视口下 clamp 取的就是那个下限，不再随屏幕缩小），1.0 往往直接撑出可见区。
 * 原来的 0.85 下限会让背屏用户没有可用的调节余量，所以整体放宽，默认值仍然是 1。
 */
export const LYRICS_FONT_SCALE_MIN = 0.5;

export const LYRICS_FONT_SCALE_MAX = 1.4;

/**
 * 背屏专用的字号倍率下限：100%，只能往上调。
 *
 * 用户明确要求「背屏歌词大小不能再调小」，所以下限就锁在 100%（=不缩放）。
 * 比这更小的区间实测也没有意义：各 visualizer 的主歌词字号都带 rem 下限，
 * 小视口下 clamp 取的就是那个下限，滑块再往左拖动字不会变小，只会让人以为还能再小。
 * 主屏自己的下限（LYRICS_FONT_SCALE_MIN = 0.5）不受影响，主屏照旧能调到 50%。
 *
 * 历史值 0.95 在这个下限下会被夹到 1.0，属于预期：那一档本来就比默认还小。
 */
export const REAR_LYRICS_FONT_SCALE_MIN = 0.1;
export const REAR_LYRICS_FONT_SCALE_MAX = 2;

/**
 * 背屏歌词的专用字号倍率。
 *
 * 背屏是独立的一块屏（小米 17/18 Pro 系列，347x212 CSS px），主屏能接受的字号在背屏上
 * 往往太大，两者必须能分别设置：这里存的是「投给背屏那份 config 用多少倍率」，
 * 主屏自己的 lyricsFontScale 不受影响。背屏发回来的改字号指令也只写这个字段。
 */
export const REAR_LYRICS_FONT_SCALE_STORAGE_KEY = 'rear_lyrics_font_scale';

/**
 * 背屏「构图」微调：每个 lyrics 效果各自一份，键是 visualizer 模式名。
 *
 * 背屏只有 347x212 的 CSS 视口，其中左侧 ~105px 被摄像头挖掉，真正能拿来排版的
 * 可见区只有 242px 宽。各效果的字号 / 预留边距都是按大屏设计的，缩到这块小屏上
 * 只有两个下场：要么主歌词被压到摄像头底下，要么整句溢出屏幕下缘。
 *
 * 所以每个效果单独记两个数：{@code scale}（相对默认构图的缩放）和
 * {@code offsetX}（渲染中心的水平微调，CSS px，正数 = 右移）。
 * 这两个值只作用于背屏，主界面完全不受影响。
 */
export const REAR_LYRICS_FRAME_STORAGE_KEY = 'rear_lyrics_frame';
/** 镜台（diorama）渲染中心一次性校正：旧默认 +38 改到 173.5 内容中心。 */
const REAR_DIORAMA_CENTER_MIGRATION_KEY = 'rear_diorama_center_v1';
/** 炫光（lumiere）渲染中心/字号一次性校正：缩放归 1 后内容中心 173.5 → 228，字号 1.6 → 2。 */
const REAR_LUMIERE_CENTER_MIGRATION_KEY = 'rear_lumiere_center_v1';
/** 全样式出厂默认一次性迁移：缩放归 1、渲染中心归 55、字号等比放大。 */
const REAR_ALL_MIGRATION_KEY = 'rear_all_defaults_v1';
/** 炫光渲染中心回归 0：上一版把 centerOffsetX 误迁到 55，与 scene.ts 的 rearCx 双重偏移。 */
const REAR_LUMIERE_CENTER_V2_MIGRATION_KEY = 'rear_lumiere_center_v2';
/** 用户真机导出 JSON 的完整出厂默认：把所有样式 frame 完整覆盖为导出值。 */
const REAR_ALL_MIGRATION_V2_KEY = 'rear_all_defaults_v2';
/** 第二次真机导出（15:26）的完整出厂默认：覆盖 tempera/partita/monet 等样式的新调教值。 */
const REAR_ALL_MIGRATION_V3_KEY = 'rear_all_defaults_v3';

/** 单个效果的构图微调。 */
export interface RearLyricsFrameValue {
    /**
     * 歌词画布左边界（CSS px）。0 = 从屏幕左缘开始；默认 98 = 277 物理像素的摄像头硬边缘。
     *
     * <p>这是「歌词排版从哪开始」，不是把画布整体右移：背景和效果仍然铺满整屏，
     * 只有歌词、字幕这些文字从这条边界开始排。左侧区域不会变黑，也不会被裁掉。
     */
    canvasX: number;
    /** 歌词画布上边界（CSS px）。0 = 从屏幕顶缘开始。 */
    canvasY: number;
    /** 渲染中心相对歌词画布中心的水平偏移（CSS px，正数 = 右移）。 */
    centerOffsetX: number;
    /** 渲染中心相对歌词画布中心的垂直偏移（CSS px，正数 = 下移）。 */
    centerOffsetY: number;
    /**
     * 该效果专属的歌词字号倍率，和背屏全局字号（rearLyricsFontScale）叠乘。
     *
     * <p>每个效果的字号下限、换行宽度都不同：同一个全局倍率在 A 效果上刚好铺满、在 B 效果上
     * 可能直接顶出屏幕。所以除了全局倍率，每个效果再记一份自己的倍率，
     * 最终字号 = 主屏歌词倍率 × 背屏全局倍率 × 该效果倍率。
     */
    fontScale: number;
    /** 效果缩放：在「画布自适应缩放」之上再乘一档，1 = 正好铺满歌词画布。 */
    effectScaleX: number;
    /** 纵向效果缩放：1 = 正好铺满歌词画布。 */
    effectScaleY: number;
}

/** 构图微调的可设范围。 */
export const REAR_LYRICS_FRAME_CANVAS_X_MIN = -200;
export const REAR_LYRICS_FRAME_CANVAS_X_MAX = 240;
export const REAR_LYRICS_FRAME_CANVAS_Y_MIN = -140;
export const REAR_LYRICS_FRAME_CANVAS_Y_MAX = 140;
// 相机平移范围 = 渲染面的 overscan（120），超过就会看到渲染面外的空白。
export const REAR_LYRICS_FRAME_CENTER_OFFSET_MIN = -120;
export const REAR_LYRICS_FRAME_CENTER_OFFSET_MAX = 120;
export const REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MIN = -120;
export const REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MAX = 120;
export const REAR_LYRICS_FRAME_EFFECT_SCALE_MIN = 0.4;
export const REAR_LYRICS_FRAME_EFFECT_SCALE_MAX = 1.6;
/** 单个效果的字号倍率范围。比全局倍率收窄：它是在全局倍率之上再叠一档微调。 */
export const REAR_LYRICS_FRAME_FONT_SCALE_MIN = 0.4;
export const REAR_LYRICS_FRAME_FONT_SCALE_MAX = 2;

/**
 * 出厂构图：画布从屏幕 0 开始，渲染中心落在可见区中心，效果按可见区宽度自适应。
 *
 * <p>canvasX / canvasY 是画布位置，默认 0 = 屏幕左/上缘；负数可以继续往左/上移。
 * 内容默认缩放 = 可见宽 / 整屏宽（347 视口、98 安全带下是 0.7176），
 * 缩放原点是可见区中心，所以画布从 0 开始、歌词仍然落在摄像头右侧。
 */
export const DEFAULT_REAR_LYRICS_FRAME: RearLyricsFrameValue = {
    canvasX: 0,
    canvasY: 0,
    centerOffsetX: 0,
    centerOffsetY: 0,
    fontScale: 1,
    effectScaleX: 1,
    effectScaleY: 1,
};

/**
 * 背屏逐样式的出厂构图。
 *
 * <p>这些值来自真机导出的「全部背屏歌词样式」：用户已经把 14 个效果逐个调到满意，
 * 这里把它们作为**没有存过该样式时**的默认值。用户在任何一台设备上改过某个样式后，
 * 仍然以用户存下来的值为准（resolveRearLyricsFrame 的 stored 优先）。
 *
 * <p>效果缩放出厂不再统一 1x，而是按真机调好的值走；需要重置时点该样式的「默认」。
 * 渲染中心只负责内容偏移，不参与画布、歌词画布、样式画布的位置和大小。
 */
/*
 * 出厂默认 = 用户真机导出的背屏样式参数（2026-10-22 15:26 导出 JSON）。
 * 各样式按背屏实际显示效果单独调过 centerOffset / fontScale / effectScale。
 */
export const BUILTIN_REAR_LYRICS_FRAME_OVERRIDES: Readonly<Record<string, Partial<RearLyricsFrameValue>>> = {
    tilt: { canvasX: 0, canvasY: 0, centerOffsetX: 49, centerOffsetY: 0, fontScale: 0.75, effectScaleX: 1, effectScaleY: 1 },
    pendolo: { canvasX: 0, canvasY: 0, centerOffsetX: 22, centerOffsetY: 0, fontScale: 0.7, effectScaleX: 1, effectScaleY: 1 },
    sonnet: { canvasX: 0, canvasY: 0, centerOffsetX: 38, centerOffsetY: 0, fontScale: 0.45, effectScaleX: 1, effectScaleY: 1 },
    tempera: { canvasX: 0, canvasY: 0, centerOffsetX: 64, centerOffsetY: 0, fontScale: 0.7, effectScaleX: 1, effectScaleY: 1 },
    classic: { canvasX: 0, canvasY: 0, centerOffsetX: 35, centerOffsetY: 0, fontScale: 0.45, effectScaleX: 1, effectScaleY: 1 },
    cadenza: { canvasX: 0, canvasY: 0, centerOffsetX: 120, centerOffsetY: 34, fontScale: 0.8, effectScaleX: 1, effectScaleY: 1 },
    partita: { canvasX: 0, canvasY: 0, centerOffsetX: 120, centerOffsetY: 11, fontScale: 0.4, effectScaleX: 0.66, effectScaleY: 0.9 },
    fume: { canvasX: 0, canvasY: 0, centerOffsetX: 55, centerOffsetY: 0, fontScale: 0.65, effectScaleX: 1, effectScaleY: 1 },
    monet: { canvasX: 47, canvasY: 0, centerOffsetX: -34, centerOffsetY: 0, fontScale: 0.9, effectScaleX: 1, effectScaleY: 1 },
    cappella: { canvasX: 53, canvasY: 0, centerOffsetX: 55, centerOffsetY: 0, fontScale: 1.3, effectScaleX: 1, effectScaleY: 1 },
    diorama: { canvasX: 0, canvasY: 0, centerOffsetX: -43, centerOffsetY: -31, fontScale: 0.95, effectScaleX: 1, effectScaleY: 1 },
    lumiere: { canvasX: 0, canvasY: 0, centerOffsetX: 0, centerOffsetY: 0, fontScale: 1.4, effectScaleX: 1, effectScaleY: 1 },
    claddagh: { canvasX: 0, canvasY: 0, centerOffsetX: 31, centerOffsetY: 0, fontScale: 0.6, effectScaleX: 1, effectScaleY: 1 },
    still: { canvasX: 0, canvasY: 0, centerOffsetX: 55, centerOffsetY: 34, fontScale: 0.9, effectScaleX: 1, effectScaleY: 1 },
};

/**
 * 取某个模式在背屏上的构图：用户记录优先，取不到才用出厂例外，最后才是出厂构图。
 *
 * <p>fallbackCanvasX 只作为调用方没给值时的兜底；默认是 0（画布从屏幕左缘开始）。
 * 渲染中心 centerOffset 不参与画布几何，只作为 Visualizer 内容层的偏移。
 */
export const resolveRearLyricsFrame = (
    mode: string | undefined,
    stored: Partial<RearLyricsFrameValue> | null | undefined,
    fallbackCanvasX: number = DEFAULT_REAR_LYRICS_FRAME.canvasX,
): RearLyricsFrameValue => {
    if (stored) {
        return clampRearLyricsFrame(stored, fallbackCanvasX);
    }
    const builtin = mode ? BUILTIN_REAR_LYRICS_FRAME_OVERRIDES[mode] : undefined;
    return clampRearLyricsFrame(
        { ...DEFAULT_REAR_LYRICS_FRAME, canvasX: fallbackCanvasX, ...builtin },
        fallbackCanvasX,
    );
};

/**
 * 背屏左侧「歌词显示区域」避让宽度的用户覆盖值（CSS px）。
 *
 * <p>原生侧量到的摄像头竖带是 {@code RearDisplayCommands.SAFE_LEFT_PX}（976x596 背屏上 280 物理像素），
 * 换算是 {@code resolveRearSafeLeftCss}。这个字段只在该设备量不到、或者用户想手动收紧/放宽时生效：
 * null = 跟随原生实测值，数字 = 用户覆盖。
 *
 * 它和构图微调（rearLyricsFrames）是两件不同的事：这里改的是「歌词允许排到哪里」，
 * 也就是显示区域左边界；构图微调改的是渲染中心，不动显示区域。
 */
export const REAR_LYRICS_SAFE_LEFT_STORAGE_KEY = 'rear_lyrics_safe_left_css';

/** 避让宽度的可设范围（CSS px）。上限取自背屏可用宽度，避免把歌词挤到没有地方排。 */
export const REAR_LYRICS_SAFE_LEFT_MIN = 0;
export const REAR_LYRICS_SAFE_LEFT_MAX = 200;

/** 把外部值夹到合法区间；null / 非数字一律回落成「跟随实测」。 */
export const clampRearLyricsSafeLeftCss = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(REAR_LYRICS_SAFE_LEFT_MAX, Math.max(REAR_LYRICS_SAFE_LEFT_MIN, Math.round(parsed)));
};

/** 读取持久化的避让覆盖值。读不到就用「跟随实测」。 */
export const readStoredRearLyricsSafeLeftCss = (): number | null => {
    if (typeof localStorage === 'undefined') return null;
    try {
        const saved = localStorage.getItem(REAR_LYRICS_SAFE_LEFT_STORAGE_KEY);
        if (!saved) return null;
        return clampRearLyricsSafeLeftCss(JSON.parse(saved));
    } catch {
        return null;
    }
};

/**
 * 把外部值夹到合法区间，缺字段按出厂值补；旧版本存的是 scaleX/scaleY/offsetX/offsetY，
 * 这里顺手迁移成新的 effectScale / centerOffset，用户之前调过的值不会丢。
 */
export const clampRearLyricsFrame = (
    value: Partial<RearLyricsFrameValue> | null | undefined,
    fallbackCanvasX: number = DEFAULT_REAR_LYRICS_FRAME.canvasX,
): RearLyricsFrameValue => {
    const legacy = value as (Partial<RearLyricsFrameValue> & {
        scaleX?: number;
        scaleY?: number;
        offsetX?: number;
        offsetY?: number;
    }) | null | undefined;
    const readNumber = (input: unknown, fallback: number) => {
        const parsed = Number(input);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const clamp = (input: number, min: number, max: number) => Math.min(max, Math.max(min, input));
    return {
        canvasX: clamp(
            Math.round(readNumber(legacy?.canvasX, fallbackCanvasX)),
            REAR_LYRICS_FRAME_CANVAS_X_MIN,
            REAR_LYRICS_FRAME_CANVAS_X_MAX,
        ),
        canvasY: clamp(
            Math.round(readNumber(legacy?.canvasY, 0)),
            REAR_LYRICS_FRAME_CANVAS_Y_MIN,
            REAR_LYRICS_FRAME_CANVAS_Y_MAX,
        ),
        centerOffsetX: clamp(
            Math.round(readNumber(legacy?.centerOffsetX ?? legacy?.offsetX, 0)),
            REAR_LYRICS_FRAME_CENTER_OFFSET_MIN,
            REAR_LYRICS_FRAME_CENTER_OFFSET_MAX,
        ),
        centerOffsetY: clamp(
            Math.round(readNumber(legacy?.centerOffsetY ?? legacy?.offsetY, 0)),
            REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MIN,
            REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MAX,
        ),
        fontScale: clamp(
            readNumber(legacy?.fontScale, 1),
            REAR_LYRICS_FRAME_FONT_SCALE_MIN,
            REAR_LYRICS_FRAME_FONT_SCALE_MAX,
        ),
        effectScaleX: clamp(
            readNumber(legacy?.effectScaleX ?? legacy?.scaleX, 1),
            REAR_LYRICS_FRAME_EFFECT_SCALE_MIN,
            REAR_LYRICS_FRAME_EFFECT_SCALE_MAX,
        ),
        effectScaleY: clamp(
            readNumber(legacy?.effectScaleY ?? legacy?.scaleY ?? legacy?.scaleX, 1),
            REAR_LYRICS_FRAME_EFFECT_SCALE_MIN,
            REAR_LYRICS_FRAME_EFFECT_SCALE_MAX,
        ),
    };
};

/** 读整张构图表；缺项用出厂值补，坏 JSON 退回空表。 */
export const readStoredRearLyricsFrames = (): Record<string, RearLyricsFrameValue> => {
    if (typeof window === 'undefined') {
        return {};
    }
    const saved = localStorage.getItem(REAR_LYRICS_FRAME_STORAGE_KEY);
    if (!saved) {
        return {};
    }
    try {
        const parsed = JSON.parse(saved) as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }
        const frames: Record<string, RearLyricsFrameValue> = {};
        for (const [mode, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (value && typeof value === 'object') {
                frames[mode] = clampRearLyricsFrame(value as Partial<RearLyricsFrameValue>);
            }
        }
        /*
         * 撤销上一版误改的 still 渲染中心：如果之前被写成 -40，回到 0。
         * 只处理这个特定值，用户自己调过的其他值不动。
         */
        if (frames.still
            && frames.still.canvasX === 40
            && frames.still.centerOffsetX === -40
            && localStorage.getItem('rear_still_center_v2') === '1') {
            frames.still = { ...frames.still, centerOffsetX: 0 };
            localStorage.removeItem('rear_still_center_v2');
            localStorage.setItem(REAR_LYRICS_FRAME_STORAGE_KEY, JSON.stringify(frames));
        }
        /*
         * 镜台（diorama）旧默认 centerOffsetX 38，内容中心落在 211.5；
         * 现在改为 0，内容中心 173.5，正好是摄像头右侧剩余区域的正中。
         * 只动渲染中心，画布 X/Y、字号、效果缩放都不变。
         */
        if (frames.diorama
            && frames.diorama.canvasX === 0
            && frames.diorama.centerOffsetX === 38
            && localStorage.getItem(REAR_DIORAMA_CENTER_MIGRATION_KEY) !== '1') {
            frames.diorama = { ...frames.diorama, centerOffsetX: 0 };
            localStorage.setItem(REAR_LYRICS_FRAME_STORAGE_KEY, JSON.stringify(frames));
            localStorage.setItem(REAR_DIORAMA_CENTER_MIGRATION_KEY, '1');
        }
        /*
         * 炫光（lumiere）旧默认是 centerOffsetX 83 + fontScale 1.6 + effectScaleX 0.8 + effectScaleY 0.74。
         * 用户已把缩放 X/Y 归 1：内容中心回到 173.5，字变小。校正：
         *   centerOffsetX 83 → 55（可读区中心 228，+15 物理）
         *   fontScale 1.6 → 2（补回缩放归 1 后变小的字号，上限已调到 2）
         * 只对旧组合迁移一次，用户之后自己调的值不动。
         */
        if (frames.lumiere
            && frames.lumiere.centerOffsetX === 83
            && Math.abs(frames.lumiere.fontScale - 1.6) < 0.001
            && localStorage.getItem(REAR_LUMIERE_CENTER_MIGRATION_KEY) !== '1') {
            frames.lumiere = { ...frames.lumiere, centerOffsetX: 55, fontScale: 2 };
            localStorage.setItem(REAR_LYRICS_FRAME_STORAGE_KEY, JSON.stringify(frames));
            localStorage.setItem(REAR_LUMIERE_CENTER_MIGRATION_KEY, '1');
        }
        /*
         * 全样式出厂默认迁移（只跑一次，用户之后调的值不动）：
         * 旧默认里 effectScaleX/Y 是 0.65~1.6，内容中心在屏幕中心 173.5（canvasX 0 时）。
         * 现在统一：
         *   - 缩放 X/Y 归 1；
         *   - 渲染中心 X 归 55（可读区中心 228 = 222.5 + 15 物理）；
         *   - 字号等比放大，补回缩放归 1 后变小的视觉。
         * 只对 effectScaleX/Y 都不是 1 的旧值迁移，避免反复覆盖用户调好的值。
         */
        // 用户反馈字体太小，强制放大到出厂默认（只跑一次）。
        // 炫光渲染中心 X 回归 0：之前迁到 55，与 scene.ts rearCx 双重偏移导致歌词偏右。
        if (frames.lumiere
            && frames.lumiere.centerOffsetX === 55
            && localStorage.getItem(REAR_LUMIERE_CENTER_V2_MIGRATION_KEY) !== '1') {
            frames.lumiere = { ...frames.lumiere, centerOffsetX: 0 };
            localStorage.setItem(REAR_LYRICS_FRAME_STORAGE_KEY, JSON.stringify(frames));
            localStorage.setItem(REAR_LUMIERE_CENTER_V2_MIGRATION_KEY, '1');
        }
        if (localStorage.getItem(REAR_ALL_MIGRATION_KEY) !== '1') {
            for (const [mode, value] of Object.entries(frames)) {
                const builtin = BUILTIN_REAR_LYRICS_FRAME_OVERRIDES[mode];
                if (!builtin) continue;
                frames[mode] = {
                    ...value,
                    centerOffsetX: builtin.centerOffsetX ?? 55,
                    effectScaleX: 1,
                    effectScaleY: 1,
                    fontScale: builtin.fontScale ?? value.fontScale,
                };
            }
            localStorage.setItem(REAR_LYRICS_FRAME_STORAGE_KEY, JSON.stringify(frames));
            localStorage.setItem(REAR_ALL_MIGRATION_KEY, '1');
        }
        /*
         * 最终出厂默认：用户真机导出的完整 JSON（2026-10-22 14:24）。
         * 完整覆盖所有样式的 7 个字段，让已经跑过旧迁移的设备也回到这份基准。
         * 只跑一次；之后用户在面板里自己调的值以用户为准，不再覆盖。
         */
        if (localStorage.getItem(REAR_ALL_MIGRATION_V2_KEY) !== '1') {
            for (const [mode, builtin] of Object.entries(BUILTIN_REAR_LYRICS_FRAME_OVERRIDES)) {
                const existing = frames[mode] ?? ({} as Partial<RearLyricsFrameValue>);
                frames[mode] = {
                    canvasX: builtin.canvasX ?? existing.canvasX ?? 0,
                    canvasY: builtin.canvasY ?? existing.canvasY ?? 0,
                    centerOffsetX: builtin.centerOffsetX ?? existing.centerOffsetX ?? 0,
                    centerOffsetY: builtin.centerOffsetY ?? existing.centerOffsetY ?? 0,
                    fontScale: builtin.fontScale ?? existing.fontScale ?? 1,
                    effectScaleX: builtin.effectScaleX ?? existing.effectScaleX ?? 1,
                    effectScaleY: builtin.effectScaleY ?? existing.effectScaleY ?? 1,
                };
            }
            localStorage.setItem(REAR_LYRICS_FRAME_STORAGE_KEY, JSON.stringify(frames));
            localStorage.setItem(REAR_ALL_MIGRATION_V2_KEY, '1');
        }
        // 第三次真机导出（15:26）：完整覆盖为新调教值（tempera/partita/monet 等变了）。
        if (localStorage.getItem(REAR_ALL_MIGRATION_V3_KEY) !== '1') {
            for (const [mode, builtin] of Object.entries(BUILTIN_REAR_LYRICS_FRAME_OVERRIDES)) {
                const existing = frames[mode] ?? ({} as Partial<RearLyricsFrameValue>);
                frames[mode] = {
                    canvasX: builtin.canvasX ?? existing.canvasX ?? 0,
                    canvasY: builtin.canvasY ?? existing.canvasY ?? 0,
                    centerOffsetX: builtin.centerOffsetX ?? existing.centerOffsetX ?? 0,
                    centerOffsetY: builtin.centerOffsetY ?? existing.centerOffsetY ?? 0,
                    fontScale: builtin.fontScale ?? existing.fontScale ?? 1,
                    effectScaleX: builtin.effectScaleX ?? existing.effectScaleX ?? 1,
                    effectScaleY: builtin.effectScaleY ?? existing.effectScaleY ?? 1,
                };
            }
            localStorage.setItem(REAR_LYRICS_FRAME_STORAGE_KEY, JSON.stringify(frames));
            localStorage.setItem(REAR_ALL_MIGRATION_V3_KEY, '1');
        }
        return frames;
    } catch {
        return {};
    }
};

const LYRICS_FONT_FALLBACK_FAMILIES_STORAGE_KEY = 'lyrics_font_fallback_families';

const LYRICS_FONT_WEIGHT_STORAGE_KEY = 'lyrics_font_weight';

const SUBTITLE_FONT_INHERITS_LYRICS_STORAGE_KEY = 'subtitle_font_inherits_lyrics';

const SUBTITLE_FONT_SCALE_STORAGE_KEY = 'subtitle_font_scale';

const SUBTITLE_FONT_STYLE_STORAGE_KEY = 'subtitle_font_style';

const SUBTITLE_FONT_FAMILY_STORAGE_KEY = 'subtitle_font_family';

const SUBTITLE_FONT_FALLBACK_FAMILIES_STORAGE_KEY = 'subtitle_font_fallback_families';

const SUBTITLE_FONT_WEIGHT_STORAGE_KEY = 'subtitle_font_weight';

export const readStoredSubtitleContentMode = (): SubtitleContentMode => {
    if (typeof window === 'undefined') {
        return 'translation';
    }
    const saved = localStorage.getItem(SUBTITLE_CONTENT_MODE_STORAGE_KEY);
    if (saved === 'translation' || saved === 'romanization' || saved === 'both' || saved === 'none') {
        return saved;
    }
    return getStoredBoolean(SHOW_SUBTITLE_TRANSLATION_STORAGE_KEY, true) ? 'translation' : 'none';
};

const readStoredSubtitleOverlayOpacity = () => {
    if (typeof window === 'undefined') {
        return 0.6;
    }

    const saved = localStorage.getItem(SUBTITLE_OVERLAY_OPACITY_STORAGE_KEY);
    const parsed = saved ? parseFloat(saved) : 0.6;
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0.2, parsed)) : 0.6;
};

const readStoredLyricsFontStyle = (): Theme['fontStyle'] => {
    if (typeof window === 'undefined') {
        return 'sans';
    }

    const saved = localStorage.getItem('lyrics_font_style');
    return saved === 'serif' || saved === 'mono' ? saved : 'sans';
};

const readStoredFontScale = (
    key: string,
    min = LYRICS_FONT_SCALE_MIN,
    max = LYRICS_FONT_SCALE_MAX,
): number => {
    if (typeof window === 'undefined') {
        return 1;
    }

    const saved = localStorage.getItem(key);
    if (!saved) return 1;

    const parsed = parseFloat(saved);
    if (!Number.isFinite(parsed)) return 1;

    return Math.min(max, Math.max(min, parsed));
};

const readStoredFontWeight = (key: string): number | null => {
    if (typeof window === 'undefined') return null;

    const saved = localStorage.getItem(key);
    if (saved === null) return null;

    return normalizeFontWeight(Number(saved));
};

const readStoredFontFamilyStack = (key: string): string[] => {
    if (typeof window === 'undefined') {
        return [];
    }

    const saved = localStorage.getItem(key);
    if (!saved) return [];

    try {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
            return normalizeFontFamilyStack(parsed.map(item => typeof item === 'string' ? item : ''));
        }

        if (typeof parsed === 'string') {
            return normalizeFontFamilyStack(parsed.split(','));
        }
    } catch {
        return normalizeFontFamilyStack(saved.split(','));
    }

    return [];
};

const readStoredSubtitleFontStyle = (): Theme['fontStyle'] => {
    if (typeof window === 'undefined') {
        return 'sans';
    }

    const saved = localStorage.getItem(SUBTITLE_FONT_STYLE_STORAGE_KEY);
    return saved === 'serif' || saved === 'mono' ? saved : 'sans';
};

const readStoredSubtitleFontFamily = (): string | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    return localStorage.getItem(SUBTITLE_FONT_FAMILY_STORAGE_KEY)?.trim() || null;
};

const storeFontFamilyStack = (key: string, families: string[]) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(normalizeFontFamilyStack(families)));
    }
};

export const resolveStoredCustomLyricsFont = (parsed: Partial<StoredCustomLyricsFont>): StoredCustomLyricsFont | null => {
    const family = parsed.family?.trim();
    if (!family) return null;

    const source = parsed.source === 'uploaded' ? 'uploaded' : 'system';
    const label = parsed.label?.trim() || family;

    if (source === 'uploaded') {
        const fontId = parsed.fontId?.trim();
        if (!fontId) return null;

        return {
            source,
            family,
            label,
            fontId,
        };
    }

    return {
        source,
        family,
        label,
    };
};

const readStoredCustomLyricsFont = (): StoredCustomLyricsFont | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    const saved = localStorage.getItem('lyrics_custom_font');
    if (!saved) return null;

    try {
        const parsed = JSON.parse(saved) as Partial<StoredCustomLyricsFont>;
        return resolveStoredCustomLyricsFont(parsed);
    } catch {
        return null;
    }
};

export type TypographySettingsState = {
    hidePlayerTranslationSubtitle: boolean;
    showSubtitleTranslation: boolean;
    subtitleContentMode: SubtitleContentMode;
    subtitleOverlayOpacity: number;
    subtitleOverlayBackground: boolean;
    subtitleUpcomingLyricsBlur: boolean;
    showHarmonySubtitle: boolean;
    harmonySubtitleBackground: boolean;
    lyricsFontStyle: Theme['fontStyle'];
    lyricsFontScale: number;
    /** 投给背屏那份 config 用的字号倍率；和主屏的 lyricsFontScale 各自独立。 */
    rearLyricsFontScale: number;
    /** 背屏「构图」微调：visualizer 模式名 -> scale/offsetX。只作用于背屏。 */
    rearLyricsFrames: Record<string, RearLyricsFrameValue>;
    /**
     * 背屏歌词显示区域的左侧避让宽度（CSS px）；null = 跟随原生实测的摄像头竖带宽度。
     * 这是「显示区域」的唯一可调项，和构图微调（渲染中心）不是同一件事。
     */
    rearLyricsSafeLeftCss: number | null;
    lyricsFontWeight: number | null;
    lyricsCustomFont: StoredCustomLyricsFont | null;
    lyricsFontFallbackFamilies: string[];
    subtitleFontInheritsLyrics: boolean;
    subtitleFontScale: number;
    subtitleFontStyle: Theme['fontStyle'];
    subtitleFontWeight: number | null;
    subtitleFontFamily: string | null;
    subtitleFontFallbackFamilies: string[];
    clearLyricsCustomFontAfterRestoreFailure: (message: StatusMessage) => void;
    handleToggleHidePlayerTranslationSubtitle: (enable: boolean) => void;
    handleToggleShowSubtitleTranslation: (enable: boolean) => void;
    handleSetSubtitleContentMode: (mode: SubtitleContentMode) => void;
    handleSetSubtitleOverlayOpacity: (opacity: number) => void;
    handleToggleSubtitleOverlayBackground: (enabled: boolean) => void;
    handleToggleSubtitleUpcomingLyricsBlur: (enabled: boolean) => void;
    handleToggleShowHarmonySubtitle: (enabled: boolean) => void;
    handleToggleHarmonySubtitleBackground: (enabled: boolean) => void;
    handleSetLyricsFontStyle: (fontStyle: Theme['fontStyle']) => void;
    handleSetLyricsFontScale: (fontScale: number) => void;
    handleSetRearLyricsFontScale: (fontScale: number) => void;
    /** 合并某个效果的构图微调；只写这个模式的字段，其余模式不动。 */
    handleSetRearLyricsFrame: (mode: string, patch: Partial<RearLyricsFrameValue>) => void;
    /** 某个效果回到出厂构图。 */
    handleResetRearLyricsFrame: (mode: string) => void;
    /** 用一张完整构图表替换本地表（外观导入用）；坏值按 clamp 规则修正。 */
    handleSetRearLyricsFrames: (frames: Record<string, Partial<RearLyricsFrameValue>> | null | undefined) => void;
    /** 设置左侧避让宽度；传 null 回到「跟随原生实测」。 */
    handleSetRearLyricsSafeLeftCss: (safeLeftCss: number | null) => void;
    handleSetLyricsFontWeight: (fontWeight: number | null) => void;
    handleSetLyricsCustomFont: (font: StoredCustomLyricsFont | null) => void;
    handleUploadLyricsCustomFont: (file: File) => Promise<{ ok: boolean; error?: string; }>;
    handleSetLyricsFontFallbackFamilies: (families: string[]) => void;
    handleSetSubtitleFontInheritsLyrics: (inheritsLyrics: boolean) => void;
    handleSetSubtitleFontScale: (fontScale: number) => void;
    handleSetSubtitleFontStyle: (fontStyle: Theme['fontStyle']) => void;
    handleSetSubtitleFontWeight: (fontWeight: number | null) => void;
    handleSetSubtitleFontFamily: (fontFamily: string | null) => void;
    handleSetSubtitleFontFallbackFamilies: (families: string[]) => void;
};

export const useTypographySettingsStore = create<TypographySettingsState>((set, get) => ({
    hidePlayerTranslationSubtitle: getStoredBoolean('hide_player_translation_subtitle', false),
    showSubtitleTranslation: readStoredSubtitleContentMode() !== 'none',
    subtitleContentMode: readStoredSubtitleContentMode(),
    subtitleOverlayOpacity: readStoredSubtitleOverlayOpacity(),
    subtitleOverlayBackground: getStoredBoolean(SUBTITLE_OVERLAY_BACKGROUND_STORAGE_KEY, true),
    subtitleUpcomingLyricsBlur: getStoredBoolean(SUBTITLE_UPCOMING_LYRICS_BLUR_STORAGE_KEY, true),
    showHarmonySubtitle: getStoredBoolean(SHOW_HARMONY_SUBTITLE_STORAGE_KEY, true),
    harmonySubtitleBackground: getStoredBoolean(HARMONY_SUBTITLE_BACKGROUND_STORAGE_KEY, true),
    lyricsFontStyle: readStoredLyricsFontStyle(),
    lyricsFontScale: readStoredFontScale('lyrics_font_scale'),
    rearLyricsFontScale: readStoredFontScale(
        REAR_LYRICS_FONT_SCALE_STORAGE_KEY,
        REAR_LYRICS_FONT_SCALE_MIN,
        REAR_LYRICS_FONT_SCALE_MAX,
    ),
    rearLyricsFrames: readStoredRearLyricsFrames(),
    rearLyricsSafeLeftCss: readStoredRearLyricsSafeLeftCss(),
    lyricsFontWeight: readStoredFontWeight(LYRICS_FONT_WEIGHT_STORAGE_KEY),
    lyricsCustomFont: readStoredCustomLyricsFont(),
    lyricsFontFallbackFamilies: readStoredFontFamilyStack(LYRICS_FONT_FALLBACK_FAMILIES_STORAGE_KEY),
    subtitleFontInheritsLyrics: getStoredBoolean(SUBTITLE_FONT_INHERITS_LYRICS_STORAGE_KEY, true),
    subtitleFontScale: readStoredFontScale(SUBTITLE_FONT_SCALE_STORAGE_KEY),
    subtitleFontStyle: readStoredSubtitleFontStyle(),
    subtitleFontWeight: readStoredFontWeight(SUBTITLE_FONT_WEIGHT_STORAGE_KEY),
    subtitleFontFamily: readStoredSubtitleFontFamily(),
    subtitleFontFallbackFamilies: readStoredFontFamilyStack(SUBTITLE_FONT_FALLBACK_FAMILIES_STORAGE_KEY),
    clearLyricsCustomFontAfterRestoreFailure: (message) => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('lyrics_custom_font');
        }
        set({ lyricsCustomFont: null });
        setStatusMessage(message);
    },
    handleToggleHidePlayerTranslationSubtitle: (enable) => {
        setStoredBoolean('hide_player_translation_subtitle', enable);
        set({ hidePlayerTranslationSubtitle: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'subtitleHidden' : 'subtitleShown')),
        });
    },
    handleToggleShowSubtitleTranslation: (enable) => {
        setStoredBoolean(SHOW_SUBTITLE_TRANSLATION_STORAGE_KEY, enable);
        const subtitleContentMode: SubtitleContentMode = enable ? 'translation' : 'none';
        if (typeof window !== 'undefined') {
            localStorage.setItem(SUBTITLE_CONTENT_MODE_STORAGE_KEY, subtitleContentMode);
        }
        set({ showSubtitleTranslation: enable, subtitleContentMode });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'translationShown' : 'translationHidden')),
        });
    },
    handleSetSubtitleContentMode: (subtitleContentMode) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(SUBTITLE_CONTENT_MODE_STORAGE_KEY, subtitleContentMode);
        }
        const showSubtitleTranslation = subtitleContentMode !== 'none';
        setStoredBoolean(SHOW_SUBTITLE_TRANSLATION_STORAGE_KEY, showSubtitleTranslation);
        set({ subtitleContentMode, showSubtitleTranslation });
        setStatusMessage({
            type: 'info',
            text: i18n.t(`notifications.subtitleMode.${subtitleContentMode}`),
        });
    },
    handleSetSubtitleOverlayOpacity: (opacity) => {
        const next = Math.min(1, Math.max(0.2, opacity));
        if (typeof window !== 'undefined') {
            localStorage.setItem(SUBTITLE_OVERLAY_OPACITY_STORAGE_KEY, String(next));
        }
        set({ subtitleOverlayOpacity: next });
    },
    handleToggleSubtitleOverlayBackground: (enabled) => {
        setStoredBoolean(SUBTITLE_OVERLAY_BACKGROUND_STORAGE_KEY, enabled);
        set({ subtitleOverlayBackground: enabled });
    },
    handleToggleSubtitleUpcomingLyricsBlur: (enabled) => {
        setStoredBoolean(SUBTITLE_UPCOMING_LYRICS_BLUR_STORAGE_KEY, enabled);
        set({ subtitleUpcomingLyricsBlur: enabled });
    },
    handleToggleShowHarmonySubtitle: (enabled) => {
        setStoredBoolean(SHOW_HARMONY_SUBTITLE_STORAGE_KEY, enabled);
        set({ showHarmonySubtitle: enabled });
    },
    handleToggleHarmonySubtitleBackground: (enabled) => {
        setStoredBoolean(HARMONY_SUBTITLE_BACKGROUND_STORAGE_KEY, enabled);
        set({ harmonySubtitleBackground: enabled });
    },
    handleSetLyricsFontStyle: (fontStyle) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('lyrics_font_style', fontStyle);
        }
        set({ lyricsFontStyle: fontStyle });
    },
    handleSetLyricsFontScale: (fontScale) => {
        const next = Math.min(LYRICS_FONT_SCALE_MAX, Math.max(LYRICS_FONT_SCALE_MIN, fontScale));
        if (typeof window !== 'undefined') {
            localStorage.setItem('lyrics_font_scale', String(next));
        }
        set({ lyricsFontScale: next });
    },
    handleSetRearLyricsFontScale: (fontScale) => {
        const next = Math.min(REAR_LYRICS_FONT_SCALE_MAX, Math.max(REAR_LYRICS_FONT_SCALE_MIN, fontScale));
        if (typeof window !== 'undefined') {
            localStorage.setItem(REAR_LYRICS_FONT_SCALE_STORAGE_KEY, String(next));
        }
        set({ rearLyricsFontScale: next });
    },
    handleSetRearLyricsFrame: (mode, patch) => {
        const key = mode?.trim();
        if (!key) {
            return;
        }
        const frames = readStoredRearLyricsFrames();
        /*
         * 以「出厂例外 + 已存值」为基线再合并本次补丁：
         * 面板只改一个字段时，partita 的 canvasX 150 / classic 的 effectScale 0.95
         * 不会被默认值顶掉；用户存过的字段仍然优先。
         */
        const builtin = BUILTIN_REAR_LYRICS_FRAME_OVERRIDES[key];
        const fallbackCanvasX = builtin?.canvasX ?? DEFAULT_REAR_LYRICS_FRAME.canvasX;
        const base = clampRearLyricsFrame({ ...builtin, ...frames[key] }, fallbackCanvasX);
        const next = {
            ...frames,
            [key]: clampRearLyricsFrame({ ...base, ...patch }, fallbackCanvasX),
        };
        if (typeof window !== 'undefined') {
            localStorage.setItem(REAR_LYRICS_FRAME_STORAGE_KEY, JSON.stringify(next));
        }
        set({ rearLyricsFrames: next });
    },
    handleResetRearLyricsFrame: (mode) => {
        const key = mode?.trim();
        if (!key) {
            return;
        }
        const frames = readStoredRearLyricsFrames();
        if (!(key in frames)) {
            return;
        }
        delete frames[key];
        if (typeof window !== 'undefined') {
            localStorage.setItem(REAR_LYRICS_FRAME_STORAGE_KEY, JSON.stringify(frames));
        }
        set({ rearLyricsFrames: frames });
    },
    handleSetRearLyricsFrames: (frames) => {
        const next: Record<string, RearLyricsFrameValue> = {};
        if (frames && typeof frames === 'object') {
            for (const [mode, value] of Object.entries(frames)) {
                const key = mode?.trim();
                if (!key || !value || typeof value !== 'object') {
                    continue;
                }
                const builtin = BUILTIN_REAR_LYRICS_FRAME_OVERRIDES[key];
                next[key] = clampRearLyricsFrame(
                    { ...builtin, ...value },
                    builtin?.canvasX ?? DEFAULT_REAR_LYRICS_FRAME.canvasX,
                );
            }
        }
        if (typeof window !== 'undefined') {
            localStorage.setItem(REAR_LYRICS_FRAME_STORAGE_KEY, JSON.stringify(next));
        }
        set({ rearLyricsFrames: next });
    },
    handleSetRearLyricsSafeLeftCss: (safeLeftCss) => {
        const next = clampRearLyricsSafeLeftCss(safeLeftCss);
        if (typeof window !== 'undefined') {
            if (next === null) localStorage.removeItem(REAR_LYRICS_SAFE_LEFT_STORAGE_KEY);
            else localStorage.setItem(REAR_LYRICS_SAFE_LEFT_STORAGE_KEY, String(next));
        }
        set({ rearLyricsSafeLeftCss: next });
    },
    handleSetLyricsFontWeight: (fontWeight) => {
        const next = normalizeFontWeight(fontWeight);
        if (typeof window !== 'undefined') {
            if (next === null) localStorage.removeItem(LYRICS_FONT_WEIGHT_STORAGE_KEY);
            else localStorage.setItem(LYRICS_FONT_WEIGHT_STORAGE_KEY, String(next));
        }
        set({ lyricsFontWeight: next });
    },
    handleSetLyricsCustomFont: (font) => {
        if (!font?.family?.trim()) {
            set({ lyricsCustomFont: null, lyricsFontFallbackFamilies: [] });
            if (typeof window !== 'undefined') {
                localStorage.removeItem('lyrics_custom_font');
                localStorage.removeItem(LYRICS_FONT_FALLBACK_FAMILIES_STORAGE_KEY);
            }
            void clearUploadedLyricsFont();
            return;
        }

        const next = resolveStoredCustomLyricsFont(font);
        if (!next) {
            set({ lyricsCustomFont: null, lyricsFontFallbackFamilies: [] });
            if (typeof window !== 'undefined') {
                localStorage.removeItem('lyrics_custom_font');
                localStorage.removeItem(LYRICS_FONT_FALLBACK_FAMILIES_STORAGE_KEY);
            }
            void clearUploadedLyricsFont();
            return;
        }

        if (next.source !== 'uploaded') {
            void clearUploadedLyricsFont();
        }

        set({ lyricsCustomFont: next });
        if (typeof window !== 'undefined') {
            localStorage.setItem('lyrics_custom_font', JSON.stringify(next));
        }
    },
    handleUploadLyricsCustomFont: async (file) => {
        try {
            const { meta } = await uploadAndRegisterLyricsFont(file);
            set({ lyricsCustomFont: meta });
            if (typeof window !== 'undefined') {
                localStorage.setItem('lyrics_custom_font', JSON.stringify(meta));
            }
            setStatusMessage({
                type: 'success',
                text: i18n.t('notifications.fontEnabled', { fontName: meta.label || meta.family }),
            });

            return { ok: true };
        } catch (error) {
            const message = error instanceof Error && error.message
                ? error.message
                : i18n.t('notifications.fontUploadFailed');
            setStatusMessage({ type: 'error', text: message });

            return { ok: false, error: message };
        }
    },
    handleSetLyricsFontFallbackFamilies: (families) => {
        const next = normalizeFontFamilyStack(families);
        storeFontFamilyStack(LYRICS_FONT_FALLBACK_FAMILIES_STORAGE_KEY, next);
        set({ lyricsFontFallbackFamilies: next });
    },
    handleSetSubtitleFontInheritsLyrics: (inheritsLyrics) => {
        setStoredBoolean(SUBTITLE_FONT_INHERITS_LYRICS_STORAGE_KEY, inheritsLyrics);
        set({ subtitleFontInheritsLyrics: inheritsLyrics });
    },
    handleSetSubtitleFontScale: (fontScale) => {
        const next = Math.min(LYRICS_FONT_SCALE_MAX, Math.max(LYRICS_FONT_SCALE_MIN, fontScale));
        if (typeof window !== 'undefined') {
            localStorage.setItem(SUBTITLE_FONT_SCALE_STORAGE_KEY, String(next));
        }
        set({ subtitleFontScale: next });
    },
    handleSetSubtitleFontStyle: (fontStyle) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(SUBTITLE_FONT_STYLE_STORAGE_KEY, fontStyle);
        }
        set({ subtitleFontStyle: fontStyle });
    },
    handleSetSubtitleFontWeight: (fontWeight) => {
        const next = normalizeFontWeight(fontWeight);
        if (typeof window !== 'undefined') {
            if (next === null) localStorage.removeItem(SUBTITLE_FONT_WEIGHT_STORAGE_KEY);
            else localStorage.setItem(SUBTITLE_FONT_WEIGHT_STORAGE_KEY, String(next));
        }
        set({ subtitleFontWeight: next });
    },
    handleSetSubtitleFontFamily: (fontFamily) => {
        const next = fontFamily?.trim() || null;
        if (typeof window !== 'undefined') {
            if (next) {
                localStorage.setItem(SUBTITLE_FONT_FAMILY_STORAGE_KEY, next);
            } else {
                localStorage.removeItem(SUBTITLE_FONT_FAMILY_STORAGE_KEY);
            }
        }
        set({ subtitleFontFamily: next });
    },
    handleSetSubtitleFontFallbackFamilies: (families) => {
        const next = normalizeFontFamilyStack(families);
        storeFontFamilyStack(SUBTITLE_FONT_FALLBACK_FAMILIES_STORAGE_KEY, next);
        set({ subtitleFontFallbackFamilies: next });
    },
}));

/** The typography half of the former settings snapshot, for the surfaces that edit it all. */
export const selectTypographySettingsSnapshot = (state: TypographySettingsState) => ({
    hidePlayerTranslationSubtitle: state.hidePlayerTranslationSubtitle,
    showSubtitleTranslation: state.showSubtitleTranslation,
    subtitleContentMode: state.subtitleContentMode,
    subtitleOverlayOpacity: state.subtitleOverlayOpacity,
    subtitleOverlayBackground: state.subtitleOverlayBackground,
    subtitleUpcomingLyricsBlur: state.subtitleUpcomingLyricsBlur,
    showHarmonySubtitle: state.showHarmonySubtitle,
    harmonySubtitleBackground: state.harmonySubtitleBackground,
    lyricsFontStyle: state.lyricsFontStyle,
    lyricsFontScale: state.lyricsFontScale,
    rearLyricsFontScale: state.rearLyricsFontScale,
    lyricsFontWeight: state.lyricsFontWeight,
    lyricsCustomFont: state.lyricsCustomFont,
    lyricsFontFallbackFamilies: state.lyricsFontFallbackFamilies,
    subtitleFontInheritsLyrics: state.subtitleFontInheritsLyrics,
    subtitleFontScale: state.subtitleFontScale,
    subtitleFontStyle: state.subtitleFontStyle,
    subtitleFontWeight: state.subtitleFontWeight,
    subtitleFontFamily: state.subtitleFontFamily,
    subtitleFontFallbackFamilies: state.subtitleFontFallbackFamilies,
    handleToggleHidePlayerTranslationSubtitle: state.handleToggleHidePlayerTranslationSubtitle,
    handleToggleShowSubtitleTranslation: state.handleToggleShowSubtitleTranslation,
    handleSetSubtitleContentMode: state.handleSetSubtitleContentMode,
    handleSetSubtitleOverlayOpacity: state.handleSetSubtitleOverlayOpacity,
    handleToggleSubtitleOverlayBackground: state.handleToggleSubtitleOverlayBackground,
    handleToggleSubtitleUpcomingLyricsBlur: state.handleToggleSubtitleUpcomingLyricsBlur,
    handleToggleShowHarmonySubtitle: state.handleToggleShowHarmonySubtitle,
    handleToggleHarmonySubtitleBackground: state.handleToggleHarmonySubtitleBackground,
    handleSetLyricsFontStyle: state.handleSetLyricsFontStyle,
    handleSetLyricsFontScale: state.handleSetLyricsFontScale,
    handleSetRearLyricsFontScale: state.handleSetRearLyricsFontScale,
    handleSetRearLyricsFrame: state.handleSetRearLyricsFrame,
    handleResetRearLyricsFrame: state.handleResetRearLyricsFrame,
    handleSetRearLyricsFrames: state.handleSetRearLyricsFrames,
    rearLyricsFrames: state.rearLyricsFrames,
    rearLyricsSafeLeftCss: state.rearLyricsSafeLeftCss,
    handleSetRearLyricsSafeLeftCss: state.handleSetRearLyricsSafeLeftCss,
    handleSetLyricsFontWeight: state.handleSetLyricsFontWeight,
    handleSetLyricsCustomFont: state.handleSetLyricsCustomFont,
    handleUploadLyricsCustomFont: state.handleUploadLyricsCustomFont,
    handleSetLyricsFontFallbackFamilies: state.handleSetLyricsFontFallbackFamilies,
    handleSetSubtitleFontInheritsLyrics: state.handleSetSubtitleFontInheritsLyrics,
    handleSetSubtitleFontScale: state.handleSetSubtitleFontScale,
    handleSetSubtitleFontStyle: state.handleSetSubtitleFontStyle,
    handleSetSubtitleFontWeight: state.handleSetSubtitleFontWeight,
    handleSetSubtitleFontFamily: state.handleSetSubtitleFontFamily,
    handleSetSubtitleFontFallbackFamilies: state.handleSetSubtitleFontFallbackFamilies,
    clearLyricsCustomFontAfterRestoreFailure: state.clearLyricsCustomFontAfterRestoreFailure,
    lyricsCustomFontFamily: state.lyricsCustomFont?.family ?? null,
    lyricsCustomFontLabel: state.lyricsCustomFont?.label ?? null,
});
