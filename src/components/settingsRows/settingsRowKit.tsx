import React from 'react';
import { Monitor, RotateCcw, type LucideIcon } from 'lucide-react';
import type { Theme } from '../../types';
import { colorWithAlpha } from '../visualizer/colorMix';

// src/components/settingsRows/settingsRowKit.tsx
// 「歌词效果」设置面板的共享控件套装：一份实现，两档尺寸（主屏 / 背屏）。
//
// 主屏的 VisPlaygroundSettingsPanel 和背屏的 RearLyricsPanel* 原本各写了一套同语义控件
// （卡片 / 预设组 / 开关行 / 滑杆行 / 还原按钮 / 页签），两边会慢慢长出细节差异
// （圆角、描边透明度、开关配色），改一处另一边不会跟着变。
//
// 这里合并成一份：
//   - density='main' 取自主屏现用的那套 class 与选中态算法（getAccentOptionStyle），
//     数值与主屏面板逐条对齐，所以主屏接过来渲染结果不变；
//   - density='rear' 就是主屏那一档（尺寸、字号、圆角、选中态全部相同），
//     所以背屏面板看上去就是主屏那一份。
//
// 颜色与选中态的算法两份完全共用，不存在「背屏另配一套配色」的情况。

export type SettingsRowDensity = 'main' | 'rear';

interface SettingsRowTokens {
    /** 卡片：圆角 / 内边距 / 行间距。 */
    cardClass: string;
    /** 卡片底色不透明度（背屏叠在歌词上，需要比主屏更实）。 */
    cardBgAlphaDaylight: number;
    cardBgAlphaNight: number;
    cardBorderAlpha: number;
    /** 卡片头：标题 + 说明 + 右侧动作。 */
    headerClass: string;
    headerTextWrapClass: string;
    titleClass: string;
    descriptionClass: string;
    /** 预设组。 */
    groupClass: string;
    groupLabelClass: string;
    groupOptionsClass: string;
    presetButtonClass: string;
    /** 开关行。 */
    toggleRowClass: string;
    toggleTextWrapClass: string;
    toggleLabelClass: string;
    toggleDescriptionClass: string;
    toggleIconSize: number;
    toggleTrackClass: string;
    toggleThumbClass: string;
    toggleThumbOnOffsetClass: string;
    /** 滑杆行。 */
    sliderClass: string;
    sliderLabelRowClass: string;
    sliderValueClass: string;
    rangeInputClass: string;
    /** 还原按钮。 */
    resetButtonClass: string;
    resetIconSize: number;
    /** 页签行。 */
    tabsContainerClass: string;
    tabsContainerDaylightAlpha: number;
    tabsContainerNightAlpha: number;
    tabButtonClass: string;
}

/** 主屏那一档：数值逐条对齐主屏 VisPlaygroundSettingsPanel 现用的 class。 */
const MAIN_TOKENS: SettingsRowTokens = {
        cardClass: 'rounded-[24px] border p-4 space-y-4',
        cardBgAlphaDaylight: 0.42,
        cardBgAlphaNight: 0.52,
        cardBorderAlpha: 0.16,
        headerClass: 'flex items-start justify-between gap-3',
        headerTextWrapClass: 'space-y-1',
        titleClass: 'text-sm font-medium',
        descriptionClass: 'text-xs opacity-70',
        groupClass: 'space-y-2.5',
        groupLabelClass: 'text-xs font-medium uppercase tracking-[0.24em] opacity-60',
        groupOptionsClass: 'flex flex-wrap gap-2',
        presetButtonClass: 'px-3 py-2 rounded-full text-sm transition-all border',
        toggleRowClass: 'flex items-center justify-between gap-4',
        toggleTextWrapClass: 'space-y-1',
        toggleLabelClass: 'text-sm font-medium flex items-center gap-2',
        toggleDescriptionClass: 'text-xs opacity-70 max-w-[320px]',
        toggleIconSize: 14,
        toggleTrackClass: 'w-12 h-6 rounded-full p-1 transition-colors shrink-0 disabled:opacity-45',
        toggleThumbClass: 'w-4 h-4 rounded-full shadow-sm transition-transform',
        toggleThumbOnOffsetClass: 'translate-x-6',
        sliderClass: 'space-y-2',
        sliderLabelRowClass: 'flex items-center justify-between text-sm',
        sliderValueClass: 'font-mono opacity-70',
        rangeInputClass: [
            'w-full h-1.5 rounded-full appearance-none cursor-pointer',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:transition-transform',
            '[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white',
            'bg-white/10',
        ].join(' '),
        // 背屏面板只有 242px 宽，卡头和「默认」挤在一起会把这两个字挤断行，所以按钮固定不换行、不参与压缩。
        resetButtonClass: 'inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        resetIconSize: 12,
        tabsContainerClass: 'inline-flex w-fit items-center gap-1 rounded-full p-1',
        tabsContainerDaylightAlpha: 0.34,
        tabsContainerNightAlpha: 0.52,
        tabButtonClass: 'rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-all',
};

