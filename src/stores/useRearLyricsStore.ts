import { create } from 'zustand';
import {
    RearProjection,
    isRearProjectionAvailable,
    type RearPrivilegeChannel,
} from '../platform/rearProjection';
import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';

// src/stores/useRearLyricsStore.ts
// 主屏侧的背屏歌词状态与唯一控制入口。
//
// 「开始 / 退出背屏投屏」只有这一个调用方：设置卡片、命令面板、任何后续 UI 都读写这里，
// 不允许谁绕过 store 直接调插件，否则 projecting 会出现两份互相矛盾的真相。
//
// 真相全部来自原生：refresh() 查 getStatus()，start()/stop() 走原生投屏控制，
// 背屏页是否已经挂上由 rearState 事件补进来（只用来提示「正在显示歌词」）。

export type RearLyricsMessageKind = 'info' | 'success' | 'error';

/** 「播放歌曲就自动投到背屏」的开关（localStorage 键）。 */
export const REAR_LYRICS_AUTO_START_STORAGE_KEY = 'rear_lyrics_auto_start';

/**
 * 「背屏任务不出现在最近任务里」的开关（localStorage 键）。
 *
 * <p>默认 true，和改这个开关之前的行为一致：背屏任务藏在最近任务外，用户划掉主屏任务时
 * 不会顺手把投屏也带走。关掉之后背屏任务会在最近任务里可见，方便手动切回去。
 */
export const REAR_LYRICS_HIDE_TASK_STORAGE_KEY = 'rear_lyrics_hide_task';

export interface RearLyricsState {
    /** 设备是否有背屏（小米背屏固定 displayId 1）。 */
    supported: boolean;
    /** 特权通道：root 优先，其次 shizuku，都没有就是 none。 */
    channel: RearPrivilegeChannel;
    privileged: boolean;
    /** 背屏上是否已经跑着歌词页（原生任务存在）。 */
    projecting: boolean;
    /** 背屏页 JS 是否已就绪并开始收推送。 */
    active: boolean;
    /** 左侧摄像头安全带宽度（物理像素），只用于展示。 */
    safeLeftPx: number;
    /** 有请求在飞：按钮禁用，避免连点开出两个背屏任务。 */
    busy: boolean;
    /** 开始播放歌曲时自动投屏（用户可在设置卡片里关掉）。 */
    autoStartOnPlayback: boolean;
    /** 背屏任务是否从最近任务里隐藏。 */
    hideRearTask: boolean;
    message: string | null;
    messageKind: RearLyricsMessageKind;
    refresh: () => Promise<void>;
    start: () => Promise<void>;
    /** silent = 自动退出时不弹 toast（停止播放 10 秒的自动收尾）。 */
    stop: (silent?: boolean) => Promise<void>;
    requestPrivilege: () => Promise<void>;
    openShizukuSettings: () => Promise<void>;
    /** 原生 rearState 事件入口，由 installRearLyricsStoreBridge 调用。 */
    applyRearState: (active: boolean) => void;
    /** 原生 privilegeResult 事件入口。 */
    applyPrivilegeResult: (granted: boolean) => void;
    clearMessage: () => void;
    /** 「播放即自动投屏」开关。 */
    handleSetAutoStartOnPlayback: (enabled: boolean) => void;
    /** 「背屏任务从最近任务隐藏」开关。 */
    handleSetHideRearTask: (enabled: boolean) => void;
}

/** 把 Promise 的失败统一转成一句人话，不让 UI 直接吞掉异常。 */
const describeError = (error: unknown): string => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === 'string' && error) {
        return error;
    }
    return '未知错误';
};

