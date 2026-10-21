import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import RearLyricsStylePreview from '../../src/components/rear/RearLyricsStylePreview';
import { RearSectionCard, RearSlider } from '../../src/components/rear/RearLyricsPanelControls';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import type { ObsBrowserSourceConfig } from '../../src/types/obsBrowserSource';
import {
    DEFAULT_REAR_LYRICS_FRAME,
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
    clampRearLyricsFrame,
} from '../../src/stores/useTypographySettingsStore';
import type { ProbeDefinition } from './definition';

// dev/probes/rearStylePreview.probe.tsx
// 「背屏歌词样式」窗口里的实时预览：把真实的 RearLyricsStylePreview 挂起来，
// 配一套和窗口里同参数的滑杆，拖动时应当立刻看到歌词位置变化。
//
// 要看的是：
//   - 预览里是不是真的有 visualizer 在动（不是静态示意图）；
//   - 画布 X/Y、渲染中心 X/Y、效果缩放改了，歌词是否实时跟随；
//   - 画布本身是否始终铺满 347x212，左侧摄像头带仍有背景。

const buildConfig = (): ObsBrowserSourceConfig => ({
    activePlaybackContext: 'main',
    stageSource: null,
    hasTrack: true,
    song: { id: 'probe', name: '神文之诗' },
    songArtist: '探针歌手',
    songAlbum: '探针专辑',
    coverUrl: null,
    lyrics: null,
    theme: DEFAULT_THEME,
    isDaylight: false,
    visualizerMode: 'classic',
    background: { mode: 'latent' },
    lyricsFontScale: 1,
    subtitleFontScale: 1,
    visualizerOpacity: 1,
    subtitleOverlayOpacity: 1,
    hideTranslationSubtitle: false,
    staticMode: false,
    seed: 'rear-style-preview',
    updatedAt: 0,
});

const RearStylePreviewProbe: React.FC = () => {
    const { t } = useTranslation();
    // 摄像头硬边缘 277 / 976 × 347 ≈ 98，只用于画左侧遮罩。
    const safeLeftCss = 98;
    const [frame, setFrame] = useState(DEFAULT_REAR_LYRICS_FRAME);

    const patchFrame = (patch: Partial<typeof frame>) => {
        setFrame(previous => clampRearLyricsFrame({ ...previous, ...patch }));
    };

    return (
        <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
            <div className="mx-auto max-w-3xl space-y-4">
                <RearSectionCard
                    title={t('options.rearLyricsStylePreviewTitle')}
                    description={t('options.rearLyricsStylePreviewDesc')}
                    theme={DEFAULT_THEME}
                    isDaylight={false}
                >
                    <RearLyricsStylePreview
                        config={buildConfig()}
                        theme={DEFAULT_THEME}
                        isDaylight={false}
                        safeLeftCss={safeLeftCss}
                        frame={frame}
                        visualizerMode="classic"
                    />
                </RearSectionCard>

                <RearSectionCard
                    title={t('options.rearLyricsStyleCenterTitle')}
                    description={t('options.rearLyricsStyleCenterDesc')}
                    theme={DEFAULT_THEME}
                    isDaylight={false}
                >
                    <RearSlider
                        label={t('options.rearLyricsStyleEffectFontScale')}
                        value={frame.fontScale}
                        min={REAR_LYRICS_FRAME_FONT_SCALE_MIN}
                        max={REAR_LYRICS_FRAME_FONT_SCALE_MAX}
                        step={0.05}
                        theme={DEFAULT_THEME}
                        onChange={value => patchFrame({ fontScale: value })}
                        format={value => `${value.toFixed(2)}×`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsStyleCanvasX')}
                        value={frame.canvasX}
                        min={REAR_LYRICS_FRAME_CANVAS_X_MIN}
                        max={REAR_LYRICS_FRAME_CANVAS_X_MAX}
                        step={1}
                        theme={DEFAULT_THEME}
                        onChange={value => patchFrame({ canvasX: value })}
                        format={value => `${Math.round(value)}px`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsStyleCanvasY')}
                        value={frame.canvasY}
                        min={REAR_LYRICS_FRAME_CANVAS_Y_MIN}
                        max={REAR_LYRICS_FRAME_CANVAS_Y_MAX}
                        step={1}
                        theme={DEFAULT_THEME}
                        onChange={value => patchFrame({ canvasY: value })}
                        format={value => `${Math.round(value)}px`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsStyleCenterOffsetX')}
                        value={frame.centerOffsetX}
                        min={REAR_LYRICS_FRAME_CENTER_OFFSET_MIN}
                        max={REAR_LYRICS_FRAME_CENTER_OFFSET_MAX}
                        step={1}
                        theme={DEFAULT_THEME}
                        onChange={value => patchFrame({ centerOffsetX: value })}
                        format={value => `${value > 0 ? '+' : ''}${Math.round(value)}px`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsStyleCenterOffsetY')}
                        value={frame.centerOffsetY}
                        min={REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MIN}
                        max={REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MAX}
                        step={1}
                        theme={DEFAULT_THEME}
                        onChange={value => patchFrame({ centerOffsetY: value })}
                        format={value => `${value > 0 ? '+' : ''}${Math.round(value)}px`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsStyleEffectScaleX')}
                        value={frame.effectScaleX}
                        min={REAR_LYRICS_FRAME_EFFECT_SCALE_MIN}
                        max={REAR_LYRICS_FRAME_EFFECT_SCALE_MAX}
                        step={0.01}
                        theme={DEFAULT_THEME}
                        onChange={value => patchFrame({ effectScaleX: value })}
                        format={value => `${value.toFixed(2)}×`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsStyleEffectScaleY')}
                        value={frame.effectScaleY}
                        min={REAR_LYRICS_FRAME_EFFECT_SCALE_MIN}
                        max={REAR_LYRICS_FRAME_EFFECT_SCALE_MAX}
                        step={0.01}
                        theme={DEFAULT_THEME}
                        onChange={value => patchFrame({ effectScaleY: value })}
                        format={value => `${value.toFixed(2)}×`}
                    />
                </RearSectionCard>
            </div>
        </div>
    );
};

const probe: ProbeDefinition = {
    id: 'rearStylePreview',
    title: '背屏歌词样式·实时预览',
    description: '挂真实的 RearLyricsStylePreview，拖动画布与渲染中心滑杆，确认预览实时跟随。',
    Component: RearStylePreviewProbe,
};

export default probe;
