import React, { useEffect, useState } from 'react';
import type { Theme } from '../../types';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import type { RearLyricsSettingsPatch } from '../../services/rearLyricsBridge';
import { REAR_LYRICS_FONT_SCALE_MAX, REAR_LYRICS_FONT_SCALE_MIN } from '../../stores/useTypographySettingsStore';
import { colorWithAlpha } from '../visualizer/colorMix';
import {
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
} from '../../stores/useTypographySettingsStore';
import { RearPresetGroup, RearResetButton, RearSectionCard, RearSlider, RearToggleRow } from './RearLyricsPanelControls';

// src/components/rear/RearLyricsPanelCommon.tsx
// 背屏设置弹窗「通用」页：主屏歌词设置 - 通用页签的背屏精简版。
//
// 控件和条目与主屏一致：字体 / 字号 / 自动字号提示 / 字重 / 整体透明度，
// 保留卡头同一位置的默认还原按钮。
// 只省略主屏的预览文本，并把字号写到背屏专用字段 rearLyricsFontScale。

interface RearLyricsPanelCommonProps {
    config: ObsBrowserSourceConfig;
    theme: Theme;
    isDaylight: boolean;
    t: (key: string) => string;
    onSettings: (patch: RearLyricsSettingsPatch) => void;
}

/** 字重预设，和主屏 FONT_WEIGHT_PRESETS 同值，只是这里按钮更小。 */
const FONT_WEIGHT_PRESETS = [
    { value: 300, labelKey: 'options.fontWeightThin' },
    { value: 400, labelKey: 'options.fontWeightRegular' },
    { value: 700, labelKey: 'options.fontWeightBold' },
];

/** 自己决定字号的歌词模式：通用字号控件对它们无效，给一句说明，文案与主屏同一套。 */
const LYRICS_FONT_SIZE_AUTO_NOTICE_KEYS: Partial<Record<string, string>> = {
    sonnet: 'options.sonnetFontSizeAutoNotice',
    tempera: 'options.temperaFontSizeAutoNotice',
    lumiere: 'options.lumiereFontSizeAutoNotice',
};

/**
 * 字号预设。
 *
 * 主屏用的是 90/100/110/125，这里从 100 起步：背屏可见区只有 242x212，再往下缩字就看不清了。
 */
const REAR_FONT_SCALE_PRESETS = [
    { label: '100%', value: 1 },
    { label: '110%', value: 1.1 },
    { label: '125%', value: 1.25 },
    { label: '140%', value: 1.4 },
];

