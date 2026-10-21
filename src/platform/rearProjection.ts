import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isCapacitorAndroid } from './runtime';

// src/platform/rearProjection.ts
// 背屏投屏插件（原生 @CapacitorPlugin(name = "RearProjection")）的前端封装。
//
// 只做三件事：把插件方法包成类型安全的函数、统一 web 环境下的降级行为、
// 把「背屏页是否已经挂上」这种一次性事件收敛成一个监听入口。
// 真正的投屏逻辑全在原生 RearProjectionController，这里不复制任何判断。

/** 特权通道：root 优先，其次 Shizuku，都没有就是 none。 */
export type RearPrivilegeChannel = 'root' | 'shizuku' | 'none';

export interface RearProjectionStatus {
    /** 设备是否存在背屏（小米背屏固定 displayId 1）。 */
    supported: boolean;
    channel: RearPrivilegeChannel;
    privileged: boolean;
    /** 背屏上是否已经跑着我们的歌词页。 */
    projecting: boolean;
    /** 左侧摄像头安全带宽度（物理像素）。 */
    safeLeftPx: number;
}

export interface RearProjectionStartResult {
    success: boolean;
    /** true 表示走了「主屏占位 + 迁屏」的回退路径。 */
    usedPlaceholder: boolean;
    message: string;
    projecting: boolean;
}

export interface RearProjectionStopResult {
    success: boolean;
    message: string;
    projecting: boolean;
}

export interface RearProjectionPrivilegeResult extends RearProjectionStatus {
    /** true 表示这次真的拉起了授权弹窗，结果稍后从 privilegeResult 事件回来。 */
    requested: boolean;
}

/** 背屏页挂载/卸载事件载荷。 */
export interface RearStatePayload {
    /** 背屏 WebView 是否已经就绪（页面 JS 调过 ready()）。 */
    active: boolean;
}

/** 背屏指令事件载荷；json 是 RearLyricsCommand 序列化后的字符串。 */
export interface RearCommandPayload {
    json: string;
}

/** 要推给背屏页的一份快照。kind 与 OBS 源一致：config / clock / audio。 */
export interface RearSnapshotPush {
    kind: 'config' | 'clock' | 'audio';
    json: string;
}

export interface RearProjectionPluginApi {
    getStatus(): Promise<RearProjectionStatus>;
    /** 设置背屏任务是否从最近任务里隐藏；返回值是落库后的当前值。 */
    setHideRearTask(options: { hidden: boolean }): Promise<{ hidden: boolean }>;
    startProjection(): Promise<RearProjectionStartResult>;
    stopProjection(): Promise<RearProjectionStopResult>;
    requestPrivilege(): Promise<RearProjectionPrivilegeResult>;
    openShizukuSettings(): Promise<void>;
    publishSnapshot(options: RearSnapshotPush): Promise<void>;
    addListener(
        eventName: 'rearState',
        listener: (payload: RearStatePayload) => void,
    ): Promise<PluginListenerHandle>;
    addListener(
        eventName: 'command',
        listener: (payload: RearCommandPayload) => void,
    ): Promise<PluginListenerHandle>;
    addListener(
        eventName: 'privilegeResult',
        listener: (payload: { granted: boolean }) => void,
    ): Promise<PluginListenerHandle>;
    removeAllListeners(): Promise<void>;
}

export const RearProjection = registerPlugin<RearProjectionPluginApi>('RearProjection');

/** 插件是否可用（只有安卓原生包里有）。 */
export const isRearProjectionAvailable = (): boolean => isCapacitorAndroid();

/** 推一份快照给背屏页；非安卓环境下是空操作。 */
export const publishRearSnapshot = async (push: RearSnapshotPush): Promise<void> => {
    if (!isRearProjectionAvailable()) {
        return;
    }
    await RearProjection.publishSnapshot(push);
};
