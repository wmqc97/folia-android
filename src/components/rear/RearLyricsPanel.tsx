import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileAudio, FileText, Heart, ListMusic, SlidersHorizontal, User, X } from 'lucide-react';
import type { Theme, VisualizerBackgroundMode } from '../../types';
import type { AudioQualityPreference } from '../../types/onlineMusic';
import { colorWithAlpha } from '../visualizer/colorMix';
import {
    getVisualizerModeLabel,
    VISUALIZER_REGISTRY,
} from '../visualizer/registry';
import {
    getVisualizerBackgroundModeLabel,
    VISUALIZER_BACKGROUND_REGISTRY,
} from '../visualizer/backgrounds/registry';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import type { RearLyricsCommand } from '../../services/rearLyricsBridge';
import { resolveRearCornerRadiusCss } from '../../services/rearLyricsBridge';
import ControlsTab from '../panelTab/ControlsTab';
import RearLyricsPanelLyrics from './RearLyricsPanelLyrics';
import RearLyricsPanelQueue from './RearLyricsPanelQueue';
import {
    buildRearPanelVars,
    resolveRearPanelChrome,
    resolveRearPanelShellClass,
} from './rearPanelStyle';

// src/components/rear/RearLyricsPanel.tsx
// 背屏设置弹窗：照主屏歌曲界面右侧面板的五个页签，只去掉顶部封面大图。

type RearSongPanelTab = 'file' | 'controls' | 'lyrics' | 'queue' | 'account';

const PANEL_TABS: { id: RearSongPanelTab; icon: typeof FileAudio }[] = [
    { id: 'file', icon: FileAudio },
    { id: 'lyrics', icon: FileText },
    { id: 'queue', icon: ListMusic },
    { id: 'controls', icon: SlidersHorizontal },
    { id: 'account', icon: User },
];

const AUDIO_QUALITY_OPTIONS: { value: AudioQualityPreference; labelKey: string }[] = [
    { value: 'standard', labelKey: 'account.qualityStandard' },
    { value: 'high', labelKey: 'account.qualityExhigh' },
    { value: 'lossless', labelKey: 'account.qualityLossless' },
    { value: 'hires', labelKey: 'account.qualityHires' },
];

const getPanelTabLabel = (tab: RearSongPanelTab, t: (key: string) => string): string => {
    if (tab === 'file') return t('localMusic.fileInfo');
    if (tab === 'controls') return t('options.rearLyricsPanelSettings');
    if (tab === 'lyrics') return t('localMusic.lyrics');
    if (tab === 'queue') return t('panel.playlist');
    return t('panel.account');
};

const buildRearThemeSourceModel = (config: ObsBrowserSourceConfig) => {
    const theme = config.theme;
    const activeSource = config.bgMode ?? 'default';
    const hasCustomTheme = config.hasCustomTheme ?? false;
    return {
    activeSource,
    current: {
        source: activeSource,
        available: true,
        editable: activeSource !== 'default',
        theme,
        label: theme.name,
        swatchColor: theme.backgroundColor,
    },
    options: {
        default: {
            source: 'default' as const,
            available: true,
            editable: false,
            theme,
            label: theme.name,
            swatchColor: theme.backgroundColor,
        },
        ai: {
            source: 'ai' as const,
            available: true,
            editable: true,
            theme,
            label: theme.name,
            swatchColor: theme.backgroundColor,
        },
        custom: {
            source: 'custom' as const,
            available: hasCustomTheme,
            editable: hasCustomTheme,
            theme: hasCustomTheme ? theme : null,
            label: hasCustomTheme ? theme.name : '',
            swatchColor: hasCustomTheme ? theme.backgroundColor : 'transparent',
        },
    },
    editableSource: activeSource === 'custom' && hasCustomTheme ? 'custom' : activeSource === 'ai' ? 'ai' : null,
    canOpenQuickEditor: false,
    hasLocalAiTheme: false,
    };
};

interface RearLyricsPanelProps {
    config: ObsBrowserSourceConfig | null;
    safeLeftCss: number;
    currentLineIndex: number;
    onCommand: (command: RearLyricsCommand) => void;
    onClose: () => void;
}