const RearLyricsPanelCommon: React.FC<RearLyricsPanelCommonProps> = ({
    config,
    theme,
    isDaylight,
    t,
    onSettings,
}) => {
    // 背屏全局字号默认 1x，不继承主屏字号；老 config 没有该字段时也按 1 处理。
    const rearFontScale = config.rearLyricsFontScale ?? 1;
    // 构图缺省时按出厂值；老 config 里的 scaleX/offsetX 会在 resolve 里迁移成新字段。
    const rearFrame = resolveRearLyricsFrame(config.visualizerMode, config.rearLyricsFrames?.[config.visualizerMode]);
    const fontStyle = config.lyricsFontStyle ?? 'sans';
    const fontWeight = config.lyricsFontWeight ?? null;
    // 和主屏同一套判据：自己算字号的模式（商籁 / 蛋彩 / 光影）下，字号这一组整体失效。
    const lyricsFontSizeAutoNoticeKey = LYRICS_FONT_SIZE_AUTO_NOTICE_KEYS[config.visualizerMode] ?? null;
    // 字重滑杆是「草稿」：拖动时连续写 patch，但值本身取自滑杆，避免主屏回推造成抖动。
    const [fontWeightSliderValue, setFontWeightSliderValue] = useState(fontWeight ?? 400);

    useEffect(() => {
        if (fontWeight !== null) setFontWeightSliderValue(fontWeight);
    }, [fontWeight]);

    return (
        <div className="space-y-1.5">
            <RearSectionCard
                title={t('options.previewCommonSettings')}
                description={t('options.previewCommonSettingsDesc')}
                action={(
                    <RearResetButton
                        label={t('ui.default')}
                        theme={theme}
                        onClick={() => onSettings({ resetCommonSettings: true })}
                    />
                )}
                theme={theme}
                isDaylight={isDaylight}
            >
                <RearPresetGroup<Theme['fontStyle']>
                    label={t('options.fontFamily')}
                    value={fontStyle}
                    options={[
                        { label: t('options.fontSans'), value: 'sans' },
                        { label: t('options.fontSerif'), value: 'serif' },
                        { label: t('options.fontMono'), value: 'mono' },
                    ]}
                    onChange={next => onSettings({ lyricsFontStyle: next })}
                    theme={theme}
                    isDaylight={isDaylight}
                />

                {/* 字号这一组和主屏一样，在自动字号模式下整体禁用并压暗。 */}
                <fieldset
                    disabled={lyricsFontSizeAutoNoticeKey !== null}
                    className={`space-y-4 transition-opacity ${lyricsFontSizeAutoNoticeKey !== null ? 'opacity-40' : ''}`}
                >
                    <RearPresetGroup<number>
                        label={t('options.fontSize')}
                        value={rearFontScale}
                        options={REAR_FONT_SCALE_PRESETS}
                        onChange={value => onSettings({ rearLyricsFontScale: value })}
                        theme={theme}
                        isDaylight={isDaylight}
                    />

                    <RearSlider
                        label={t('options.fontSize')}
                        value={rearFontScale}
                        min={REAR_LYRICS_FONT_SCALE_MIN}
                        max={REAR_LYRICS_FONT_SCALE_MAX}
                        step={0.05}
                        theme={theme}
                        onChange={value => onSettings({ rearLyricsFontScale: value })}
                        format={value => `${Math.round(value * 100)}%`}
                    />
                </fieldset>

                {/*
                  * 构图微调：只对「当前这个效果」生效的一份 scale / offsetX。
                  * 背屏可见区只有 242px 宽，各效果按大屏设计的构图在这里不是压到摄像头底下
                  * 就是溢出屏幕，所以每个效果单独记一份，换到别的效果也不用重新调。
                  */}
                <RearSectionCard
                    title={t('options.rearLyricsFrameTitle')}
                    description={t('options.rearLyricsFrameDesc')}
                    action={(
                        <RearResetButton
                            label={t('ui.default')}
                            theme={theme}
                            onClick={() => onSettings({ resetRearLyricsFrame: config.visualizerMode })}
                        />
                    )}
                    theme={theme}
                    isDaylight={isDaylight}
                >
                    {/*
                      * 画布本身始终铺满整屏；这里只改歌词画布起点、画布内的渲染中心、
                      * 以及字号 / 效果大小。四个方向各自独立，换效果不用重调。
                      */}
                    <RearSlider
                        label={t('options.rearLyricsStyleEffectFontScale')}
                        value={rearFrame.fontScale}
                        min={REAR_LYRICS_FRAME_FONT_SCALE_MIN}
                        max={REAR_LYRICS_FRAME_FONT_SCALE_MAX}
                        step={0.05}
                        theme={theme}
                        onChange={value => onSettings({
                            rearLyricsFrame: { mode: config.visualizerMode, fontScale: value },
                        })}
                        format={value => `${value.toFixed(2)}×`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsFrameCanvasX')}
                        value={rearFrame.canvasX}
                        min={REAR_LYRICS_FRAME_CANVAS_X_MIN}
                        max={REAR_LYRICS_FRAME_CANVAS_X_MAX}
                        step={1}
                        theme={theme}
                        onChange={value => onSettings({
                            rearLyricsFrame: { mode: config.visualizerMode, canvasX: value },
                        })}
                        format={value => `${Math.round(value)}px`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsFrameCanvasY')}
                        value={rearFrame.canvasY}
                        min={REAR_LYRICS_FRAME_CANVAS_Y_MIN}
                        max={REAR_LYRICS_FRAME_CANVAS_Y_MAX}
                        step={1}
                        theme={theme}
                        onChange={value => onSettings({
                            rearLyricsFrame: { mode: config.visualizerMode, canvasY: value },
                        })}
                        format={value => `${Math.round(value)}px`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsFrameCenterOffsetX')}
                        value={rearFrame.centerOffsetX}
                        min={REAR_LYRICS_FRAME_CENTER_OFFSET_MIN}
                        max={REAR_LYRICS_FRAME_CENTER_OFFSET_MAX}
                        step={1}
                        theme={theme}
                        onChange={value => onSettings({
                            rearLyricsFrame: { mode: config.visualizerMode, centerOffsetX: value },
                        })}
                        format={value => `${value > 0 ? '+' : ''}${Math.round(value)}px`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsFrameCenterOffsetY')}
                        value={rearFrame.centerOffsetY}
                        min={REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MIN}
                        max={REAR_LYRICS_FRAME_CENTER_OFFSET_Y_MAX}
                        step={1}
                        theme={theme}
                        onChange={value => onSettings({
                            rearLyricsFrame: { mode: config.visualizerMode, centerOffsetY: value },
                        })}
                        format={value => `${value > 0 ? '+' : ''}${Math.round(value)}px`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsFrameEffectScaleX')}
                        value={rearFrame.effectScaleX}
                        min={REAR_LYRICS_FRAME_EFFECT_SCALE_MIN}
                        max={REAR_LYRICS_FRAME_EFFECT_SCALE_MAX}
                        step={0.01}
                        theme={theme}
                        onChange={value => onSettings({
                            rearLyricsFrame: { mode: config.visualizerMode, effectScaleX: value },
                        })}
                        format={value => `${value.toFixed(2)}×`}
                    />
                    <RearSlider
                        label={t('options.rearLyricsFrameEffectScaleY')}
                        value={rearFrame.effectScaleY}
                        min={REAR_LYRICS_FRAME_EFFECT_SCALE_MIN}
                        max={REAR_LYRICS_FRAME_EFFECT_SCALE_MAX}
                        step={0.01}
                        theme={theme}
                        onChange={value => onSettings({
                            rearLyricsFrame: { mode: config.visualizerMode, effectScaleY: value },
                        })}
                        format={value => `${value.toFixed(2)}×`}
                    />
                </RearSectionCard>

                {lyricsFontSizeAutoNoticeKey !== null && (
                    <div
                        className="rounded-2xl border px-3.5 py-3 text-xs leading-relaxed"
                        style={{
                            color: theme.secondaryColor,
                            borderColor: colorWithAlpha(theme.accentColor, isDaylight ? 0.22 : 0.28),
                            backgroundColor: colorWithAlpha(theme.accentColor, isDaylight ? 0.06 : 0.1),
                        }}
                    >
                        {t(lyricsFontSizeAutoNoticeKey)}
                    </div>
                )}

                <RearToggleRow
                    label={t('options.fontWeightAuto')}
                    description={t('options.fontWeightAutoDesc')}
                    checked={fontWeight === null}
                    onChange={follow => onSettings({ lyricsFontWeight: follow ? null : fontWeightSliderValue })}
                    theme={theme}
                />

                {fontWeight !== null && (
                    <>
                        <RearPresetGroup<number>
                            label={t('options.fontWeight')}
                            value={fontWeightSliderValue}
                            options={FONT_WEIGHT_PRESETS.map(preset => ({
                                label: t(preset.labelKey),
                                value: preset.value,
                            }))}
                            onChange={value => {
                                setFontWeightSliderValue(value);
                                onSettings({ lyricsFontWeight: value });
                            }}
                            theme={theme}
                            isDaylight={isDaylight}
                        />
                        <RearSlider
                            label={t('options.fontWeight')}
                            value={fontWeightSliderValue}
                            min={100}
                            max={900}
                            step={10}
                            theme={theme}
                            onChange={value => {
                                setFontWeightSliderValue(value);
                                onSettings({ lyricsFontWeight: value });
                            }}
                        />
                    </>
                )}

                <RearSlider
                    label={t('options.visualizerOpacity')}
                    value={config.visualizerOpacity}
                    min={0.2}
                    max={1}
                    step={0.05}
                    theme={theme}
                    onChange={value => onSettings({ visualizerOpacity: value })}
                    format={value => `${Math.round(value * 100)}%`}
                />
            </RearSectionCard>

        </div>
    );
};

export default RearLyricsPanelCommon;
