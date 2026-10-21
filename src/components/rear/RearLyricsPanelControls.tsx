import React from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Theme } from '../../types';
import {
    SettingsPresetGroup,
    SettingsResetButton,
    SettingsSectionCard,
    SettingsSliderRow,
    SettingsToggleRow,
    type SettingsPresetOption,
} from '../settingsRows/settingsRowKit';
import { REAR_TUNING_PANEL_SCALE } from './rearPanelStyle';

// src/components/rear/RearLyricsPanelControls.tsx
// 背屏设置面板的控件层：共享控件套装的薄封装。
//
// 控件本体在 components/settingsRows/settingsRowKit.tsx，那边一份实现同时供主屏
// VisPlaygroundSettingsPanel 与背屏使用，density='rear' 与主屏是同一档
// （尺寸、颜色、结构、选中态算法完全共用）。所以背屏面板的款式就是主屏面板的款式，不会走样。
//
// 这里保留 Rear* 这套名字，是为了让五个背屏子面板的代码不必跟着改；
// 每个封装只做一件事：把 density='rear' 填上。
//
// 顶部那条页签不在这一层：背屏面板的页签就是主屏播放页面板（UnifiedPanel）那条分段式
// 图标页签，配色与形状都跟那个面板绑定（bg-white/5 容器 + 选中格 bg-white/10 + shadow-sm，
// 见 rearPanelStyle.resolveRearPanelChrome），所以和它一起放在 RearLyricsPanel.tsx 里，
// 跟主屏保持同构。

export type RearPresetOption<T> = SettingsPresetOption<T>;

/** 单个设置卡片：可选标题 + 右侧动作（比如「默认」）。 */
export const RearSectionCard: React.FC<{
    title?: string;
    description?: string;
    action?: React.ReactNode;
    theme: Theme;
    isDaylight: boolean;
    children: React.ReactNode;
}> = ({ title, description, action, theme, isDaylight, children }) => (
    <SettingsSectionCard
        density="rear"
        title={title}
        description={description}
        action={action}
        theme={theme}
        isDaylight={isDaylight}
    >
        {children}
    </SettingsSectionCard>
);

/** 胶囊选项组（主屏 PresetGroup 的背屏尺寸档）。 */
export const RearPresetGroup = <T,>({
    label,
    value,
    options,
    onChange,
    theme,
    isDaylight,
}: {
    label: string;
    value: T;
    options: SettingsPresetOption<T>[];
    onChange: (next: T) => void;
    theme: Theme;
    isDaylight: boolean;
}) => (
    <SettingsPresetGroup
        density="rear"
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        theme={theme}
        isDaylight={isDaylight}
    />
);

/** 开关行（主屏 ToggleRow 的背屏尺寸档）。 */
export const RearToggleRow: React.FC<{
    label: string;
    description?: string;
    checked: boolean;
    onChange?: (checked: boolean) => void;
    theme: Theme;
    icon?: LucideIcon;
}> = ({ label, description, checked, onChange, theme, icon }) => (
    <SettingsToggleRow
        density="rear"
        label={label}
        description={description}
        checked={checked}
        onChange={onChange}
        theme={theme}
        icon={icon}
    />
);

/** 带数值的滑杆行。 */
export const RearSlider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    theme: Theme;
    onChange: (value: number) => void;
    format?: (value: number) => string;
}> = ({ label, value, min, max, step, theme, onChange, format }) => (
    <SettingsSliderRow
        density="rear"
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        theme={theme}
        onChange={onChange}
        format={format}
    />
);

/** 卡片右上角的「默认」按钮。 */
export const RearResetButton: React.FC<{ label: string; theme: Theme; onClick?: () => void }> = ({
    label,
    theme,
    onClick,
}) => (
    <SettingsResetButton density="rear" label={label} theme={theme} onClick={onClick} />
);

/**
 * registry 调参面板的容器：按 REAR_TUNING_PANEL_SCALE 整体缩放。
 *
 * 缩放系数现在是 1（背屏面板与主屏同尺寸），这里保留机构是为了以后要微调时有地方改。
 * 视觉缩放不改布局尺寸，所以外层要按同比例加宽，否则缩完右边会空出一条；
 * 高度方向多出来的空白由外层滚动容器自然吸收。
 */
export const RearTuningScope: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div data-rear-tuning-scope style={{ width: `${100 / REAR_TUNING_PANEL_SCALE}%`, transformOrigin: 'top left', transform: `scale(${REAR_TUNING_PANEL_SCALE})` }}>
        {children}
    </div>
);
