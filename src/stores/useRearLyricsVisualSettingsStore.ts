import { create } from 'zustand';
import type { RearLyricsVisualOverride } from '../types/obsBrowserSource';
import { sanitizeRearLyricsVisualOverride } from '../utils/rearLyricsVisualSettings';

// src/stores/useRearLyricsVisualSettingsStore.ts
// 背屏专属视觉覆盖。它只存「和主屏不一样的那几项」，不复制主屏 store，也不反向写主屏。
// 主屏「歌词样式」窗口读写主屏 store；背屏「背屏歌词样式」窗口读写这里，两条链路互不影响。

const REAR_LYRICS_VISUAL_STORAGE_KEY = 'rear_lyrics_visual_settings';

/**
 * 背屏视觉覆盖的出厂值：来自真机导出的「全部背屏歌词样式」。
 *
 * <p>只放「和主屏不一样的那几项」；用户存过自己的覆盖后，仍然以用户值为准。
 * 新装 / 重置时背屏默认拿这一份，避免每次都要从主屏样式重新调一遍。
 */
export const DEFAULT_REAR_LYRICS_VISUAL_OVERRIDE: RearLyricsVisualOverride = {
    visualizerMode: 'sonnet',
    visualizerOpacity: 1,
    background: { mode: 'monet' },
    subtitleOverlayOpacity: 0.7,
    subtitleOverlayBackground: true,
};

const readStoredOverride = (): RearLyricsVisualOverride => {
    if (typeof window === 'undefined') {
        return DEFAULT_REAR_LYRICS_VISUAL_OVERRIDE;
    }
    const saved = localStorage.getItem(REAR_LYRICS_VISUAL_STORAGE_KEY);
    if (!saved) {
        return DEFAULT_REAR_LYRICS_VISUAL_OVERRIDE;
    }
    try {
        const parsed = sanitizeRearLyricsVisualOverride(JSON.parse(saved) as unknown);
        return Object.keys(parsed).length > 0 ? parsed : DEFAULT_REAR_LYRICS_VISUAL_OVERRIDE;
    } catch {
        return DEFAULT_REAR_LYRICS_VISUAL_OVERRIDE;
    }
};

interface RearLyricsVisualSettingsState {
    override: RearLyricsVisualOverride;
    setOverride: (override: RearLyricsVisualOverride) => void;
    resetOverride: () => void;
}

export const useRearLyricsVisualSettingsStore = create<RearLyricsVisualSettingsState>((set) => ({
    override: readStoredOverride(),
    setOverride: (override) => {
        const next = sanitizeRearLyricsVisualOverride(override);
        if (typeof window !== 'undefined') {
            if (Object.keys(next).length === 0) {
                localStorage.removeItem(REAR_LYRICS_VISUAL_STORAGE_KEY);
            } else {
                localStorage.setItem(REAR_LYRICS_VISUAL_STORAGE_KEY, JSON.stringify(next));
            }
        }
        set({ override: next });
    },
    resetOverride: () => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(REAR_LYRICS_VISUAL_STORAGE_KEY);
        }
        set({ override: DEFAULT_REAR_LYRICS_VISUAL_OVERRIDE });
    },
}));

export { REAR_LYRICS_VISUAL_STORAGE_KEY };
