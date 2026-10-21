import React, { useEffect } from 'react';
import RearLyricsSetting from '../../src/components/modal/settings/RearLyricsSetting';
import { SettingsAnchorProvider, useSettingsAnchorStore } from '../../src/components/modal/settings/navigation/SettingsAnchorContext';
import { settingsCardClassFor, settingsToggleOffClassFor } from '../../src/components/modal/settings/settingsCardClasses';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import { useRearLyricsStore, type RearLyricsState } from '../../src/stores/useRearLyricsStore';
import '../../src/i18n/config';
import type { ProbeDefinition } from './definition';

// dev/probes/rearLyricsSetting.probe.tsx
//
// 「背屏歌词」设置卡片的本地复现。
//
// 这张卡片只在安卓容器里渲染（isCapacitorAndroid() 为真），浏览器里正常看不到，
// 所以第一件事是把 window.androidBridge 造出来骗过 Capacitor 的平台判定。
// 插件返回值没法在浏览器里伪造（Capacitor 的 registerPlugin 在模块求值时就锁定了平台，
// 晚一步的 stub 一律拿不到插件方法），因此这里改成直接写 store：先让真实的 refresh() 跑完
// （它会失败并写一条错误 message），再整体覆盖成要展示的状态，覆盖顺序由 finally 保证。
//
// 用 ?state=ready|unsupported|error 切三种状态。
// 要看的：状态标签是否按 supported/privileged 变色、按钮禁用态是否正确、
// 使用说明的折叠块是否正常、整体是否落在设置面板的视觉语言里。

type ProbeState = 'ready' | 'unsupported' | 'error';

const readProbeState = (): ProbeState => {
    const raw = new URLSearchParams(window.location.search).get('state');
    return raw === 'unsupported' || raw === 'error' ? raw : 'ready';
};

const PROBE_STATE = readProbeState();

/** 三种状态各自要展示的 store 快照。 */
const PROBE_STATES: Record<ProbeState, Partial<RearLyricsState>> = {
    ready: {
        supported: true,
        channel: 'shizuku',
        privileged: true,
        projecting: true,
        active: true,
        safeLeftPx: 296,
        message: '背屏歌词已启动',
        messageKind: 'success',
    },
    unsupported: {
        supported: false,
        channel: 'none',
        privileged: false,
        projecting: false,
        active: false,
        safeLeftPx: 296,
        message: null,
    },
    error: {
        supported: true,
        channel: 'none',
        privileged: false,
        projecting: false,
        active: false,
        safeLeftPx: 296,
        message: '启动失败：Shizuku 服务未运行，请先打开 Shizuku 并启动服务',
        messageKind: 'error',
    },
};

// 探针是 eager import：所有 *.probe.tsx 的模块体在任何探针页都会跑一遍。
// 伪造平台会改全局行为，所以只在选中本探针时生效。
if (new URLSearchParams(window.location.search).get('probe') === 'rearLyricsSetting') {
    (window as unknown as { androidBridge?: unknown }).androidBridge = {};
}

const RearLyricsSettingProbe: React.FC = () => {
    const anchorStore = useSettingsAnchorStore();

    useEffect(() => {
        let cancelled = false;
        // finally：真实的 refresh() 无论成功还是失败都先落地，再由这里覆盖成要展示的状态。
        void useRearLyricsStore.getState().refresh().finally(() => {
            if (!cancelled) {
                useRearLyricsStore.setState(PROBE_STATES[PROBE_STATE]);
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const isDaylight = false;

    return (
        <SettingsAnchorProvider store={anchorStore}>
            <div className="mx-auto max-w-3xl p-6">
                <RearLyricsSetting
                    settingsCardClass={settingsCardClassFor(isDaylight)}
                    successBgColor="bg-emerald-500/15"
                    successTextColor="text-emerald-300"
                    errorBgColor="bg-red-500/15"
                    errorTextColor="text-red-300"
                    theme={DEFAULT_THEME}
                    toggleOffBackgroundClass={settingsToggleOffClassFor(isDaylight)}
                />
                <div data-probe-overlay className="mt-4 text-[11px] text-zinc-500">
                    state: {PROBE_STATE}
                </div>
            </div>
        </SettingsAnchorProvider>
    );
};

const probe: ProbeDefinition = {
    id: 'rearLyricsSetting',
    title: '背屏歌词设置卡片',
    description: '把 Capacitor 伪装成安卓，挂真实的 RearLyricsSetting，用 ?state=ready|unsupported|error 看三种状态。',
    Component: RearLyricsSettingProbe,
};

export default probe;
