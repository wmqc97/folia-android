import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Theme, VisualizerBackgroundMode } from '../../types';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import type { RearLyricsSettingsPatch } from '../../services/rearLyricsBridge';
import type { VisualizerBackgroundActions } from '../visualizer/backgrounds/definition';
import { useMissingFoliumSelections } from '@/mods/folium/missingEntries';
import { usePlayerChromeSettingsStore } from '../../stores/usePlayerChromeSettingsStore';
import {
    DEFAULT_VISUALIZER_BACKGROUND_MODE,
    VISUALIZER_BACKGROUND_REGISTRY,
    getVisualizerBackgroundModeLabel,
    getVisualizerBackgroundRegistryEntry,
} from '../visualizer/backgrounds/registry';
import { RearPresetGroup, RearResetButton, RearSectionCard } from './RearLyricsPanelControls';

// src/components/rear/RearLyricsPanelBackground.tsx
// 背屏设置弹窗「背景」页：只保留主屏同款模式选择和默认还原。

interface RearLyricsPanelBackgroundProps {
    config: ObsBrowserSourceConfig;
    theme: Theme;
    isDaylight: boolean;
    t: (key: string) => string;
    onSettings: (patch: RearLyricsSettingsPatch) => void;
}

const RearLyricsPanelBackground: React.FC<RearLyricsPanelBackgroundProps> = ({
    config,
    theme,
    isDaylight,
    t,
    onSettings,
}) => {
    const backgroundConfig = config.background;
    const mode = backgroundConfig?.mode ?? DEFAULT_VISUALIZER_BACKGROUND_MODE;
    const entry = getVisualizerBackgroundRegistryEntry(mode);
    // 原生毛玻璃开启时，背景设置与主屏一样整体无效，先展示提示。
    const enablePlayerPageNativeBlur = usePlayerChromeSettingsStore(state => state.enablePlayerPageNativeBlur);
    const missing = useMissingFoliumSelections().find(item => item.kind === 'background');

    const modeOptions = VISUALIZER_BACKGROUND_REGISTRY.map(item => ({
        label: getVisualizerBackgroundModeLabel(item.mode, t),
        value: item.mode,
    }));

    // 默认还原仍沿用主屏同一套背景 actions；这里不接入详细调参回调。
    const actions: VisualizerBackgroundActions = {
        onModeChange: next => onSettings({ backgroundMode: next }),
        common: {
            onCoverColorChange: enabled => onSettings({ useCoverColorBg: enabled }),
            onOpacityChange: value => onSettings({ backgroundOpacity: value }),
            onDisableGeometricChange: disabled => onSettings({ disableGeometricBackground: disabled }),
            onDisableVignetteChange: disabled => onSettings({ disableVignette: disabled }),
        },
        monet: { onResetTuning: () => onSettings({ resetBackgroundTuning: 'monet' }) },
        nomand: { onResetTuning: () => onSettings({ resetBackgroundTuning: 'nomand' }) },
        latent: { onResetTuning: () => onSettings({ resetBackgroundTuning: 'latent' }) },
        sora: { onResetTuning: () => onSettings({ resetBackgroundTuning: 'sora' }) },
    };

    return (
        <div className="space-y-4">
            {enablePlayerPageNativeBlur && (
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-500 dark:text-amber-400">
                    <AlertTriangle size={16} className="shrink-0 text-amber-500" />
                    <span>{t('options.nativeBlurBackgroundNotice')}</span>
                </div>
            )}
            <RearSectionCard
                title={t('options.previewBackgroundSettings')}
                description={t('options.previewBackgroundSettingsDesc')}
                action={entry.resetSettings ? (
                    <RearResetButton
                        label={t('ui.default')}
                        theme={theme}
                        onClick={() => entry.resetSettings?.(actions)}
                    />
                ) : undefined}
                theme={theme}
                isDaylight={isDaylight}
            >
                <RearPresetGroup<VisualizerBackgroundMode>
                    label={t('options.visualizerBackgroundMode')}
                    value={mode}
                    options={modeOptions}
                    onChange={next => onSettings({ backgroundMode: next })}
                    theme={theme}
                    isDaylight={isDaylight}
                />
                {missing && (
                    <div className="text-xs opacity-70" style={{ color: theme.secondaryColor }}>
                        {t('options.foliumMissingSelection').replace('{{modId}}', missing.modId)}
                    </div>
                )}
            </RearSectionCard>
        </div>
    );
};

export default RearLyricsPanelBackground;