export const useRearLyricsStore = create<RearLyricsState>((set, get) => ({
    supported: false,
    channel: 'none',
    privileged: false,
    projecting: false,
    active: false,
    safeLeftPx: 280,
    busy: false,
    autoStartOnPlayback: getStoredBoolean(REAR_LYRICS_AUTO_START_STORAGE_KEY, false),
    hideRearTask: getStoredBoolean(REAR_LYRICS_HIDE_TASK_STORAGE_KEY, true),
    message: null,
    messageKind: 'info',

    refresh: async () => {
        if (!isRearProjectionAvailable()) {
            set({ supported: false, channel: 'none', privileged: false, projecting: false });
            return;
        }
        try {
            const status = await RearProjection.getStatus();
            set({
                supported: status.supported,
                channel: status.channel,
                privileged: status.privileged,
                projecting: status.projecting,
                safeLeftPx: status.safeLeftPx,
            });
        } catch (error) {
            set({ message: `读取投屏状态失败：${describeError(error)}`, messageKind: 'error' });
        }
    },

    start: async () => {
        if (get().busy) {
            return;
        }
        if (!isRearProjectionAvailable()) {
            set({ message: '当前不是安卓容器，背屏投屏不可用', messageKind: 'error' });
            return;
        }
        set({ busy: true, message: null });
        try {
            const result = await RearProjection.startProjection();
            set({
                projecting: true,
                message: result.usedPlaceholder
                    ? '已通过占位页方式投到背屏'
                    : '背屏歌词已启动',
                messageKind: 'success',
            });
        } catch (error) {
            set({ projecting: false, message: `启动失败：${describeError(error)}`, messageKind: 'error' });
        } finally {
            set({ busy: false });
            void get().refresh();
        }
    },

    stop: async (silent = false) => {
        if (get().busy) {
            return;
        }
        if (!isRearProjectionAvailable()) {
            return;
        }
        set({ busy: true, message: null });
        try {
            await RearProjection.stopProjection();
            set(silent
                ? { projecting: false, active: false, message: null }
                : { projecting: false, active: false, message: '背屏歌词已退出', messageKind: 'info' });
        } catch (error) {
            set({ message: `退出失败：${describeError(error)}`, messageKind: 'error' });
        } finally {
            set({ busy: false });
            void get().refresh();
        }
    },

    requestPrivilege: async () => {
        if (!isRearProjectionAvailable()) {
            set({ message: '当前不是安卓容器，无法申请特权', messageKind: 'error' });
            return;
        }
        set({ busy: true, message: null });
        try {
            const result = await RearProjection.requestPrivilege();
            set({
                supported: result.supported,
                channel: result.channel,
                privileged: result.privileged,
                projecting: result.projecting,
                safeLeftPx: result.safeLeftPx,
                message: result.requested
                    ? '已弹出 Shizuku 授权框，请在弹窗里允许 Folia'
                    : (result.privileged ? '特权通道已可用' : '还没有拿到特权，请先在 Shizuku 里启动服务'),
                messageKind: result.requested || result.privileged ? 'info' : 'error',
            });
        } catch (error) {
            set({ message: `申请特权失败：${describeError(error)}`, messageKind: 'error' });
        } finally {
            set({ busy: false });
        }
    },

    openShizukuSettings: async () => {
        if (!isRearProjectionAvailable()) {
            return;
        }
        try {
            await RearProjection.openShizukuSettings();
        } catch (error) {
            set({ message: `打开 Shizuku 失败：${describeError(error)}`, messageKind: 'error' });
        }
    },

    applyRearState: (active) => {
        // 页面就绪说明任务确实在跑；离线只说明页面没了，任务可能还在，交给 refresh() 判断。
        set(active ? { active: true, projecting: true } : { active: false });
        if (!active) {
            void get().refresh();
        }
    },

    applyPrivilegeResult: (granted) => {
        set({
            message: granted ? 'Shizuku 授权成功，现在可以投屏了' : 'Shizuku 授权被拒绝',
            messageKind: granted ? 'success' : 'error',
        });
        void get().refresh();
    },

    clearMessage: () => set({ message: null }),

    handleSetAutoStartOnPlayback: (enabled) => {
        setStoredBoolean(REAR_LYRICS_AUTO_START_STORAGE_KEY, enabled);
        set({ autoStartOnPlayback: enabled });
    },

    handleSetHideRearTask: (enabled) => {
        setStoredBoolean(REAR_LYRICS_HIDE_TASK_STORAGE_KEY, enabled);
        set({ hideRearTask: enabled });
        // 已经在投屏时改这个开关：把新值立刻同步给原生，下一次投屏/重启都按它走。
        if (isRearProjectionAvailable()) {
            void RearProjection.setHideRearTask({ hidden: enabled }).catch(() => undefined);
        }
    },
}));

/**
 * 把原生事件接到 store 上。
 *
 * 只注册一次，由 src/index.tsx 在启动时调用；非安卓环境下直接返回，
 * 不产生任何监听，桌面 / 网页版拿不到也不会多出分支。
 */
export const installRearLyricsStoreBridge = (): void => {
    if (!isRearProjectionAvailable()) {
        return;
    }

    void RearProjection.addListener('rearState', payload => {
        useRearLyricsStore.getState().applyRearState(payload.active);
    }).catch(() => undefined);

    void RearProjection.addListener('privilegeResult', payload => {
        useRearLyricsStore.getState().applyPrivilegeResult(payload.granted);
    }).catch(() => undefined);

    void useRearLyricsStore.getState().refresh();
};
