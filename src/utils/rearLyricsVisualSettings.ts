import type {
    VisualizerMode,
} from '../types';
import type { VisualizerTuningBundle } from '../components/visualizer/tuningRegistry';
import type { VisualizerBackgroundConfig } from '../components/visualizer/backgrounds/definition';
import type { ObsBrowserSourceConfig, RearLyricsVisualOverride } from '../types/obsBrowserSource';
import type { RearLyricsSettingsPatch } from '../services/rearLyricsBridge';

// src/utils/rearLyricsVisualSettings.ts
// 背屏视觉设置的「稀疏覆盖」模型。
//
// 背屏不需要复制一份主屏视觉 store：它只需要记住「和主屏不一样的那几项」。发布时把这份覆盖
// 深合并到主屏 config 上，背屏页就得到一份完整、独立的渲染配置；没被覆盖的字段继续跟随主屏。
// 这样主屏新增视觉字段时，背屏不会因为漏同步而变成空白，也不会把主屏的值反向写回去。

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
);

/**
 * 深合并覆盖：对象递归，数组和标量直接替换，显式 null 保留。
 *
 * <p>tuning / background 这类嵌套对象必须递归，否则背屏只调一个参数就会把主屏那一整块
 * 设置顶掉；数组（URL 背景列表、字体回退链）整体替换，避免出现两份列表拼在一起。
 */
const mergeDefined = <T>(base: T, patch: unknown): T => {
    if (!isPlainObject(patch)) {
        return patch as T;
    }
    const next: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        next[key] = isPlainObject(value) && isPlainObject(next[key])
            ? mergeDefined(next[key], value)
            : value;
    }
    return next as T;
};

/**
 * 把背屏覆盖合并到主屏 config 上，得到背屏页真正使用的配置。
 *
 * <p>合并顺序固定为：主屏 config → 背屏视觉覆盖 → 旧版 rearLyricsFontScale / rearLyricsFrames。
 * 旧字段排在最后是为了兼容已经落盘的旧设置：它们语义就是背屏专用，理应压过主屏值。
 */
export const mergeRearLyricsVisualConfig = (
    mainConfig: ObsBrowserSourceConfig,
    override: RearLyricsVisualOverride | null | undefined,
): ObsBrowserSourceConfig => {
    if (!override || Object.keys(override).length === 0) {
        return mainConfig;
    }
    const merged: ObsBrowserSourceConfig = { ...mainConfig };
    if (override.visualizerMode !== undefined) merged.visualizerMode = override.visualizerMode;
    if (override.visualizerOpacity !== undefined) merged.visualizerOpacity = override.visualizerOpacity;
    if (override.staticMode !== undefined) merged.staticMode = override.staticMode;
    if (override.visualizerTunings !== undefined) {
        merged.visualizerTunings = mergeDefined(mainConfig.visualizerTunings ?? {}, override.visualizerTunings);
    }
    if (override.background !== undefined) {
        merged.background = mergeDefined(mainConfig.background ?? {}, override.background);
    }
    if (override.lyricsFontStyle !== undefined) merged.lyricsFontStyle = override.lyricsFontStyle;
    if (override.lyricsFontWeight !== undefined) merged.lyricsFontWeight = override.lyricsFontWeight;
    if (override.hideTranslationSubtitle !== undefined) merged.hideTranslationSubtitle = override.hideTranslationSubtitle;
    if (override.showSubtitleTranslation !== undefined) merged.showSubtitleTranslation = override.showSubtitleTranslation;
    if (override.subtitleContentMode !== undefined) merged.subtitleContentMode = override.subtitleContentMode;
    if (override.subtitleOverlayOpacity !== undefined) merged.subtitleOverlayOpacity = override.subtitleOverlayOpacity;
    if (override.subtitleOverlayBackground !== undefined) merged.subtitleOverlayBackground = override.subtitleOverlayBackground;
    if (override.subtitleUpcomingLyricsBlur !== undefined) merged.subtitleUpcomingLyricsBlur = override.subtitleUpcomingLyricsBlur;
    if (override.showHarmonySubtitle !== undefined) merged.showHarmonySubtitle = override.showHarmonySubtitle;
    if (override.harmonySubtitleBackground !== undefined) merged.harmonySubtitleBackground = override.harmonySubtitleBackground;
    if (override.subtitleFontInheritsLyrics !== undefined) merged.subtitleFontInheritsLyrics = override.subtitleFontInheritsLyrics;
    if (override.subtitleFontScale !== undefined) merged.subtitleFontScale = override.subtitleFontScale;
    if (override.subtitleFontStyle !== undefined) merged.subtitleFontStyle = override.subtitleFontStyle;
    if (override.subtitleFontWeight !== undefined) merged.subtitleFontWeight = override.subtitleFontWeight;
    if (override.subtitleFontFamily !== undefined) merged.subtitleFontFamily = override.subtitleFontFamily;
    if (override.subtitleFontFallbackFamilies !== undefined) {
        merged.subtitleFontFallbackFamilies = override.subtitleFontFallbackFamilies;
    }
    // 背屏全局字号永远用背屏专用字段；旧 config 没有它时按 1x，不继承主屏字号。
    merged.lyricsFontScale = mainConfig.rearLyricsFontScale ?? 1;
    return merged;
};

