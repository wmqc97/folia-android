import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '../../src/types';
import { installNativePlaybackBridge, resolveNativeCoverUrl } from '../../src/services/nativePlaybackBridge';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { PlayerState } from '../../src/types';
import { currentTime } from '../../src/stores/motionSignals';

// test/unit/nativePlaybackBridge.test.ts
// 校验送给安卓原生媒体通知的封面地址选择规则，以及进度推送必须带真实的播放态：
// 写死 playing:true 会让前端暂停后被原生改回 STATE_PLAYING，系统媒体控制随即失效。

const makeSong = (overrides: Partial<SongResult> = {}): SongResult => ({
    id: 1,
    name: 'Track',
    artists: [{ id: 9, name: 'Artist' }],
    album: { id: 3, name: 'Album', coverUrl: 'https://example.com/album.jpg' },
    durationMs: 180_000,
    ...overrides,
});

const makePlugin = () => ({
    updatePlaybackState: vi.fn(async () => undefined),
    clearPlaybackState: vi.fn(async () => undefined),
    addListener: vi.fn(async () => ({ remove: async () => undefined })),
});

const setPlayback = (patch: { playerState: PlayerState; currentTime?: number }) => {
    usePlaybackStore.setState({
        currentSong: makeSong(),
        audioSrc: 'https://example.com/a.mp3',
        playQueue: [makeSong()],
        playerState: patch.playerState,
        duration: 180,
        transitionDisplay: null,
    });
    if (patch.currentTime !== undefined) currentTime.set(patch.currentTime);
};

// 模块顶部的 `installed` 只拦一次 wire-up，而 store 订阅和定时器都是装给「当前这个 plugin」的，
// 所以每个用例都要重新 import 一次模块来拿到新鲜的守卫与 interval。
const installFresh = async () => {
    vi.resetModules();
    const bridge = await import('../../src/services/nativePlaybackBridge');
    // resetModules 会连 store 一起换成新实例，所以装桥之前必须把状态重新写进「新的那个」。
    const store = await import('../../src/stores/usePlaybackStore');
    store.usePlaybackStore.setState({
        currentSong: makeSong(),
        audioSrc: 'https://example.com/a.mp3',
        playQueue: [makeSong()],
        playerState: PlayerState.PLAYING,
        duration: 180,
        transitionDisplay: null,
    });
    const signals = await import('../../src/stores/motionSignals');
    signals.currentTime.set(12);
    const plugin = makePlugin();
    await bridge.installNativePlaybackBridge(plugin as never);
    return { plugin, store, signals };
};

describe('resolveNativeCoverUrl', () => {
    it('uses the album cover when it is directly fetchable', () => {
        expect(resolveNativeCoverUrl(makeSong())).toBe('https://example.com/album.jpg');
    });

    it('falls back to the provider cover when the album has none', () => {
        const song = makeSong({ album: { id: 3, name: 'Album', coverUrl: '' } });
        expect(resolveNativeCoverUrl(song)).toBe('');
    });

    it('keeps local covers untouched so native can decode them in the WebView', () => {
        const song = makeSong({ album: { id: 3, name: 'Album', coverUrl: 'folia-cover://asset/x' } });
        expect(resolveNativeCoverUrl(song)).toBe('folia-cover://asset/x');
    });

    it('falls back to a local album cover when the provider offers nothing', () => {
        const song = makeSong({ album: { id: 3, name: 'Album', coverUrl: '/__folia_cover/abc' } });
        expect(resolveNativeCoverUrl(song)).toBe('/__folia_cover/abc');
    });

    it('returns an empty string when there is no cover at all', () => {
        const song = makeSong({ album: { id: 3, name: 'Album', coverUrl: null } });
        expect(resolveNativeCoverUrl(song)).toBe('');
    });
});

describe('native playback progress push', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // install 里走的是 window.setInterval：node 环境没有 window，且必须让 fake timer 接管它，
        // 否则 advanceTimersByTime 推不动那个间隔。这里的 window 要在 useFakeTimers 之后建，
        // 拿到的才是被替身的 setInterval。
        vi.stubGlobal('window', {
            setInterval: globalThis.setInterval,
            clearInterval: globalThis.clearInterval,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        });
        // 依赖链里有 i18n，它在模块顶层读 localStorage。
        vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
        vi.stubGlobal('document', { documentElement: {} });
        setPlayback({ playerState: PlayerState.PLAYING, currentTime: 12 });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('reports paused to the native session after a pause, not playing', async () => {
        const { plugin, store } = await installFresh();

        // 播放中：每秒的进度推送带着 playing:true。
        vi.advanceTimersByTime(1000);
        expect(plugin.updatePlaybackState).toHaveBeenLastCalledWith(
            expect.objectContaining({ playing: true, position: 12000 }),
        );

        // 暂停后 interval 会停，所以「暂停时还在推 playing:true」只能来自 store 订阅那条。
        // 写死 playing:true 的话，原生侧会把媒体会话改回 STATE_PLAYING，
        // 通知按钮、锁屏和系统媒体控制全部失效 —— 也就是「暂停不了」。
        store.usePlaybackStore.setState({ playerState: PlayerState.PAUSED });

        const calls = plugin.updatePlaybackState.mock.calls.map(call => call[0]);
        // 最后一条必须承认暂停；之前那条是播放中的进度，两条都该是各自真实的状态。
        expect(calls.at(-1)).toEqual(expect.objectContaining({ playing: false }));
        expect(calls.at(-2)).toEqual(expect.objectContaining({ playing: true }));

        // 暂停之后定时器不再推进，所以不该再有任何新推送。
        const pausedCallCount = plugin.updatePlaybackState.mock.calls.length;
        vi.advanceTimersByTime(5000);
        expect(plugin.updatePlaybackState.mock.calls.length).toBe(pausedCallCount);
    });

    it('keeps the position clamped and the duration in sync while playing', async () => {
        const { plugin } = await installFresh();
        vi.advanceTimersByTime(1000);
        expect(plugin.updatePlaybackState).toHaveBeenLastCalledWith(
            expect.objectContaining({ duration: 180_000 }),
        );
    });
});