/**
 * 两档尺寸表。
 *
 * 背屏 = 主屏那一档，逐条相同。
 */
const TOKENS: Record<SettingsRowDensity, SettingsRowTokens> = {
    main: MAIN_TOKENS,
    // 背屏只动页签行：3 个文字页签在 242px 里按主屏尺寸排会挤出右边界，
    // 所以三等分并略收字号；其余控件与主屏逐条相同。
    rear: {
        ...MAIN_TOKENS,
        tabsContainerClass: 'flex w-full items-center gap-0.5 overflow-x-auto rounded-full p-0.5',
        tabButtonClass: 'shrink-0 rounded-full border px-2 py-1 text-xs whitespace-nowrap transition-all',
    },
};

/**
 * 滑杆外观。
 *
 * registry 自带的调参面板（背景 / 歌词模式）也要用同一条 class 才会跟面板长得一致，
 * 所以这里对外暴露一份，`rearPanelStyle` 直接复用，避免两处各写一遍。
 */
export const REAR_RANGE_INPUT_CLASS = TOKENS.rear.rangeInputClass;

/** 页签容器底色：页面底色薄涂一层。 */
const resolveTabsContainerBg = (theme: Theme, isDaylight: boolean) => {
    const alpha = isDaylight ? MAIN_TOKENS.tabsContainerDaylightAlpha : MAIN_TOKENS.tabsContainerNightAlpha;
    return colorWithAlpha(theme.backgroundColor, alpha);
};

/** 卡片底色：页面底色薄涂一层，比页签容器略实。 */
export const resolveSettingsCardBg = (theme: Theme, isDaylight: boolean) => {
    const alpha = isDaylight ? MAIN_TOKENS.cardBgAlphaDaylight : MAIN_TOKENS.cardBgAlphaNight;
    return colorWithAlpha(theme.backgroundColor, alpha);
};

/** 选中态（与主屏 getAccentOptionStyle 一致）：强调色描边 + 内描边 + 强调色薄底。 */
const resolveSelectedOptionStyle = (theme: Theme, isDaylight: boolean): React.CSSProperties => ({
    borderColor: theme.accentColor,
    boxShadow: `inset 0 0 0 1px ${theme.accentColor}`,
    backgroundColor: colorWithAlpha(theme.accentColor, isDaylight ? 0.1 : 0.16),
});

/** 未选中态：页面底色薄涂 + 次要色描边。 */
const resolveUnselectedOptionStyle = (theme: Theme, isDaylight: boolean): React.CSSProperties => ({
    borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.16),
    backgroundColor: colorWithAlpha(theme.backgroundColor, isDaylight ? 0.24 : 0.34),
});

const resolveOptionStyle = (
    selected: boolean,
    theme: Theme,
    isDaylight: boolean,
): React.CSSProperties => (
    selected
        ? resolveSelectedOptionStyle(theme, isDaylight)
        : resolveUnselectedOptionStyle(theme, isDaylight)
);

export interface SettingsPresetOption<T> {
    label: string;
    value: T;
}

/** 设置卡片：标题 + 说明 + 右上角动作（比如「默认」）+ 内容。 */
export const SettingsSectionCard: React.FC<{
    density: SettingsRowDensity;
    title?: string;
    description?: string;
    action?: React.ReactNode;
    theme: Theme;
    isDaylight: boolean;
    children: React.ReactNode;
}> = ({ density, title, description, action, theme, isDaylight, children }) => {
    const tokens = TOKENS[density];
    const hasHeader = Boolean(title || description || action);
    return (
        <div
            className={tokens.cardClass}
            style={{
                backgroundColor: resolveSettingsCardBg(theme, isDaylight),
                borderColor: colorWithAlpha(theme.secondaryColor, tokens.cardBorderAlpha),
            }}
        >
            {hasHeader && (
                <div className={tokens.headerClass}>
                    <div className={tokens.headerTextWrapClass}>
                        {title && (
                            <div className={tokens.titleClass} style={{ color: theme.primaryColor }}>
                                {title}
                            </div>
                        )}
                        {description && (
                            <div className={tokens.descriptionClass} style={{ color: theme.secondaryColor }}>
                                {description}
                            </div>
                        )}
                    </div>
                    {action}
                </div>
            )}
            {children}
        </div>
    );
};

