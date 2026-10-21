import React from 'react';
import { useTranslation } from 'react-i18next';
import ControlsTab from '../panelTab/ControlsTab';
import VisPlaygroundSettingsPanel from '../visualizer/VisPlaygroundSettingsPanel';
import {
    DEFAULT_CAPPELLA_TUNING,
    DEFAULT_CLASSIC_TUNING,
    DEFAULT_CLADDAGH_TUNING,
    DEFAULT_FUME_TUNING,
    DEFAULT_MONET_TUNING,
    DEFAULT_PARTITA_TUNING,
    DEFAULT_TILT_TUNING,
} from '../../types';
import { getVisualizerRegistryEntry } from '../visualizer/registry';
import { type VisPlaygroundEditSection } from '../visualizer/VisPlaygroundPreviewHotspots';
import type { VisualizerBackgroundActions } from '../visualizer/backgrounds/definition';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import type { RearLyricsSettingsPatch } from '../../services/rearLyricsBridge';

// src/components/rear/RearLyricsSettingsPages.tsx
// Direct adapters to the main-screen five settings pages. There is no rear-specific visual
// styling here; only values/actions are bridged, and font size writes the rear-specific field.

export type RearSettingsSection = 'controls' | VisPlaygroundEditSection;

interface RearLyricsSettingsPagesProps {
    section: RearSettingsSection;
    config: ObsBrowserSourceConfig;
    onPatch: (patch: RearLyricsSettingsPatch) => void;
    onCommand: (command: { type: 'previewVolume' | 'setVolume'; value: number }) => void;
    onClosePanel: () => void;
    /** 主屏「背屏歌词样式」窗口里由外层页签控制；背屏 WebView 里不传，保持自带页签隐藏。 */
    onSectionChange?: (section: VisPlaygroundEditSection) => void;
    hideSectionTabs?: boolean;
    /** 背屏窗口暂不接 Folium tuning 卡片，避免显示读写主屏 store 的假控件。 */
    hideFoliumTuningCards?: boolean;
}

const FONT_SCALE_OPTIONS = [
    { label: '90%', value: 0.9 },
    { label: '100%', value: 1 },
    { label: '110%', value: 1.1 },
    { label: '125%', value: 1.25 },
];

const buildRearThemeSourceModel = (theme: ObsBrowserSourceConfig['theme']) => ({
    activeSource: 'default' as const,
    current: {
        source: 'default' as const,
        available: true,
        editable: false,
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
            available: false,
            editable: false,
            theme: null,
            label: '',
            swatchColor: 'transparent',
        },
    },
    editableSource: 'ai' as const,
    canOpenQuickEditor: false,
    hasLocalAiTheme: false,
});

