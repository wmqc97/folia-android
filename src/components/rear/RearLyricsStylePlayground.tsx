import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import type { Theme, VisualizerMode } from '../../types';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import type { RearLyricsSettingsPatch } from '../../services/rearLyricsBridge';
import { getVisualizerModeLabel, VISUALIZER_REGISTRY } from '../visualizer/registry';
import { useVisualizerTunings } from '../visualizer/useVisualizerTunings';
import { useVisualizerBackgroundConfig } from '../visualizer/useVisualizerBackgroundConfig';
import type { VisPlaygroundEditSection } from '../visualizer/VisPlaygroundPreviewHotspots';
import {
    REAR_LYRICS_FONT_SCALE_MAX,
    REAR_LYRICS_FONT_SCALE_MIN,
    REAR_LYRICS_FRAME_CANVAS_X_MAX,
    REAR_LYRICS_FRAME_CANVAS_X_MIN,
    REAR_LYRICS_FRAME_CANVAS_Y_MAX,
    REAR_LYRICS_FRAME_CANVAS_Y_MIN,
    REAR_LYRICS_FRAME_CENTER_OFFSET_MAX,
    REAR_LYRICS_FRAME_CENTER_OFFSET_MIN,
    REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MAX,
    REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MIN,
    REAR_LYRICS_FRAME_EFFECT_SCALE_MAX,
    REAR_LYRICS_FRAME_EFFECT_SCALE_MIN,
    REAR_LYRICS_FRAME_FONT_SCALE_MAX,
    REAR_LYRICS_FRAME_FONT_SCALE_MIN,
    resolveRearLyricsFrame,
    useTypographySettingsStore,
} from '../../stores/useTypographySettingsStore';
import { useVisualizerSettingsStore } from '../../stores/useVisualizerSettingsStore';
import { useVisualizerAssetStore } from '../../stores/useVisualizerAssetStore';
import { useThemeSettingsStore } from '../../stores/useThemeSettingsStore';
import { useRearLyricsVisualSettingsStore } from '../../stores/useRearLyricsVisualSettingsStore';
import { useRearLyricsSyncStore } from '../../stores/useRearLyricsSyncStore';
import {
    applyRearLyricsVisualPatch,
    mergeRearLyricsVisualConfig,
} from '../../utils/rearLyricsVisualSettings';
import { RearPresetGroup, RearResetButton, RearSectionCard, RearSlider } from './RearLyricsPanelControls';
import { resolveRearPanelChrome } from './rearPanelStyle';
import { DEFAULT_REAR_SAFE_LEFT_CSS } from '../../services/rearLyricsBridge';
import RearLyricsSettingsPages from './RearLyricsSettingsPages';
import RearLyricsStylePreview from './RearLyricsStylePreview';
import RearLyricsStyleTransfer from './RearLyricsStyleTransfer';

// src/components/rear/RearLyricsStylePlayground.tsx
// 背屏专属的「背屏歌词样式」窗口。
//
// 它是主屏「歌词样式」的背屏镜像：视觉设置全部写 useRearLyricsVisualSettingsStore 的稀疏覆盖，
// 发布时再深合并到主屏 config 上给背屏页渲染，所以主屏「歌词样式」窗口和它互不影响。
// 背屏专用字号与每个效果的构图（canvasX/Y、渲染中心、字号、效果缩放）仍沿用
// rearLyricsFontScale / rearLyricsFrames 字段；全局左侧避让已移除，左侧规避改成每个样式自己的 canvasX。


interface RearLyricsStylePlaygroundProps {
    isOpen: boolean;
    onClose: () => void;
    theme?: Theme;
    isDaylight: boolean;
}

