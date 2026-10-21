import { create } from 'zustand';

// src/stores/useRearLyricsSyncStore.ts
// 背屏同步请求：背屏页 ready / 恢复时请求主屏重发一份当前 config。
//
// 发布器有去重（同一份 config 不重复发），但「背屏重载后拿到的是旧缓存」这种情况
// 需要一次强制重发，否则主屏没改设置时永远不会再推。这里只存一个递增的请求号，
// 发布器订阅它，变化时清掉去重状态再发一次。

interface RearLyricsSyncState {
    /** 每次背屏请求快照递增；发布器用它作为强制重发的触发信号。 */
    snapshotRequestId: number;
    requestSnapshot: () => void;
}

export const useRearLyricsSyncStore = create<RearLyricsSyncState>(set => ({
    snapshotRequestId: 0,
    requestSnapshot: () => set(state => ({ snapshotRequestId: state.snapshotRequestId + 1 })),
}));