const RearLyricsPanel: React.FC<RearLyricsPanelProps> = ({
    config,
    safeLeftCss,
    currentLineIndex,
    onCommand,
    onClose,
}) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<RearSongPanelTab>('file');

    if (!config) {
        return null;
    }

    const theme = config.theme;
    const isDaylight = config.isDaylight;
    const chrome = resolveRearPanelChrome(isDaylight);
    const tabSwitcherBg = isDaylight ? 'bg-black/5' : 'bg-white/5';
    const activeTabBg = isDaylight ? 'bg-white shadow-sm' : 'bg-white/20 shadow-sm';
    const cornerRadiusCss = resolveRearCornerRadiusCss();
    const visualizerModes = VISUALIZER_REGISTRY.map(entry => entry.mode);
    const backgroundModes = VISUALIZER_BACKGROUND_REGISTRY.map(entry => entry.mode);
    const currentBackgroundMode: VisualizerBackgroundMode = config.background?.mode ?? backgroundModes[0] ?? 'common';
    const stepMode = <T,>(modes: T[], current: T | undefined, delta: -1 | 1): T => {
        if (modes.length === 0) return current as T;
        const currentIndex = modes.findIndex(mode => mode === current);
        const nextIndex = ((currentIndex < 0 ? 0 : currentIndex) + delta + modes.length) % modes.length;
        return modes[nextIndex];
    };

    return (
        <div
            className={`absolute z-30 flex flex-col overflow-hidden shadow-2xl backdrop-blur-3xl ${resolveRearPanelShellClass(isDaylight)}`}
            style={{
                left: safeLeftCss + 3,
                right: 3,
                top: 3,
                bottom: 3,
                borderRadius: cornerRadiusCss,
                ...buildRearPanelVars(theme, isDaylight),
            }}
            data-rear-panel={activeTab}
        >
            <div className="flex items-center gap-1 px-2 pt-2 shrink-0" data-rear-panel-header>
                <div className={`flex min-w-0 flex-1 ${tabSwitcherBg} p-1 rounded-xl`}>
                    {PANEL_TABS.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            aria-pressed={activeTab === tab.id}
                            title={getPanelTabLabel(tab.id, t)}
                            className={`flex-1 py-1.5 flex items-center justify-center transition-all rounded-lg ${
                                activeTab === tab.id ? `${activeTabBg}` : 'opacity-40 hover:opacity-100'
                            }`}
                            style={{ color: 'var(--text-primary)' }}
                        >
                            <tab.icon size={14} />
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${chrome.switcherClass}`}
                    style={{ color: theme.primaryColor }}
                    aria-label={t('ui.close', '关闭')}
                    data-rear-control="closePanel"
                    onClick={onClose}
                >
                    <X size={15} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
                {activeTab === 'file' && (
                    <div className="pt-3 space-y-3">
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold opacity-50 uppercase tracking-wider flex items-center gap-2" style={{ color: theme.secondaryColor }}>
                                <FileAudio size={14} /> {t('localMusic.fileInfo')}
                            </h3>
                            <div className="rounded-xl p-3 space-y-2 text-sm" style={{ backgroundColor: colorWithAlpha(theme.backgroundColor, isDaylight ? 0.42 : 0.52) }}>
                                <div className="flex justify-between gap-3">
                                    <span className="opacity-60">{t('localMusic.filename')}</span>
                                    <span className="font-mono text-xs opacity-80 truncate max-w-[150px]">
                                        {config.song?.name || t('ui.noTrack')}
                                    </span>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <span className="opacity-60">{t('localMusic.lyrics')}</span>
                                    <span className="text-xs opacity-80 truncate max-w-[150px]">
                                        {config.lyrics?.lines?.length
                                            ? `${config.lyrics.lines.length} ${t('localMusic.statusLocal')}`
                                            : t('localMusic.statusNone')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-wider opacity-50" style={{ color: theme.secondaryColor }}>
                                {t('localMusic.lyrics')}
                            </div>
                            <div className="text-xs opacity-70 leading-relaxed" style={{ color: theme.secondaryColor }}>
                                {[config.songArtist, config.songAlbum].filter(Boolean).join(' · ')}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'controls' && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 rounded-xl border px-2 py-1.5" style={{
                            borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.16),
                            backgroundColor: colorWithAlpha(theme.backgroundColor, isDaylight ? 0.42 : 0.52),
                        }}>
                            <span className="shrink-0 text-xs" style={{ color: theme.primaryColor }}>
                                {t('options.rearLyricsPanelFontSize')}
                            </span>
                            <input
                                type="range"
                                min="0.1"
                                max="2"
                                step="0.05"
                                value={config.rearLyricsFontScale ?? config.lyricsFontScale ?? 1}
                                onChange={event => onCommand({
                                    type: 'applySettings',
                                    patch: { rearLyricsFontScale: Number(event.target.value) },
                                })}
                                className="min-w-0 flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-(--text-primary)"
                                style={{ accentColor: theme.primaryColor }}
                                aria-label={t('options.rearLyricsFontScale')}
                            />
                            <span className="w-10 shrink-0 text-right font-mono text-xs opacity-70" style={{ color: theme.secondaryColor }}>
                                {(config.rearLyricsFontScale ?? config.lyricsFontScale ?? 1).toFixed(2)}×
                            </span>
                        </div>

                    <ControlsTab
                        loopMode={config.loopMode ?? 'off'}
                        onToggleLoop={() => onCommand({ type: 'toggleLoopMode' })}
                        onLike={() => onCommand({ type: 'toggleLike' })}
                        isLiked={config.isLiked ?? false}
                        likeDisabled={config.likeDisabled ?? false}
                        onGenerateAITheme={() => onCommand({ type: 'applySettings', patch: { generateAiTheme: true } })}
                        isGeneratingTheme={false}
                        canGenerateAITheme
                        theme={theme}
                        onThemeChange={nextTheme => onCommand({ type: 'setTheme', theme: nextTheme })}
                        bgMode="default"
                        onBgModeChange={mode => onCommand({ type: 'applySettings', patch: { themeSource: mode } })}
                        hasCustomTheme={config.hasCustomTheme ?? false}
                        themeSourceModel={buildRearThemeSourceModel(config)}
                        defaultTheme={theme}
                        daylightTheme={theme}
                        visualizerMode={config.visualizerMode}
                        onVisualizerModeChange={mode => onCommand({ type: 'setVisualizerMode', mode })}
                        useCoverColorBg={config.background?.common?.useCoverColorBg ?? false}
                        onToggleCoverColorBg={enabled => onCommand({ type: 'applySettings', patch: { useCoverColorBg: enabled } })}
                        isDaylight={isDaylight}
                        onToggleDaylight={() => onCommand({ type: 'applySettings', patch: { toggleDaylight: true } })}
                        volume={config.volume ?? 1}
                        isMuted={config.isMuted ?? false}
                        onVolumePreview={value => onCommand({ type: 'previewVolume', value })}
                        onVolumeChange={value => onCommand({ type: 'setVolume', value })}
                        onToggleMute={() => onCommand({ type: 'toggleMute' })}
                        hideSongActions
                        hideEqualizerButton
                        volumeTrailingAction={(
                            <button
                                type="button"
                                onClick={() => onCommand({ type: 'toggleLike' })}
                                className={`shrink-0 rounded-md transition-opacity hover:opacity-100 ${config.isLiked ? 'opacity-100' : 'opacity-40'}`}
                                style={config.isLiked ? { color: theme.accentColor } : undefined}
                                title={config.isLiked ? t('player.unlike') : t('player.like')}
                                aria-label={config.isLiked ? t('player.unlike') : t('player.like')}
                            >
                                <Heart size={14} fill={config.isLiked ? 'currentColor' : 'none'} />
                            </button>
                        )}
                        backgroundConfig={config.background}
                        backgroundActions={{
                            onModeChange: mode => onCommand({ type: 'setBackgroundMode', mode }),
                            common: {
                                onCoverColorChange: enabled => onCommand({ type: 'applySettings', patch: { useCoverColorBg: enabled } }),
                            },
                            monet: {
                                onTuningChange: patch => onCommand({ type: 'applySettings', patch: { backgroundTuningPatch: { mode: 'monet', patch: patch as Record<string, unknown> } } }),
                            },
                            nomand: {
                                onTuningChange: patch => onCommand({ type: 'applySettings', patch: { backgroundTuningPatch: { mode: 'nomand', patch: patch as Record<string, unknown> } } }),
                            },
                            latent: {
                                onTuningChange: patch => onCommand({ type: 'applySettings', patch: { backgroundTuningPatch: { mode: 'latent', patch: patch as Record<string, unknown> } } }),
                            },
                            sora: {
                                onTuningChange: patch => onCommand({ type: 'applySettings', patch: { backgroundTuningPatch: { mode: 'sora', patch: patch as Record<string, unknown> } } }),
                            },
                        }}
                        onOpenVisualizerSettings={() => onCommand({ type: 'openRearLyricsStyleSettings' })}
                        onOpenBackgroundSettings={() => onCommand({ type: 'openBackgroundSettings' })}
                        onStepVisualizerMode={direction => onCommand({
                            type: 'setVisualizerMode',
                            mode: stepMode(visualizerModes, config.visualizerMode, direction),
                        })}
                        appearanceContent={(
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-50" style={{ color: theme.secondaryColor }}>
                                        {t('options.visualizerMode')}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10"
                                            onClick={() => onCommand({ type: 'setVisualizerMode', mode: stepMode(visualizerModes, config.visualizerMode, -1) })}
                                        >
                                            {'‹'}
                                        </button>
                                        <div className="min-w-0 flex-1 truncate text-center text-xs font-medium" style={{ color: theme.primaryColor }}>
                                            {getVisualizerModeLabel(config.visualizerMode, t)}
                                        </div>
                                        <button
                                            type="button"
                                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10"
                                            onClick={() => onCommand({ type: 'setVisualizerMode', mode: stepMode(visualizerModes, config.visualizerMode, 1) })}
                                        >
                                            {'›'}
                                        </button>
                                        <button
                                            type="button"
                                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10"
                                            title={t('ui.moreSettings')}
                                            aria-label={t('ui.moreSettings')}
                                            onClick={() => onCommand({ type: 'openRearLyricsStyleSettings' })}
                                        >
                                            <SlidersHorizontal size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-50" style={{ color: theme.secondaryColor }}>
                                        {t('options.rearLyricsStyleTitle')}
                                    </div>
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium transition-colors hover:bg-white/10"
                                        style={{ color: theme.primaryColor }}
                                        onClick={() => onCommand({ type: 'openRearLyricsStyleSettings' })}
                                        data-rear-control="openLyricsStyle"
                                    >
                                        <span className="min-w-0 truncate">{t('options.rearLyricsStyleOpen')}</span>
                                        <SlidersHorizontal size={14} className="shrink-0 opacity-60" />
                                    </button>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-50" style={{ color: theme.secondaryColor }}>
                                        {t('options.visualizerBackgroundMode')}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10"
                                            onClick={() => onCommand({ type: 'setBackgroundMode', mode: stepMode(backgroundModes, currentBackgroundMode, -1) })}
                                        >
                                            {'‹'}
                                        </button>
                                        <div className="min-w-0 flex-1 truncate text-center text-xs font-medium" style={{ color: theme.primaryColor }}>
                                            {getVisualizerBackgroundModeLabel(currentBackgroundMode, t)}
                                        </div>
                                        <button
                                            type="button"
                                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10"
                                            onClick={() => onCommand({ type: 'setBackgroundMode', mode: stepMode(backgroundModes, currentBackgroundMode, 1) })}
                                        >
                                            {'›'}
                                        </button>
                                        <button
                                            type="button"
                                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10"
                                            title={t('ui.moreSettings')}
                                            aria-label={t('ui.moreSettings')}
                                            onClick={() => onCommand({ type: 'openBackgroundSettings' })}
                                        >
                                            <SlidersHorizontal size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-50" style={{ color: theme.secondaryColor }}>
                                        {t('ui.aiTheme')}
                                    </div>
                                    <div className="flex gap-1">
                                        {(['default', 'ai', 'custom'] as const).map(source => (
                                            <button
                                                key={source}
                                                type="button"
                                                onClick={() => onCommand({ type: 'applySettings', patch: { themeSource: source } })}
                                                className={`flex-1 rounded-lg py-1.5 text-[10px] font-medium transition-all ${
                                                    source === 'default' ? 'bg-white/20' : 'bg-white/5 opacity-50 hover:opacity-100'
                                                }`}
                                            >
                                                {source === 'default' ? t('ui.default') : source === 'ai' ? t('ui.aiTheme') : t('options.customTheme')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        onClosePanel={onClose}
                    />
                    </div>
                )}

                {activeTab === 'lyrics' && (
                    <RearLyricsPanelLyrics
                        lines={config.lyrics?.lines ?? []}
                        currentLineIndex={currentLineIndex}
                        songTitle={config.song?.name}
                        songArtist={config.songArtist ?? undefined}
                        songAlbum={config.songAlbum ?? undefined}
                        onSeek={timeSec => onCommand({ type: 'seek', time: timeSec })}
                    />
                )}

                {activeTab === 'queue' && (
                    <RearLyricsPanelQueue
                        items={config.queue ?? []}
                        currentIndex={config.queueIndex ?? -1}
                        onCommand={onCommand}
                    />
                )}

                {activeTab === 'account' && (
                    <div className="space-y-3 pt-3">
                        <div className="flex items-center gap-2 opacity-60" style={{ color: theme.secondaryColor }}>
                            <SlidersHorizontal size={12} />
                            <span className="text-[10px] font-bold uppercase tracking-wide">
                                {t('account.audioQuality')}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {AUDIO_QUALITY_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={(config.audioQuality ?? 'standard') === option.value}
                                    onClick={() => onCommand({
                                        type: 'applySettings',
                                        patch: { audioQuality: option.value },
                                    })}
                                    className={`py-1.5 text-[10px] font-medium rounded-lg transition-all ${
                                        (config.audioQuality ?? 'standard') === option.value
                                            ? 'bg-white/20 shadow-sm'
                                            : 'opacity-40 hover:opacity-100 hover:bg-white/5'
                                    }`}
                                >
                                    {t(option.labelKey)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RearLyricsPanel;
