import type { CSSProperties } from 'react';
import type { Theme } from '../../types';
import { resolveTextOnAccent } from '../app/presentation/buildAppStyle';
import { REAR_RANGE_INPUT_CLASS as SHARED_REAR_RANGE_INPUT_CLASS, resolveSettingsCardBg } from '../settingsRows/settingsRowKit';

// src/components/rear/rearPanelStyle.ts
// 背屏设置面板的共用样式常量。
//
// 背屏页（?rear=1）不是主 App 的子页面：主界面那套主题变量（--text-primary / --text-secondary
// / --text-accent / --text-on-accent / --bg-color）是铺在 App 外壳上的，背屏这边没有。
// 而背屏「歌词动画」「背景」两个页签直接渲染 visualizer / backgrounds registry 自带的调参面板
// （它们按 var(--text-*) 上色），所以这里按推送下来的 theme 再算一份变量，注入面板根节点。

/**
 * registry 调参面板（卡片 p-4、圆角 24px）本来就是主界面尺寸，背屏面板现在也是主界面尺寸，
 * 所以两边 1:1 对齐，不再缩放。留着这个系数是为了以后真需要整体微调时有地方改。
 */
export const REAR_TUNING_PANEL_SCALE = 1;

/**
 * 卡片底色：与主界面同一条算法、同一个数值。这里只是给它一个背屏语义的名字。
 */
export const resolveRearCardBg = (theme: Theme, isDaylight: boolean) => (
    resolveSettingsCardBg(theme, isDaylight)
);

/**
 * 背屏面板整块底：主屏播放页面板（UnifiedPanel）那一档的玻璃底色。
 *
 * 主屏那边的写死值是 `bg-black/40`（夜间）/ `bg-white/60`（日间），再叠 `backdrop-blur-3xl`。
 * 背屏面板要和它「同款」，就不能再按主题底色算出接近不透明的一层——那样颜色、通透度
 * 都会和主屏对不上，看着只是「风格像」。这里直接照抄主屏那两个 class。
 *
 * 后面的大字透出来怎么办：主屏面板底下也是整页歌词，靠的就是这层 64px 背景模糊 +
 * 40% 底色把内容糊掉，背屏用同一档所以控件一样清楚。
 */
export const resolveRearPanelShellClass = (isDaylight: boolean) => (
    isDaylight ? 'bg-white/60' : 'bg-black/40'
);

/**
 * 面板顶部分段页签条的配色。
 *
 * 逐条对齐主屏播放页面板：容器是白色薄涂一层（`bg-white/5`），
 * 选中的那一格再亮一档（`bg-white/10` + shadow-sm），未选中不描边、只降透明度。
 * 日间主题下主屏把这两处换成黑色薄涂，这里跟着换。
 */
export const resolveRearPanelChrome = (isDaylight: boolean) => ({
    switcherClass: isDaylight ? 'bg-black/5' : 'bg-white/5',
    activeTabClass: isDaylight ? 'bg-black/10' : 'bg-white/10',
});

/**
 * 滑杆外观：和主界面 VisPlayground 的 rangeInputClass 同构，尺寸缩一档。
 * 定义在共享控件套装里，registry 调参面板（背景 / 歌词模式）直接复用同一份。
 */
export const REAR_RANGE_INPUT_CLASS = SHARED_REAR_RANGE_INPUT_CLASS;

/** 面板根节点的主题变量；registry 调参面板靠这些变量取色。 */
export const buildRearPanelVars = (theme: Theme, isDaylight: boolean): CSSProperties => {
    const backgroundColor = theme.backgroundColor;
    return {
        '--bg-color': backgroundColor,
        '--text-primary': theme.primaryColor,
        '--text-secondary': theme.secondaryColor,
        '--text-accent': theme.accentColor,
        '--text-on-accent': resolveTextOnAccent(theme.accentColor, backgroundColor, theme.primaryColor),
        color: theme.primaryColor,
    } as CSSProperties;
};