/** 胶囊选项组：一行小标签 + 若干等宽胶囊按钮。 */
export const SettingsPresetGroup = <T,>({
    density,
    label,
    value,
    options,
    onChange,
    theme,
    isDaylight,
    isOptionActive,
}: {
    density: SettingsRowDensity;
    label: string;
    value: T;
    options: SettingsPresetOption<T>[];
    onChange: (next: T) => void;
    theme: Theme;
    isDaylight: boolean;
    /** 值相等不足以判断选中时（比如「自定义字体」）自己决定。 */
    isOptionActive?: (option: SettingsPresetOption<T>) => boolean;
}) => {
    const tokens = TOKENS[density];
    return (
        <div className={tokens.groupClass}>
            <div className={tokens.groupLabelClass} style={{ color: theme.secondaryColor }}>
                {label}
            </div>
            <div className={tokens.groupOptionsClass}>
                {options.map(option => {
                    const isActive = isOptionActive ? isOptionActive(option) : option.value === value;
                    return (
                        <button
                            key={String(option.value)}
                            type="button"
                            onClick={() => onChange(option.value)}
                            className={tokens.presetButtonClass}
                            style={{
                                ...resolveOptionStyle(isActive, theme, isDaylight),
                                color: theme.primaryColor,
                            }}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

/** 开关行：左标题 + 可选说明，右侧滑动开关；onChange 缺省表示这一项在背屏上不可改。 */
export const SettingsToggleRow: React.FC<{
    density: SettingsRowDensity;
    label: string;
    description?: string;
    checked: boolean;
    onChange?: (checked: boolean) => void;
    theme: Theme;
    icon?: LucideIcon;
}> = ({ density, label, description, checked, onChange, theme, icon }) => {
    const tokens = TOKENS[density];
    // 每行左侧的图标位（主屏就是这么做的）。
    const Icon = icon ?? Monitor;
    return (
        <div className={tokens.toggleRowClass}>
            <div className={tokens.toggleTextWrapClass}>
                <div className={tokens.toggleLabelClass} style={{ color: theme.primaryColor }}>
                    {Icon && <Icon size={tokens.toggleIconSize} />}
                    {label}
                </div>
                {description && (
                    <div className={tokens.toggleDescriptionClass} style={{ color: theme.secondaryColor }}>
                        {description}
                    </div>
                )}
            </div>
            <button
                type="button"
                role="switch"
                aria-label={label}
                aria-checked={checked}
                aria-pressed={checked}
                disabled={!onChange}
                onClick={() => onChange?.(!checked)}
                className={tokens.toggleTrackClass}
                style={{
                    backgroundColor: checked ? theme.secondaryColor : colorWithAlpha(theme.secondaryColor, 0.18),
                }}
            >
                <div
                    className={`${tokens.toggleThumbClass} ${checked ? tokens.toggleThumbOnOffsetClass : 'translate-x-0'}`}
                    style={{ backgroundColor: theme.backgroundColor }}
                />
            </button>
        </div>
    );
};

/** 滑杆行：左标题 + 右数值，下面一条 range。 */
export const SettingsSliderRow: React.FC<{
    density: SettingsRowDensity;
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    theme: Theme;
    onChange: (value: number) => void;
    format?: (value: number) => string;
    onPointerDown?: () => void;
    onPointerUp?: () => void;
    onPointerCancel?: () => void;
}> = ({ density, label, value, min, max, step, theme, onChange, format, onPointerDown, onPointerUp, onPointerCancel }) => {
    const tokens = TOKENS[density];
    return (
        <div className={tokens.sliderClass}>
            <div className={tokens.sliderLabelRowClass} style={{ color: theme.primaryColor }}>
                <span>{label}</span>
                <span className={tokens.sliderValueClass} style={{ color: theme.secondaryColor }}>
                    {format ? format(value) : value}
                </span>
            </div>
            <input
                aria-label={label}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={event => onChange(Number(event.target.value))}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                className={tokens.rangeInputClass}
            />
        </div>
    );
};

/** 卡片右上角的「默认」按钮。 */
export const SettingsResetButton: React.FC<{
    density: SettingsRowDensity;
    label: string;
    onClick?: () => void;
    theme: Theme;
}> = ({ density, label, onClick, theme }) => {
    const tokens = TOKENS[density];
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={tokens.resetButtonClass}
            style={{
                color: theme.secondaryColor,
                borderColor: colorWithAlpha(theme.secondaryColor, 0.16),
                backgroundColor: colorWithAlpha(theme.backgroundColor, 0.22),
            }}
        >
            <RotateCcw size={tokens.resetIconSize} />
            {label}
        </button>
    );
};

/** 顶部页签行：等宽胶囊，选中态强调色描边。 */
export const SettingsSectionTabs = <T extends string>({
    density,
    tabs,
    active,
    onChange,
    theme,
    isDaylight,
}: {
    density: SettingsRowDensity;
    tabs: { id: T; label: string }[];
    active: T;
    onChange: (id: T) => void;
    theme: Theme;
    isDaylight: boolean;
}) => {
    const tokens = TOKENS[density];
    return (
        <div className={tokens.tabsContainerClass} style={{ backgroundColor: resolveTabsContainerBg(theme, isDaylight) }}>
            {tabs.map(tab => {
                const isActive = tab.id === active;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        data-rear-tab={density === 'rear' ? tab.id : undefined}
                        onClick={() => onChange(tab.id)}
                        className={tokens.tabButtonClass}
                        style={{
                            ...resolveOptionStyle(isActive, theme, isDaylight),
                            color: isActive ? theme.primaryColor : theme.secondaryColor,
                        }}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
};