/** 覆盖里是否真的记了东西；空覆盖不发布，保持旧的「只发主屏 config」路径。 */
export const hasRearLyricsVisualOverride = (
    override: RearLyricsVisualOverride | null | undefined,
): boolean => Boolean(override && Object.keys(override).length > 0);

const setBackgroundCommon = (
    override: RearLyricsVisualOverride,
    base: RearLyricsVisualPatchBase,
    patch: Partial<NonNullable<VisualizerBackgroundConfig['common']>>,
): RearLyricsVisualOverride => ({
    ...override,
    background: mergeDefined(
        mergeDefined(base.background ?? {}, override.background ?? {}),
        { common: patch },
    ),
});

const setBackgroundTuning = (
    override: RearLyricsVisualOverride,
    base: RearLyricsVisualPatchBase,
    mode: string,
    patch: Record<string, unknown>,
): RearLyricsVisualOverride => {
    const baseBackground = mergeDefined(base.background ?? {}, override.background ?? {});
    const currentMode = isPlainObject(baseBackground[mode]) ? baseBackground[mode] as Record<string, unknown> : {};
    return {
        ...override,
        background: mergeDefined(baseBackground, {
            [mode]: { tuning: mergeDefined(currentMode.tuning ?? {}, patch) },
        }),
    };
};

const setVisualizerTuning = (
    override: RearLyricsVisualOverride,
    base: RearLyricsVisualPatchBase,
    mode: string,
    patch: Record<string, unknown>,
): RearLyricsVisualOverride => {
    const currentBundle = mergeDefined(base.visualizerTunings ?? {}, override.visualizerTunings ?? {});
    const currentMode = isPlainObject(currentBundle[mode]) ? currentBundle[mode] as Record<string, unknown> : {};
    return {
        ...override,
        visualizerTunings: mergeDefined(currentBundle, {
            [mode]: mergeDefined(currentMode, patch),
        }),
    };
};

const omitKeys = <T extends Record<string, unknown>>(source: T, keys: readonly string[]): T => {
    const next: Record<string, unknown> = { ...source };
    for (const key of keys) {
        delete next[key];
    }
    return next as T;
};

const SUBTITLE_OVERRIDE_KEYS = [
    'hideTranslationSubtitle',
    'showSubtitleTranslation',
    'subtitleContentMode',
    'subtitleOverlayOpacity',
    'subtitleOverlayBackground',
    'subtitleUpcomingLyricsBlur',
    'showHarmonySubtitle',
    'harmonySubtitleBackground',
    'subtitleFontInheritsLyrics',
    'subtitleFontScale',
    'subtitleFontStyle',
    'subtitleFontWeight',
    'subtitleFontFamily',
    'subtitleFontFallbackFamilies',
] as const;

/**
 * 把背屏设置面板发来的补丁折算成新的覆盖对象。
 *
 * <p>它只处理视觉字段；控制页那些播放状态字段（音量 / 静音 / 循环 / 喜爱）由 App 原逻辑处理，
 * 不会被这里吞掉。返回值是「主屏值 + 已有覆盖 + 本次补丁」的新覆盖，绝不写主屏 store。
 */
