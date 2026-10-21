import React, { useEffect } from 'react';
import { ExternalLink, Loader2, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { Theme } from '../../../types';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { isCapacitorAndroid } from '../../../platform/runtime';
import { useRearLyricsStore } from '../../../stores/useRearLyricsStore';

// src/components/modal/settings/RearLyricsSetting.tsx
// 「背屏歌词」设置卡片：主屏侧启动 / 退出小米背屏投屏的唯一入口。
//
// 只在安卓容器里渲染（网页版和桌面版连背屏都没有）。卡片本身不碰插件，
// 所有动作都转发给 useRearLyricsStore，保证 projecting 只有一份真相。

type RearLyricsSettingProps = {
    settingsCardClass: string;
    successBgColor: string;
    successTextColor: string;
    errorBgColor: string;
    errorTextColor: string;
    theme?: Theme;
    toggleOffBackgroundClass: string;
};

const RearLyricsSetting: React.FC<RearLyricsSettingProps> = ({
    settingsCardClass,
    successBgColor,
    successTextColor,
    errorBgColor,
    errorTextColor,
    theme,
    toggleOffBackgroundClass,
}) => {
    const { t } = useTranslation();
    const {
        supported,
        channel,
        privileged,
        projecting,
        active,
        busy,
        message,
        messageKind,
        refresh,
        start,
        stop,
        autoStartOnPlayback,
        handleSetAutoStartOnPlayback,
        hideRearTask,
        handleSetHideRearTask,
        requestPrivilege,
        openShizukuSettings,
    } = useRearLyricsStore(useShallow(state => ({
        supported: state.supported,
        channel: state.channel,
        privileged: state.privileged,
        projecting: state.projecting,
        active: state.active,
        busy: state.busy,
        message: state.message,
        messageKind: state.messageKind,
        refresh: state.refresh,
        start: state.start,
        stop: state.stop,
        autoStartOnPlayback: state.autoStartOnPlayback,
        handleSetAutoStartOnPlayback: state.handleSetAutoStartOnPlayback,
        hideRearTask: state.hideRearTask,
        handleSetHideRearTask: state.handleSetHideRearTask,
        requestPrivilege: state.requestPrivilege,
        openShizukuSettings: state.openShizukuSettings,
    })));

    // 打开设置面板时重新问一次原生状态：用户可能在别处（命令面板 / 背屏自身）改过投屏。
    useEffect(() => {
        if (isCapacitorAndroid()) {
            void refresh();
        }
    }, [refresh]);

    if (!isCapacitorAndroid()) {
        return null;
    }

    const channelLabel = channel === 'root'
        ? t('options.rearLyricsChannelRoot')
        : channel === 'shizuku'
            ? t('options.rearLyricsChannelShizuku')
            : t('options.rearLyricsChannelNone');

    const accentColor = theme?.secondaryColor || 'rgba(114, 119, 134, 1)';
    const primaryButtonClass = 'px-3 py-2 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed';
    const ghostButtonClass = `px-3 py-2 rounded-lg text-xs border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${toggleOffBackgroundClass}`;

    return (
        <SettingsAnchor anchorId="rearLyrics" label={t('options.rearLyrics')}>
            <SettingsSectionHeading icon={MonitorSmartphone} label={t('options.rearLyrics')} />
            <div className={`p-4 rounded-xl border space-y-3 ${settingsCardClass}`}>
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-[10px] ${supported ? successBgColor : errorBgColor} ${supported ? successTextColor : errorTextColor}`}>
                        {supported ? t('options.rearLyricsSupported') : t('options.rearLyricsUnsupported')}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-[10px] ${privileged ? successBgColor : errorBgColor} ${privileged ? successTextColor : errorTextColor}`}>
                        {t('options.rearLyricsChannel', { channel: channelLabel })}
                    </span>
                    {projecting && (
                        <span className={`px-2 py-1 rounded-full text-[10px] ${successBgColor} ${successTextColor}`}>
                            {active ? t('options.rearLyricsStatusReady') : t('options.rearLyricsStatusStarting')}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        disabled={busy || !supported || projecting}
                        onClick={() => void start()}
                        className={primaryButtonClass}
                        style={{ backgroundColor: accentColor }}
                    >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : t('options.rearLyricsStart')}
                    </button>
                    <button
                        type="button"
                        disabled={busy || !projecting}
                        onClick={() => void stop()}
                        className={ghostButtonClass}
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {t('options.rearLyricsStop')}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void requestPrivilege()}
                        className={ghostButtonClass}
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <ShieldCheck className="w-3 h-3 inline mr-1" />
                        {t('options.rearLyricsRequestPrivilege')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void openShizukuSettings()}
                        className={ghostButtonClass}
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <ExternalLink className="w-3 h-3 inline mr-1" />
                        {t('options.rearLyricsOpenShizuku')}
                    </button>
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-medium min-w-0" style={{ color: 'var(--text-primary)' }}>
                        {t('options.rearLyricsAutoStart')}
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={autoStartOnPlayback}
                        aria-label={t('options.rearLyricsAutoStart')}
                        onClick={() => handleSetAutoStartOnPlayback(!autoStartOnPlayback)}
                        data-rear-auto-start="main"
                        className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!autoStartOnPlayback ? toggleOffBackgroundClass : ''}`}
                        style={{ backgroundColor: autoStartOnPlayback ? accentColor : undefined }}
                    >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${autoStartOnPlayback ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-medium min-w-0" style={{ color: 'var(--text-primary)' }}>
                        {t('options.rearLyricsHideTask')}
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={hideRearTask}
                        aria-label={t('options.rearLyricsHideTask')}
                        onClick={() => handleSetHideRearTask(!hideRearTask)}
                        data-rear-hide-task="main"
                        className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!hideRearTask ? toggleOffBackgroundClass : ''}`}
                        style={{ backgroundColor: hideRearTask ? accentColor : undefined }}
                    >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${hideRearTask ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>

                {message && (
                    <div className={`text-[10px] leading-relaxed ${messageKind === 'error' ? errorTextColor : messageKind === 'success' ? successTextColor : 'opacity-60'}`}>
                        {message}
                    </div>
                )}

                <details className={`rounded-xl border p-3 ${settingsCardClass}`}>
                    <summary className="cursor-pointer select-none text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {t('options.rearLyricsGuideTitle')}
                    </summary>
                    <ol className="mt-3 pl-4 list-decimal space-y-1.5 text-[11px] opacity-60 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {[1, 2, 3, 4, 5].map(step => (
                            <li key={step}>{t(`options.rearLyricsGuideStep${step}`)}</li>
                        ))}
                    </ol>
                </details>
            </div>
        </SettingsAnchor>
    );
};

export default RearLyricsSetting;
