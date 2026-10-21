import React from 'react';
import type { Theme, VisualizerMode } from '../../types';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import type { RearLyricsSettingsPatch } from '../../services/rearLyricsBridge';
import { useMissingFoliumSelections } from '@/mods/folium/missingEntries';
import { VISUALIZER_REGISTRY, getVisualizerModeLabel, getVisualizerRegistryEntry } from '../visualizer/registry';
import { RearPresetGroup, RearResetButton, RearSectionCard } from './RearLyricsPanelControls';

// src/components/rear/RearLyricsPanelVisualizer.tsx
// 背屏设置弹窗「歌词动画」页：只保留主屏同款模式选择和默认还原。

interface RearLyricsPanelVisualizerProps {
    config: ObsBrowserSourceConfig;
    theme: Theme;
    isDaylight: boolean;
    t: (key: string) => string;
    onSettings: (patch: RearLyricsSettingsPatch) => void;
}

const RearLyricsPanelVisualizer: React.FC<RearLyricsPanelVisualizerProps> = ({
    config,
    theme,
    isDaylight,
    t,
    onSettings,
}) => {
    const mode = config.visualizerMode;
    const entry = getVisualizerRegistryEntry(mode);
    // 保存的方案来自未加载模组时，与主屏一样展示说明。
    const missing = useMissingFoliumSelections().find(item => item.kind === 'visualizer');
    const modeOptions = VISUALIZER_REGISTRY.map(item => ({
        label: getVisualizerModeLabel(item.mode, t),
        value: item.mode,
    }));

    return (
        <div className="space-y-4">
            <RearSectionCard
                title={t('options.lyricsRenderer')}
                description={t('options.lyricsRendererDesc')}
                action={entry.resetSettings ? (
                    <RearResetButton
                        label={t('ui.default')}
                        theme={theme}
                        onClick={() => onSettings({ resetTuning: mode })}
                    />
                ) : undefined}
                theme={theme}
                isDaylight={isDaylight}
            >
                <RearPresetGroup<VisualizerMode>
                    label={t('options.visualizerMode')}
                    value={mode}
                    options={modeOptions}
                    onChange={next => onSettings({ visualizerMode: next })}
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

export default RearLyricsPanelVisualizer;