export interface RearLyricsVisualPatchBase {
    visualizerTunings?: VisualizerTuningBundle;
    background?: VisualizerBackgroundConfig;
}

export const applyRearLyricsVisualPatch = (
    base: RearLyricsVisualPatchBase,
    current: RearLyricsVisualOverride | null | undefined,
    patch: RearLyricsSettingsPatch,
): RearLyricsVisualOverride => {
    let next: RearLyricsVisualOverride = { ...(current ?? {}) };

    if (patch.visualizerMode !== undefined) {
        next = { ...next, visualizerMode: patch.visualizerMode as VisualizerMode };
    }
    if (patch.visualizerOpacity !== undefined) {
        next = { ...next, visualizerOpacity: patch.visualizerOpacity };
    }
    if (patch.backgroundMode !== undefined) {
        next = {
            ...next,
            background: mergeDefined(base.background ?? {}, { ...(next.background ?? {}), mode: patch.backgroundMode }),
        };
    }
    if (patch.backgroundOpacity !== undefined) {
        next = setBackgroundCommon(next, base, { opacity: patch.backgroundOpacity });
    }
    if (patch.useCoverColorBg !== undefined) {
        next = setBackgroundCommon(next, base, { useCoverColorBg: patch.useCoverColorBg });
    }
    if (patch.disableVignette !== undefined) {
        next = setBackgroundCommon(next, base, { disableVignette: patch.disableVignette });
    }
    if (patch.disableGeometricBackground !== undefined) {
        next = setBackgroundCommon(next, base, { disableGeometricBackground: patch.disableGeometricBackground });
    }
    if (patch.tuningPatch) {
        next = setVisualizerTuning(next, base, patch.tuningPatch.mode, patch.tuningPatch.patch);
    }
    if (patch.resetTuning) {
        const bundle = { ...(next.visualizerTunings ?? {}) } as Record<string, unknown>;
        delete bundle[patch.resetTuning];
        next = { ...next, visualizerTunings: bundle as VisualizerTuningBundle };
    }
    if (patch.backgroundTuningPatch) {
        next = setBackgroundTuning(next, base, patch.backgroundTuningPatch.mode, patch.backgroundTuningPatch.patch);
    }
    if (patch.resetBackgroundTuning) {
        const background = { ...(next.background ?? {}) } as Record<string, unknown>;
        delete background[patch.resetBackgroundTuning];
        next = { ...next, background: background as VisualizerBackgroundConfig };
    }

    // URL 背景列表：覆盖层从主屏那份列表起步，改完整体存进覆盖，之后背屏列表就和主屏解耦。
    const baseUrl = base.background?.url;
    const overrideUrl = next.background?.url;
    const currentItems = overrideUrl?.items ?? baseUrl?.items ?? [];
    const currentSelectedId = overrideUrl && 'selectedId' in overrideUrl
        ? overrideUrl.selectedId
        : baseUrl?.selectedId ?? null;
    let urlTouched = false;
    let nextItems = currentItems;
    let nextSelectedId = currentSelectedId;
    if (patch.urlBackgroundAdd) {
        nextItems = [...currentItems, patch.urlBackgroundAdd];
        urlTouched = true;
    }
    if (patch.urlBackgroundUpdate) {
        const target = patch.urlBackgroundUpdate;
        nextItems = currentItems.map(item => (
            item.id === target.id ? { ...item, ...target.patch, id: item.id } : item
        ));
        urlTouched = true;
    }
    if (patch.urlBackgroundDelete !== undefined) {
        nextItems = currentItems.filter(item => item.id !== patch.urlBackgroundDelete);
        urlTouched = true;
    }
    if (patch.urlBackgroundSelectedId !== undefined) {
        nextSelectedId = patch.urlBackgroundSelectedId;
        urlTouched = true;
    }
    if (urlTouched) {
        next = {
            ...next,
            background: mergeDefined(base.background ?? {}, {
                ...(next.background ?? {}),
                url: { items: nextItems, selectedId: nextSelectedId },
            }),
        };
    }

    if (patch.lyricsFontStyle !== undefined) next = { ...next, lyricsFontStyle: patch.lyricsFontStyle };
    if (patch.lyricsFontWeight !== undefined) next = { ...next, lyricsFontWeight: patch.lyricsFontWeight };
    if (patch.hideTranslationSubtitle !== undefined) next = { ...next, hideTranslationSubtitle: patch.hideTranslationSubtitle };
    if (patch.showSubtitleTranslation !== undefined) next = { ...next, showSubtitleTranslation: patch.showSubtitleTranslation };
    if (patch.subtitleContentMode !== undefined) next = { ...next, subtitleContentMode: patch.subtitleContentMode };
    if (patch.subtitleOverlayOpacity !== undefined) next = { ...next, subtitleOverlayOpacity: patch.subtitleOverlayOpacity };
    if (patch.subtitleOverlayBackground !== undefined) next = { ...next, subtitleOverlayBackground: patch.subtitleOverlayBackground };
    if (patch.subtitleUpcomingLyricsBlur !== undefined) next = { ...next, subtitleUpcomingLyricsBlur: patch.subtitleUpcomingLyricsBlur };
    if (patch.showHarmonySubtitle !== undefined) next = { ...next, showHarmonySubtitle: patch.showHarmonySubtitle };
    if (patch.harmonySubtitleBackground !== undefined) next = { ...next, harmonySubtitleBackground: patch.harmonySubtitleBackground };
    if (patch.subtitleFontInheritsLyrics !== undefined) next = { ...next, subtitleFontInheritsLyrics: patch.subtitleFontInheritsLyrics };
    if (patch.subtitleFontScale !== undefined) next = { ...next, subtitleFontScale: patch.subtitleFontScale };
    if (patch.subtitleFontStyle !== undefined) next = { ...next, subtitleFontStyle: patch.subtitleFontStyle };
    if (patch.subtitleFontWeight !== undefined) next = { ...next, subtitleFontWeight: patch.subtitleFontWeight };
    if (patch.subtitleFontFamily !== undefined) next = { ...next, subtitleFontFamily: patch.subtitleFontFamily };
    if (patch.subtitleFontFallbackFamilies !== undefined) {
        next = { ...next, subtitleFontFallbackFamilies: patch.subtitleFontFallbackFamilies };
    }

    if (patch.resetCommonSettings) {
        next = omitKeys(next as Record<string, unknown>, ['lyricsFontStyle', 'lyricsFontWeight', 'visualizerOpacity']) as RearLyricsVisualOverride;
    }
    if (patch.resetSubtitleSettings) {
        next = omitKeys(next as Record<string, unknown>, SUBTITLE_OVERRIDE_KEYS) as RearLyricsVisualOverride;
    }

    return next;
};