const RearLyricsStylePlayground: React.FC<RearLyricsStylePlaygroundProps> = ({
    isOpen,
    onClose,
    theme,
    isDaylight,
}) => {
    const { t } = useTranslation();
    const mainVisualizerMode = useVisualizerSettingsStore(state => state.visualizerMode);
    const visualizerOpacity = useVisualizerSettingsStore(state => state.visualizerOpacity);
    const visualizerTunings = useVisualizerTunings();
    const background = useVisualizerBackgroundConfig();
    const override = useRearLyricsVisualSettingsStore(state => state.override);
    const setOverride = useRearLyricsVisualSettingsStore(state => state.setOverride);
    const rearLyricsFontScale = useTypographySettingsStore(state => state.rearLyricsFontScale);
    const rearLyricsFrames = useTypographySettingsStore(state => state.rearLyricsFrames);
    const handleSetRearLyricsFontScale = useTypographySettingsStore(state => state.handleSetRearLyricsFontScale);
    const handleSetRearLyricsFrame = useTypographySettingsStore(state => state.handleSetRearLyricsFrame);
    const handleSetRearLyricsFrames = useTypographySettingsStore(state => state.handleSetRearLyricsFrames);
    const handleResetRearLyricsFrame = useTypographySettingsStore(state => state.handleResetRearLyricsFrame);
    const lyricsFontStyle = useTypographySettingsStore(state => state.lyricsFontStyle);
    const lyricsFontWeight = useTypographySettingsStore(state => state.lyricsFontWeight);
    const subtitleFontInheritsLyrics = useTypographySettingsStore(state => state.subtitleFontInheritsLyrics);
    const subtitleFontScale = useTypographySettingsStore(state => state.subtitleFontScale);
    const subtitleFontStyle = useTypographySettingsStore(state => state.subtitleFontStyle);
    const subtitleFontWeight = useTypographySettingsStore(state => state.subtitleFontWeight);
    const subtitleOverlayOpacity = useTypographySettingsStore(state => state.subtitleOverlayOpacity);
    const subtitleOverlayBackground = useTypographySettingsStore(state => state.subtitleOverlayBackground);
    const subtitleUpcomingLyricsBlur = useTypographySettingsStore(state => state.subtitleUpcomingLyricsBlur);
    const showHarmonySubtitle = useTypographySettingsStore(state => state.showHarmonySubtitle);
    const harmonySubtitleBackground = useTypographySettingsStore(state => state.harmonySubtitleBackground);
    const showSubtitleTranslation = useTypographySettingsStore(state => state.showSubtitleTranslation);
    const subtitleContentMode = useTypographySettingsStore(state => state.subtitleContentMode);
    const hideTranslationSubtitle = useTypographySettingsStore(state => state.hidePlayerTranslationSubtitle);
    const staticMode = useThemeSettingsStore(state => state.staticMode);
    const cappellaCustomEmojiImages = useVisualizerAssetStore(state => state.cappellaCustomEmojiImages);
    const cappellaCustomAvatarImages = useVisualizerAssetStore(state => state.cappellaCustomAvatarImages);
    const monetPortraitImage = useVisualizerAssetStore(state => state.monetPortraitImage);
    const [selectedMode, setSelectedMode] = useState<VisualizerMode>(
        () => override.visualizerMode ?? mainVisualizerMode,
    );
    const [activeSection, setActiveSection] = useState<VisPlaygroundEditSection>('common');

    // 每次打开都从背屏当前效果起步；窗口本身不写主屏模式，选择效果只改背屏覆盖。
    useEffect(() => {
        if (isOpen) {
            setSelectedMode(useRearLyricsVisualSettingsStore.getState().override.visualizerMode ?? mainVisualizerMode);
            setActiveSection('common');
        }
    }, [isOpen, mainVisualizerMode]);

    const modeOptions = useMemo(
        () => VISUALIZER_REGISTRY.map(entry => ({
            value: entry.mode,
            label: getVisualizerModeLabel(entry.mode, t),
        })),
        [t],
    );
    /*
     * 这个窗口跑在主屏上，读不到背屏 WebView 的 URL 参数（safeLeftPx / physicalWidthPx），
     * 所以「原生实测值」只能取文档化的兜底常量。它是每个样式 canvasX 的默认值：
     * 用户没存过该样式时，歌词画布从这里开始；真正生效的换算在背屏页 resolveRearSafeLeftCss 里做。
     */
    const measuredSafeLeftCss = DEFAULT_REAR_SAFE_LEFT_CSS;
    const frame = resolveRearLyricsFrame(selectedMode, rearLyricsFrames[selectedMode]);
    const chrome = resolveRearPanelChrome(isDaylight);
    const panelTheme = theme;

    // 背屏设置页要读的字段和主屏 config 同名；这里从各 store 拼出「主屏基线」，再叠加背屏覆盖。
    const baseConfig = useMemo<ObsBrowserSourceConfig>(() => ({
        activePlaybackContext: 'main',
        stageSource: null,
        hasTrack: false,
        song: null,
        songArtist: null,
        songAlbum: null,
        coverUrl: null,
        lyrics: null,
        theme: panelTheme as Theme,
        isDaylight,
        visualizerMode: selectedMode,
        visualizerTunings,
        background,
        lyricsFontScale: rearLyricsFontScale,
        rearLyricsFontScale,
        rearLyricsFrames,
        lyricsFontStyle,
        lyricsFontWeight,
        subtitleFontScale,
        subtitleFontStyle,
        subtitleFontWeight,
        subtitleFontInheritsLyrics,
        visualizerOpacity,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        subtitleUpcomingLyricsBlur,
        showHarmonySubtitle,
        harmonySubtitleBackground,
        staticMode,
        hideTranslationSubtitle,
        showSubtitleTranslation,
        subtitleContentMode,
        seed: 0,
        cappellaCustomEmojiImages,
        cappellaCustomAvatarImages,
        monetPortraitImage,
        updatedAt: 0,
    }), [
        background,
        cappellaCustomAvatarImages,
        cappellaCustomEmojiImages,
        hideTranslationSubtitle,
        harmonySubtitleBackground,
        isDaylight,
        lyricsFontStyle,
        lyricsFontWeight,
        monetPortraitImage,
        panelTheme,
        rearLyricsFontScale,
        rearLyricsFrames,
        selectedMode,
        showHarmonySubtitle,
        showSubtitleTranslation,
        staticMode,
        subtitleContentMode,
        subtitleFontInheritsLyrics,
        subtitleFontScale,
        subtitleFontStyle,
        subtitleFontWeight,
        subtitleOverlayBackground,
        subtitleOverlayOpacity,
        subtitleUpcomingLyricsBlur,
        visualizerOpacity,
        visualizerTunings,
    ]);
    const config = useMemo(
        () => mergeRearLyricsVisualConfig(baseConfig, override),
        [baseConfig, override],
    );

    const handleSelectMode = useCallback((mode: VisualizerMode) => {
        setSelectedMode(mode);
        setOverride({ ...override, visualizerMode: mode });
        // 改完立刻让发布器强制重发，不等下一次自然去重。
        useRearLyricsSyncStore.getState().requestSnapshot();
    }, [override, setOverride]);

    /**
     * 背屏设置页提交的补丁：视觉字段进背屏覆盖，字号与构图进原有背屏专用字段。
     * 控制页的播放状态在这里不会出现（窗口只渲染视觉四页签）。
     */
    const handlePatch = useCallback((patch: RearLyricsSettingsPatch) => {
        if (patch.rearLyricsFontScale !== undefined) {
            handleSetRearLyricsFontScale(patch.rearLyricsFontScale);
        }
        if (patch.rearLyricsFrame) {
            const { mode, ...nextFrame } = patch.rearLyricsFrame;
            handleSetRearLyricsFrame(mode, nextFrame);
        }
        if (patch.resetRearLyricsFrame) {
            handleResetRearLyricsFrame(patch.resetRearLyricsFrame);
        }
        if (patch.resetCommonSettings) {
            handleSetRearLyricsFontScale(1);
        }
        setOverride(applyRearLyricsVisualPatch(
            { visualizerTunings, background },
            override,
            patch,
        ));
        useRearLyricsSyncStore.getState().requestSnapshot();
    }, [
        background,
        handleResetRearLyricsFrame,
        handleSetRearLyricsFontScale,
        handleSetRearLyricsFrame,
        override,
        setOverride,
        visualizerTunings,
    ]);

    // 带上当前完整构图：只改一项时，其余项（尤其是 canvasX）不能被默认值顶掉。
    const patchFrame = (patch: Partial<typeof frame>) => {
        handleSetRearLyricsFrame(selectedMode, { ...frame, ...patch });
        // 调试时每次拖动都要立刻到背屏，不等发布器自然去重。
        useRearLyricsSyncStore.getState().requestSnapshot();
    };
    const handleRearFontScaleChange = (value: number) => {
        handleSetRearLyricsFontScale(value);
        useRearLyricsSyncStore.getState().requestSnapshot();
    };

    if (!isOpen || !panelTheme) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[136] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
            <div
                className="relative flex h-full max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
                style={{
                    borderColor: 'rgba(255,255,255,0.1)',
                    backgroundColor: isDaylight ? 'rgba(250,250,252,0.96)' : 'rgba(18,18,22,0.96)',
                }}
            >
                <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${chrome.switcherClass}`}
                        style={{ color: panelTheme.primaryColor }}
                        aria-label={t('ui.close', '关闭')}
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <div className="min-w-0">
                        <div className="truncate text-lg font-semibold sm:text-xl" style={{ color: panelTheme.primaryColor }}>
                            {t('options.rearLyricsStyleTitle')}
                        </div>
                        <div className="mt-1 text-xs opacity-60" style={{ color: panelTheme.secondaryColor }}>
                            {t('options.rearLyricsStyleDesc')}
                        </div>
                    </div>
                </div>

                <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
                    <RearSectionCard
                        title={t('options.rearLyricsStylePreviewTitle')}
                        description={t('options.rearLyricsStylePreviewDesc')}
                        theme={panelTheme}
                        isDaylight={isDaylight}
                    >
                        <RearLyricsStylePreview
                            config={config}
                            theme={panelTheme}
                            isDaylight={isDaylight}
                            safeLeftCss={measuredSafeLeftCss}
                            frame={frame}
                            visualizerMode={selectedMode}
                        />
                        <div className="text-center text-[11px] opacity-50">
                            {t('options.rearLyricsStyleSafeAreaHint', { safe: Math.round(frame.canvasX) })}
                        </div>
                    </RearSectionCard>

                    {/* 整包导入 / 导出：所有效果的画布、渲染中心、字号与视觉覆盖。 */}
                    <RearLyricsStyleTransfer
                        fontScale={rearLyricsFontScale}
                        frames={rearLyricsFrames}
                        visual={override}
                        theme={panelTheme}
                        isDaylight={isDaylight}
                        onApply={bundle => {
                            handleSetRearLyricsFrames(bundle.frames);
                            handleSetRearLyricsFontScale(bundle.fontScale);
                            setOverride(bundle.visual);
                            useRearLyricsSyncStore.getState().requestSnapshot();
                        }}
                    />

                    {/*
                      * 全局左侧避让已移除：左侧规避现在是每个样式自己的 canvasX。
                      * 画布本身始终铺满整屏，这里不再有「全局偏移」这一项。
                      */}

                    <RearSectionCard
                        title={t('options.rearLyricsStyleEffectTitle')}
                        description={t('options.rearLyricsStyleEffectDesc')}
                        theme={panelTheme}
                        isDaylight={isDaylight}
                    >
                        <RearPresetGroup<VisualizerMode>
                            label={t('options.rearLyricsStyleEffectLabel')}
                            value={selectedMode}
                            options={modeOptions}
                            onChange={handleSelectMode}
                            theme={panelTheme}
                            isDaylight={isDaylight}
                        />
                    </RearSectionCard>

                    <RearSectionCard
                        title={t('options.rearLyricsStyleGlobalFontTitle')}
                        description={t('options.rearLyricsStyleGlobalFontDesc')}
                        theme={panelTheme}
                        isDaylight={isDaylight}
                    >
                        <RearSlider
                            label={t('options.rearLyricsFontScale')}
                            value={rearLyricsFontScale}
                            min={REAR_LYRICS_FONT_SCALE_MIN}
                            max={REAR_LYRICS_FONT_SCALE_MAX}
                            step={0.05}
                            theme={panelTheme}
                            onChange={handleRearFontScaleChange}
                            format={value => `${value.toFixed(2)}×`}
                        />
                    </RearSectionCard>

                    <RearSectionCard
                        title={`${getVisualizerModeLabel(selectedMode, t)} · ${t('options.rearLyricsStyleCenterTitle')}`}
                        description={t('options.rearLyricsStyleCenterDesc')}
                        theme={panelTheme}
                        isDaylight={isDaylight}
                        action={(
                            <RearResetButton
                                label={t('ui.reset', '默认')}
                                theme={panelTheme}
                                onClick={() => handleResetRearLyricsFrame(selectedMode)}
                            />
                        )}
                    >
                        <RearSlider
                            label={t('options.rearLyricsStyleEffectFontScale')}
                            value={frame.fontScale}
                            min={REAR_LYRICS_FRAME_FONT_SCALE_MIN}
                            max={REAR_LYRICS_FRAME_FONT_SCALE_MAX}
                            step={0.05}
                            theme={panelTheme}
                            onChange={value => patchFrame({ fontScale: value })}
                            format={value => `${value.toFixed(2)}×`}
                        />
                        <RearSlider
                            label={t('options.rearLyricsStyleCanvasX')}
                            value={frame.canvasX}
                            min={REAR_LYRICS_FRAME_CANVAS_X_MIN}
                            max={REAR_LYRICS_FRAME_CANVAS_X_MAX}
                            step={1}
                            theme={panelTheme}
                            onChange={value => patchFrame({ canvasX: value })}
                            format={value => `${Math.round(value)}px`}
                        />
                        <RearSlider
                            label={t('options.rearLyricsStyleCanvasY')}
                            value={frame.canvasY}
                            min={REAR_LYRICS_FRAME_CANVAS_Y_MIN}
                            max={REAR_LYRICS_FRAME_CANVAS_Y_MAX}
                            step={1}
                            theme={panelTheme}
                            onChange={value => patchFrame({ canvasY: value })}
                            format={value => `${Math.round(value)}px`}
                        />
                        <RearSlider
                            label={t('options.rearLyricsStyleCenterOffsetX')}
                            value={frame.centerOffsetX}
                            min={REAR_LYRICS_FRAME_CENTER_OFFSET_MIN}
                            max={REAR_LYRICS_FRAME_CENTER_OFFSET_MAX}
                            step={1}
                            theme={panelTheme}
                            onChange={value => patchFrame({ centerOffsetX: value })}
                            format={value => `${value > 0 ? '+' : ''}${Math.round(value)}px`}
                        />
                        <RearSlider
                            label={t('options.rearLyricsStyleCenterOffsetY')}
                            value={frame.centerOffsetY}
                            min={REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MIN}
                            max={REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MAX}
                            step={1}
                            theme={panelTheme}
                            onChange={value => patchFrame({ centerOffsetY: value })}
                            format={value => `${value > 0 ? '+' : ''}${Math.round(value)}px`}
                        />
                        <RearSlider
                            label={t('options.rearLyricsStyleEffectScaleX')}
                            value={frame.effectScaleX}
                            min={REAR_LYRICS_FRAME_EFFECT_SCALE_MIN}
                            max={REAR_LYRICS_FRAME_EFFECT_SCALE_MAX}
                            step={0.01}
                            theme={panelTheme}
                            onChange={value => patchFrame({ effectScaleX: value })}
                            format={value => `${value.toFixed(2)}×`}
                        />
                        <RearSlider
                            label={t('options.rearLyricsStyleEffectScaleY')}
                            value={frame.effectScaleY}
                            min={REAR_LYRICS_FRAME_EFFECT_SCALE_MIN}
                            max={REAR_LYRICS_FRAME_EFFECT_SCALE_MAX}
                            step={0.01}
                            theme={panelTheme}
                            onChange={value => patchFrame({ effectScaleY: value })}
                            format={value => `${value.toFixed(2)}×`}
                        />
                        <button
                            type="button"
                            className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors ${chrome.switcherClass}`}
                            style={{ color: panelTheme.primaryColor }}
                            onClick={() => handleResetRearLyricsFrame(selectedMode)}
                        >
                            <RotateCcw size={13} />
                            {t('options.rearLyricsStyleResetEffect')}
                        </button>
                    </RearSectionCard>

                    {/* 与主屏「歌词样式」同类的四页设置，全部写背屏覆盖。 */}
                    <RearLyricsSettingsPages
                        section={activeSection}
                        config={config}
                        onPatch={handlePatch}
                        onCommand={() => undefined}
                        onClosePanel={onClose}
                        onSectionChange={setActiveSection}
                        hideSectionTabs={false}
                        hideFoliumTuningCards
                    />
                </div>
            </div>
        </div>
    );
};

export default RearLyricsStylePlayground;
