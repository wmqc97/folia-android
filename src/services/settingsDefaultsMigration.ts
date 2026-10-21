import { useThemeSettingsStore } from '../stores/useThemeSettingsStore';
import { usePlayerChromeSettingsStore } from '../stores/usePlayerChromeSettingsStore';
import { useStageSettingsStore } from '../stores/useStageSettingsStore';

// src/services/settingsDefaultsMigration.ts
// 一次性把三项新默认值落到老安装上：
//   - 跟随系统明暗：开
//   - 实验室「始终显示切歌按钮」：开
//   - 视觉设置「歌曲信息卡片」：不显示
//
// 这三项以前存过 false / auto 的设备不会因为改默认值而生效，所以用一次迁移显式写一遍。
// 只跑一次；用户之后自己改回去仍然以用户的值为准。

const APPLIED_KEY = 'folia_settings_defaults_v2_applied';

export const applySettingsDefaultsMigration = (): void => {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        if (localStorage.getItem(APPLIED_KEY) === '1') {
            return;
        }
        useThemeSettingsStore.getState().setFollowSystemTheme(true);
        usePlayerChromeSettingsStore.getState().handleToggleAlwaysShowTrackSwitchButtons(true);
        useStageSettingsStore.getState().handleSetStageTrackPillMode('never');
        localStorage.setItem(APPLIED_KEY, '1');
    } catch {
        // 任何一步失败都不阻塞启动；下次启动会再试一次。
    }
};