const RearLyricsSettingsPages: React.FC<RearLyricsSettingsPagesProps> = ({
    section,
    config,
    onPatch,
    onCommand,
    onClosePanel,
    onSectionChange,
    hideSectionTabs = true,
    hideFoliumTuningCards = false,
}) => {
    const { t } = useTranslation();
    const theme = config.theme;
    const isDaylight = config.isDaylight;
    const visualizerMode = config.visualizerMode;
    const tunings = config.visualizerTunings ?? {};
    const background = config.background;
    const fontScale = config.rearLyricsFontScale ?? config.lyricsFontScale ?? 1;
    const visualizerEntry = getVisualizerRegistryEntry(visualizerMode);
    const controlCardBg = isDaylight ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.52)';
    const rangeInputClass = [
        'w-full h-1.5 rounded-full appearance-none cursor-pointer',
        '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white',
        '[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white',
        'bg-white/10',
    ].join(' ');
    const fontStyleOptions = [
        { value: 'sans' as const, label: t('options.fontSans') },
        { value: 'serif' as const, label: t('options.fontSerif') },
        { value: 'mono' as const, label: t('options.fontMono') },
    ];
    const fontWeightOptions = [
        { value: 300, label: t('options.fontWeightThin') },
        { value: 400, label: t('options.fontWeightRegular') },
        { value: 700, label: t('options.fontWeightBold') },
    ];

    if (section === 'controls') {
        return (
            <ControlsTab
                loopMode={config.loopMode ?? 'off'}
                onToggleLoop={() => onPatch({ toggleLoopMode: true })}
                onLike={() => onPatch({ toggleLike: true })}
                isLiked={config.isLiked ?? false}
                likeDisabled={config.likeDisabled ?? false}
                onGenerateAITheme={() => onPatch({ generateAiTheme: true })}
                isGeneratingTheme={false}
                canGenerateAITheme
                theme={theme}
                onThemeChange={() => undefined}
                bgMode="default"
                onBgModeChange={mode => onPatch({ themeSource: mode })}
                hasCustomTheme={false}
                themeSourceModel={buildRearThemeSourceModel(theme)}
                defaultTheme={theme}
                daylightTheme={theme}
                visualizerMode={visualizerMode}
                onVisualizerModeChange={mode => onPatch({ visualizerMode: mode })}
                useCoverColorBg={background?.common?.useCoverColorBg ?? false}
                onToggleCoverColorBg={enabled => onPatch({ useCoverColorBg: enabled })}
                isDaylight={isDaylight}
                onToggleDaylight={() => onPatch({ toggleDaylight: true })}
                volume={config.volume ?? 1}
                isMuted={config.isMuted ?? false}
                onVolumePreview={value => onCommand({ type: 'previewVolume', value })}
                onVolumeChange={value => onCommand({ type: 'setVolume', value })}
                onToggleMute={() => onPatch({ toggleMute: true })}
                onClosePanel={onClosePanel}
            />
        );
    }

    const backgroundActions: VisualizerBackgroundActions = {
        onModeChange: mode => onPatch({ backgroundMode: mode }),
        common: {
            onCoverColorChange: enabled => onPatch({ useCoverColorBg: enabled }),
            onOpacityChange: opacity => onPatch({ backgroundOpacity: opacity }),
            onDisableGeometricChange: disabled => onPatch({ disableGeometricBackground: disabled }),
            onDisableVignetteChange: disabled => onPatch({ disableVignette: disabled }),
        },
        customImage: {
            onUpload: () => Promise.resolve({ ok: false, error: 'options.rearUploadUnsupported' }),
            onClear: () => undefined,
            isLoading: false,
        },
        monet: {
            onTuningChange: patch => onPatch({ backgroundTuningPatch: { mode: 'monet', patch: patch as Record<string, unknown> } }),
            onResetTuning: () => onPatch({ resetBackgroundTuning: 'monet' }),
        },
        nomand: {
            onTuningChange: patch => onPatch({ backgroundTuningPatch: { mode: 'nomand', patch: patch as Record<string, unknown> } }),
            onResetTuning: () => onPatch({ resetBackgroundTuning: 'nomand' }),
        },
        latent: {
            onTuningChange: patch => onPatch({ backgroundTuningPatch: { mode: 'latent', patch: patch as Record<string, unknown> } }),
            onResetTuning: () => onPatch({ resetBackgroundTuning: 'latent' }),
        },
        sora: {
            onTuningChange: patch => onPatch({ backgroundTuningPatch: { mode: 'sora', patch: patch as Record<string, unknown> } }),
            onResetTuning: () => onPatch({ resetBackgroundTuning: 'sora' }),
        },
        url: {
            onAdd: item => onPatch({ urlBackgroundAdd: item }),
            onUpdate: (id, patch) => onPatch({ urlBackgroundUpdate: { id, patch } }),
            onDelete: id => onPatch({ urlBackgroundDelete: id }),
            onSelect: id => onPatch({ urlBackgroundSelectedId: id }),
        },
    };

    return (
        <VisPlaygroundSettingsPanel
            activeSection={section}
            onSectionChange={onSectionChange ?? (() => undefined)}
            t={t}
            isDaylight={isDaylight}
            theme={theme}
            hideSectionTabs={hideSectionTabs}
            hideFoliumTuningCards={hideFoliumTuningCards}
            enablePlayerPageNativeBlur={false}
            visualizerMode={visualizerMode}
            visualizerEntry={visualizerEntry}
            controlCardBg={controlCardBg}
            rangeInputClass={rangeInputClass}
            visualizerOpacity={config.visualizerOpacity}
            onVisualizerOpacityChange={opacity => onPatch({ visualizerOpacity: opacity })}
            backgroundConfig={background}
            backgroundActions={backgroundActions}
            previewPlaceholderId="default"
            previewPlaceholderOptions={[{ label: 'Default', value: 'default' }]}
            onPreviewPlaceholderChange={() => undefined}
            fontStyleValue={config.lyricsFontStyle ?? 'sans'}
            builtinFontOptions={fontStyleOptions}
            fontStyleOptions={fontStyleOptions}
            subtitleFontStyleOptions={fontStyleOptions}
            onFontStyleChange={fontStyle => {
                if (fontStyle !== 'custom') onPatch({ lyricsFontStyle: fontStyle });
            }}
            fontScale={fontScale}
            fontScaleOptions={FONT_SCALE_OPTIONS}
            onFontScaleChange={value => onPatch({ rearLyricsFontScale: value })}
            subtitleFontScale={config.subtitleFontScale ?? 1}
            onSubtitleFontScaleChange={value => onPatch({ subtitleFontScale: value })}
            fontWeight={config.lyricsFontWeight ?? null}
            fontWeightOptions={fontWeightOptions}
            onFontWeightChange={weight => onPatch({ lyricsFontWeight: weight })}
            onFontWeightFollowChange={follow => onPatch({ lyricsFontWeight: follow ? null : 400 })}
            onResetCommonSettings={() => onPatch({ resetCommonSettings: true })}
            classicTuning={tunings.classic ?? DEFAULT_CLASSIC_TUNING}
            onClassicTuningChange={patch => onPatch({ tuningPatch: { mode: 'classic', patch: patch as Record<string, unknown> } })}
            partitaTuning={tunings.partita ?? DEFAULT_PARTITA_TUNING}
            onPartitaTuningChange={tuning => onPatch({ tuningPatch: { mode: 'partita', patch: tuning as unknown as Record<string, unknown> } })}
            fumeTuning={tunings.fume ?? DEFAULT_FUME_TUNING}
            onFumeTuningChange={patch => onPatch({ tuningPatch: { mode: 'fume', patch: patch as Record<string, unknown> } })}
            claddaghTuning={tunings.claddagh ?? DEFAULT_CLADDAGH_TUNING}
            onCladdaghTuningChange={patch => onPatch({ tuningPatch: { mode: 'claddagh', patch: patch as Record<string, unknown> } })}
            cappellaTuning={tunings.cappella ?? DEFAULT_CAPPELLA_TUNING}
            cappellaCustomEmojiImages={config.cappellaCustomEmojiImages ?? []}
            onCappellaTuningChange={patch => onPatch({ tuningPatch: { mode: 'cappella', patch: patch as Record<string, unknown> } })}
            isLoadingCappellaCustomEmojiPack={false}
            onImportCappellaCustomEmojiPack={() => Promise.resolve({ ok: false, error: 'options.rearUploadUnsupported' })}
            onClearCappellaCustomEmojiPack={() => onPatch({ clearCappellaCustomEmojiPack: true })}
            cappellaCustomAvatarImages={config.cappellaCustomAvatarImages ?? []}
            onImportCappellaCustomAvatar={() => Promise.resolve({ ok: false, error: 'options.rearUploadUnsupported' })}
            onClearCappellaCustomAvatar={() => onPatch({ clearCappellaCustomAvatar: true })}
            isLoadingCappellaCustomAvatarPack={false}
            tiltTuning={tunings.tilt ?? DEFAULT_TILT_TUNING}
            onTiltTuningChange={patch => onPatch({ tuningPatch: { mode: 'tilt', patch: patch as Record<string, unknown> } })}
            dioramaTuning={tunings.diorama}
            onDioramaTuningChange={patch => onPatch({ tuningPatch: { mode: 'diorama', patch: patch as Record<string, unknown> } })}
            monetTuning={tunings.monet ?? DEFAULT_MONET_TUNING}
            onMonetTuningChange={patch => onPatch({ tuningPatch: { mode: 'monet', patch: patch as Record<string, unknown> } })}
            onResetMonetTuning={() => onPatch({ resetTuning: 'monet' })}
            pendoloTuning={tunings.pendolo}
            onPendoloTuningChange={patch => onPatch({ tuningPatch: { mode: 'pendolo', patch: patch as Record<string, unknown> } })}
            sonnetTuning={tunings.sonnet}
            onSonnetTuningChange={patch => onPatch({ tuningPatch: { mode: 'sonnet', patch: patch as Record<string, unknown> } })}
            temperaTuning={tunings.tempera}
            onTemperaTuningChange={patch => onPatch({ tuningPatch: { mode: 'tempera', patch: patch as Record<string, unknown> } })}
            lumiereTuning={tunings.lumiere}
            onLumiereTuningChange={patch => onPatch({ tuningPatch: { mode: 'lumiere', patch: patch as Record<string, unknown> } })}
            monetPortraitImage={config.monetPortraitImage ?? null}
            onUploadMonetPortraitImage={() => Promise.resolve({ ok: false, error: 'options.rearUploadUnsupported' })}
            onClearMonetPortraitImage={() => onPatch({ clearMonetPortraitImage: true })}
            isLoadingMonetPortraitImage={false}
            hideTranslationSubtitle={false}
            onToggleHideTranslationSubtitle={hidden => onPatch({ hideTranslationSubtitle: hidden })}
            onToggleShowSubtitleTranslation={shown => onPatch({ showSubtitleTranslation: shown })}
            subtitleContentMode={config.subtitleContentMode ?? 'translation'}
            onSubtitleContentModeChange={mode => onPatch({ subtitleContentMode: mode })}
            subtitleOverlayOpacity={config.subtitleOverlayOpacity}
            onSubtitleOverlayOpacityChange={opacity => onPatch({ subtitleOverlayOpacity: opacity })}
            subtitleOverlayBackground={config.subtitleOverlayBackground ?? true}
            onToggleSubtitleOverlayBackground={enabled => onPatch({ subtitleOverlayBackground: enabled })}
            subtitleUpcomingLyricsBlur={config.subtitleUpcomingLyricsBlur ?? true}
            onToggleSubtitleUpcomingLyricsBlur={enabled => onPatch({ subtitleUpcomingLyricsBlur: enabled })}
            showHarmonySubtitle={config.showHarmonySubtitle ?? true}
            onToggleShowHarmonySubtitle={enabled => onPatch({ showHarmonySubtitle: enabled })}
            harmonySubtitleBackground={config.harmonySubtitleBackground ?? true}
            onToggleHarmonySubtitleBackground={enabled => onPatch({ harmonySubtitleBackground: enabled })}
            subtitleFontInheritsLyrics={config.subtitleFontInheritsLyrics ?? true}
            onSubtitleFontInheritsLyricsChange={inherits => onPatch({ subtitleFontInheritsLyrics: inherits })}
            subtitleFontStyle={config.subtitleFontStyle ?? 'sans'}
            subtitleFontWeight={config.subtitleFontWeight ?? null}
            onSubtitleFontStyleChange={fontStyle => onPatch({ subtitleFontStyle: fontStyle })}
            onSubtitleFontWeightChange={weight => onPatch({ subtitleFontWeight: weight })}
            onSubtitleFontWeightFollowChange={follow => onPatch({ subtitleFontWeight: follow ? null : 400 })}
            subtitleFontFamily={null}
            onSubtitleFontFamilyChange={() => undefined}
            subtitleFontFallbackFamilies={[]}
            onSubtitleFontFallbackFamiliesChange={() => undefined}
            onOpenSubtitleFontPicker={() => undefined}
            onResetSubtitleSettings={() => onPatch({ resetSubtitleSettings: true })}
            onSliderPointerDown={() => undefined}
            onSliderCommit={() => undefined}
        />
    );
};

export default RearLyricsSettingsPages;