/** 覆盖对象里允许导入导出的字段；导入时只认这些键，防止脏数据混进 store。 */
export const REAR_LYRICS_VISUAL_OVERRIDE_KEYS = [
    'visualizerMode',
    'visualizerOpacity',
    'visualizerTunings',
    'background',
    'lyricsFontStyle',
    'lyricsFontWeight',
    'lyricsFontFallbackFamilies',
    'lyricsCustomFontFamily',
    'hideTranslationSubtitle',
    'showSubtitleTranslation',
    'subtitleContentMode',
    'subtitleOverlayOpacity',
    'subtitleOverlayBackground',
    'subtitleUpcomingLyricsBlur',
    'showHarmonySubtitle',
    'harmonySubtitleBackground',
    'subtitleFontInheritsLyrics',
    'subtitleFontScale',
    'subtitleFontStyle',
    'subtitleFontWeight',
    'subtitleFontFamily',
    'subtitleFontFallbackFamilies',
    'staticMode',
] as const;

/** 只保留白名单字段；导入外部配置时用。 */
export const sanitizeRearLyricsVisualOverride = (
    value: unknown,
): RearLyricsVisualOverride => {
    if (!isPlainObject(value)) {
        return {};
    }
    const next: Record<string, unknown> = {};
    for (const key of REAR_LYRICS_VISUAL_OVERRIDE_KEYS) {
        if (key in value && value[key] !== undefined) {
            next[key] = value[key];
        }
    }
    return next as RearLyricsVisualOverride;
};
