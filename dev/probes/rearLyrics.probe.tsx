import React, { useEffect, useMemo, useState } from 'react';
import RearLyricsApp from '../../src/components/rear/RearLyricsApp';
import { DEFAULT_THEME } from '../../src/services/baseThemes';
import { PlayerState, type Line, type LyricData, type VisualizerBackgroundMode, type VisualizerMode } from '../../src/types';
import type {
    ObsBrowserSourceAudio,
    ObsBrowserSourceClock,
    ObsBrowserSourceConfig,
} from '../../src/types/obsBrowserSource';
import type { RearLyricsSettingsPatch } from '../../src/services/rearLyricsBridge';
import type { ProbeDefinition } from './definition';

// dev/probes/rearLyrics.probe.tsx
//
// 背屏歌词页的本地复现：真机迭代太慢（每次要重新构建 + 装机 + 截图），这里用假数据把
// 真实的 RearLyricsApp 挂起来，在 347x212 / dpr 2.8125 的视口里看布局（就是小米 17 Pro Max
// 背屏 WebView 的 CSS 视口）。
//
// 要看的是：
//   - 主歌词是否落在左侧安全带右边的区域里居中（296 物理像素 = 105 CSS px 左边不该有内容）；
//   - 背景是否铺满整屏（含左侧安全带）；
//   - 控制栏与效果设置面板是否完整落在右侧区域里；
//   - 切模式、改字号这种上行指令能否走通（假宿主会像主屏一样把状态改掉再推回来）。
//
// 配套截图脚本：dev/probes/rearLyricsShot.mjs。

/** 假主屏状态：背屏发上来的指令改这里，再推回背屏，模拟一次完整往返。 */
/** URL 上可以用 ?mode=sonnet&fontScale=0.5 指定要检查的模式与字号，默认 classic / 1。 */
const probeParams = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
/**
 * ?long=1 换成长歌词：这里一次性返回若干行，只显示第一行，专门检查窄可见区里的
 * 换行边界，不会被探针自带的短句掩盖。
 */
const LONG_LYRIC_LINES = [
    '我在那个被风吹过的夏天里学会了怎么去告别',
    '而所有没说出口的话最后都变成了沉默',
    '是一段很长很长的歌名用来检查截断与换行的歌词',
    'life is a long and winding road that never seems to end at all',
];
const useLongLyrics = probeParams?.get('long') === '1';

/*
 * 构图也走 URL：?canvasX=98&canvasY=0&centerOffsetX=0&centerOffsetY=0&effectScaleX=1&effectScaleY=1
 * 用来在不动真机的前提下验证「某个样式微调之后能不能落回歌词画布」。
 */
const readProbeNumber = (name: string): number | undefined => {
    const raw = probeParams?.get(name);
    if (raw === null || raw === undefined || raw === '') return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const probeFrame = {
    fontScale: readProbeNumber('frameFontScale'),
    canvasX: readProbeNumber('canvasX'),
    canvasY: readProbeNumber('canvasY'),
    centerOffsetX: readProbeNumber('centerOffsetX'),
    centerOffsetY: readProbeNumber('centerOffsetY'),
    effectScaleX: readProbeNumber('effectScaleX'),
    effectScaleY: readProbeNumber('effectScaleY'),
};
const hasProbeFrame = Object.values(probeFrame).some(value => value !== undefined);

/*
 * 出厂构图例外：和 useTypographySettingsStore 的 BUILTIN_REAR_LYRICS_FRAME_OVERRIDES 同一份。
 * 目前表是空的（新模型统一靠画布缩放适配），保留这条路径是为了以后加模式例外时
 * 探针不会比真机宽松、掩盖回归。
 */
import { BUILTIN_REAR_LYRICS_FRAME_OVERRIDES } from '../../src/stores/useTypographySettingsStore';
const builtinFrameFor = (mode: VisualizerMode) => BUILTIN_REAR_LYRICS_FRAME_OVERRIDES[mode];

const probeStore = {
    mode: (probeParams?.get('mode') as VisualizerMode) || 'classic',
    // 背屏字号是独立字段，探针里也用同一个初值，方便对照主屏口径。
    rearFontScale: Number(probeParams?.get('fontScale')) || 1,
    lyricsFontScale: 1,
    lyricsFontStyle: 'sans' as NonNullable<ObsBrowserSourceConfig['lyricsFontStyle']>,
    lyricsFontWeight: null as number | null,
    visualizerOpacity: 1,
    backgroundOpacity: 1,
    useCoverColorBg: false,
    disableVignette: false,
    disableGeometricBackground: false,
    backgroundMode: (probeParams?.get('bg') as VisualizerBackgroundMode) || 'latent',
    autoStartOnPlayback: false,
    // 「控制」页的回显字段：主屏推下来什么值，背屏那颗按钮就显示什么状态。
    volume: 0.62,
    isMuted: false,
    loopMode: 'all' as NonNullable<ObsBrowserSourceConfig['loopMode']>,
    isLiked: true,
    likeDisabled: false,
    automixEnabled: false,
    // 「列表」页的数据：照主屏队列精简成 id/name/artist/unavailable 四项，这里给几首假的。
    queue: [
        { id: 'q-1', name: '山野', artist: '探针歌手', unavailable: false },
        { id: 'q-2', name: '长夜漫游指南', artist: '另一位歌手', unavailable: false },
        { id: 'q-3', name: '一段很长很长的歌名用来检查截断', artist: '合唱', unavailable: true },
        { id: 'q-4', name: '归途', artist: '探针歌手', unavailable: false },
    ] as NonNullable<ObsBrowserSourceConfig['queue']>,
    queueIndex: 1,
    // 各模式的 tuning 覆盖；applySettings 的 tuningPatch 合并到这里，再推回背屏。
    visualizerTunings: {} as Record<string, Record<string, unknown>>,
    listeners: new Set<() => void>(),
};

const updateProbeStore = (patch: Partial<typeof probeStore>) => {
    Object.assign(probeStore, patch);
    probeStore.listeners.forEach(listener => listener());
};

const buildLines = (): Line[] => {
    if (useLongLyrics) {
        return LONG_LYRIC_LINES.map((fullText, lineIndex) => {
            const startTime = lineIndex * 3.2;
            const endTime = startTime + 3.2;
            const per = (endTime - startTime) / Math.max(1, fullText.length);
            return {
                startTime,
                endTime,
                fullText,
                translation: undefined,
                words: Array.from(fullText).map((char, index) => ({
                    text: char,
                    startTime: startTime + index * per,
                    endTime: startTime + (index + 1) * per,
                })),
            };
        });
    }
    const raw: Array<[number, number, string, string]> = [
        [0, 3.2, '儿时我常常听人说', '小时候常听大人讲'],
        [3.2, 6.4, '裹着小脚的那个', ''],
        [6.4, 10, '是山野里最孤独的人', ''],
        [10, 13.5, '她把一生都交给了风', ''],
    ];
    return raw.map(([startTime, endTime, fullText, translation]) => {
        const per = (endTime - startTime) / Math.max(1, fullText.length);
        return {
            startTime,
            endTime,
            fullText,
            translation: translation || undefined,
            words: Array.from(fullText).map((char, index) => ({
                text: char,
                startTime: startTime + index * per,
                endTime: startTime + (index + 1) * per,
            })),
        };
    });
};

const buildConfig = (): ObsBrowserSourceConfig => ({
    activePlaybackContext: 'main',
    stageSource: null,
    hasTrack: true,
    song: { id: 'probe-song', name: '山野' },
    songArtist: '探针歌手',
    songAlbum: '探针专辑',
    coverUrl: null,
    lyrics: { lines: buildLines(), title: '山野', artist: '探针歌手', isWordByWord: true } as LyricData,
    theme: DEFAULT_THEME,
    isDaylight: false,
    visualizerMode: probeStore.mode,
    background: { mode: probeStore.backgroundMode },
    lyricsFontScale: probeStore.lyricsFontScale,
    rearLyricsFontScale: probeStore.rearFontScale,
    lyricsFontStyle: probeStore.lyricsFontStyle,
    lyricsFontWeight: probeStore.lyricsFontWeight,
    visualizerOpacity: probeStore.visualizerOpacity,
    backgroundOpacity: probeStore.backgroundOpacity,
    useCoverColorBg: probeStore.useCoverColorBg,
    disableVignette: probeStore.disableVignette,
    disableGeometricBackground: probeStore.disableGeometricBackground,
    // 背屏面板不再提供字幕设置，这里只给渲染层一份固定值。
    subtitleFontScale: 1,
    subtitleFontStyle: 'sans',
    subtitleFontWeight: null,
    subtitleOverlayOpacity: 1,
    subtitleOverlayBackground: true,
    subtitleUpcomingLyricsBlur: true,
    subtitleFontInheritsLyrics: true,
    showHarmonySubtitle: true,
    harmonySubtitleBackground: true,
    hideTranslationSubtitle: false,
    rearLyricsAutoStart: probeStore.autoStartOnPlayback,
    volume: probeStore.volume,
    isMuted: probeStore.isMuted,
    loopMode: probeStore.loopMode,
    isLiked: probeStore.isLiked,
    likeDisabled: probeStore.likeDisabled,
    automixEnabled: probeStore.automixEnabled,
    queue: probeStore.queue,
    queueIndex: probeStore.queueIndex,
    staticMode: false,
    seed: 'rear-probe',
    updatedAt: Date.now(),
    /*
     * 构图来源：URL 参数覆盖出厂例外表。
     * 只在真的带了参数、或该模式有出厂例外时才写这个字段，避免空对象把「出厂构图」那条默认路径顶掉。
     */
    rearLyricsFrames: (() => {
        const builtin = builtinFrameFor(probeStore.mode);
        if (!hasProbeFrame && !builtin) return undefined;
        // URL 未指定的字段回落到出厂例外，这样只调一个参数时其余仍按真机缺省走。
        return {
            [probeStore.mode]: {
                ...builtin,
                ...Object.fromEntries(Object.entries(probeFrame).filter(([, v]) => v !== undefined)),
            },
        };
    })(),
});

const buildClock = (): ObsBrowserSourceClock => ({
    currentTime: 0,
    duration: 210,
    playerState: PlayerState.PLAYING,
    sentAtMs: Date.now(),
    playbackRate: 1,
});

const buildAudio = (tick: number): ObsBrowserSourceAudio => {
    const wave = (offset: number) => 0.35 + 0.35 * Math.sin((tick + offset) / 6);
    return {
        audioPower: wave(0),
        bands: {
            bass: wave(1),
            lowMid: wave(2),
            mid: wave(3),
            vocal: wave(4),
            treble: wave(5),
        },
        spectrum: Array.from({ length: 64 }, (_, index) => 0.2 + 0.6 * Math.abs(Math.sin((tick + index) / 9))),
        sentAtMs: Date.now(),
    };
};

const push = (kind: 'config' | 'clock' | 'audio', payload: unknown) => {
    (window as typeof window & { __foliaRear?: { push: (kind: string, json: string) => void } })
        .__foliaRear?.push(kind, JSON.stringify(payload));
};

const pushConfig = () => push('config', {
    ...buildConfig(),
    visualizerTunings: probeStore.visualizerTunings as NonNullable<ObsBrowserSourceConfig['visualizerTunings']>,
});

/**
 * 假主屏落一份背屏补丁：字段和 App.tsx 里的 applySettings 一一对应，
 * 只是为了在探针里验证「点一下真的会变」，不涉及真实 store。
 */
const applyProbePatch = (patch: RearLyricsSettingsPatch) => {
    const next: Partial<typeof probeStore> = {};
    if (patch.rearLyricsFontScale !== undefined) next.rearFontScale = patch.rearLyricsFontScale;
    if (patch.lyricsFontStyle !== undefined) next.lyricsFontStyle = patch.lyricsFontStyle;
    if (patch.lyricsFontWeight !== undefined) next.lyricsFontWeight = patch.lyricsFontWeight;
    if (patch.visualizerMode !== undefined) next.mode = patch.visualizerMode as VisualizerMode;
    if (patch.visualizerOpacity !== undefined) next.visualizerOpacity = patch.visualizerOpacity;
    if (patch.backgroundMode !== undefined) next.backgroundMode = patch.backgroundMode;
    if (patch.backgroundOpacity !== undefined) next.backgroundOpacity = patch.backgroundOpacity;
    if (patch.useCoverColorBg !== undefined) next.useCoverColorBg = patch.useCoverColorBg;
    if (patch.disableVignette !== undefined) next.disableVignette = patch.disableVignette;
    if (patch.disableGeometricBackground !== undefined) next.disableGeometricBackground = patch.disableGeometricBackground;
    if (patch.autoStartOnPlayback !== undefined) next.autoStartOnPlayback = patch.autoStartOnPlayback;
    if (patch.resetCommonSettings) {
        next.lyricsFontStyle = 'sans';
        next.lyricsFontWeight = null;
        next.rearFontScale = 1;
        next.visualizerOpacity = 1;
    }
    if (patch.tuningPatch) {
        next.visualizerTunings = {
            ...probeStore.visualizerTunings,
            [patch.tuningPatch.mode]: {
                ...(probeStore.visualizerTunings[patch.tuningPatch.mode] ?? {}),
                ...patch.tuningPatch.patch,
            },
        };
    }
    if (patch.resetTuning) {
        const rest = { ...probeStore.visualizerTunings };
        delete rest[patch.resetTuning];
        next.visualizerTunings = rest;
    }
    updateProbeStore(next);
};

/**
 * 假宿主。ready() 之后补推缓存快照（和真实原生一致）；send() 收到指令后像主屏一样
 * 改状态再推回 config，这样背屏的「点一下真的会变」也能在探针里验证。
 */
(window as typeof window & { FoliaRear?: unknown }).FoliaRear = {
    ready: () => {
        pushConfig();
        push('clock', buildClock());
    },
    requestSnapshot: () => {
        pushConfig();
        push('clock', buildClock());
    },
    send: (json: string) => {
        console.log('[rear-probe] command', json);
        try {
            const command = JSON.parse(json) as {
                type: string;
                mode?: string;
                value?: number;
                index?: number;
                patch?: RearLyricsSettingsPatch;
            };
            if (command.type === 'setVisualizerMode' && command.mode) {
                updateProbeStore({ mode: command.mode as VisualizerMode });
            } else if (command.type === 'setLyricsFontScale' && typeof command.value === 'number') {
                updateProbeStore({ rearFontScale: command.value });
            } else if (command.type === 'previewVolume' && typeof command.value === 'number') {
                // 拖动中的预览：真主屏按 rAF 改增益、不落 store，这里只更新显示值，够验证往返。
                updateProbeStore({ volume: command.value });
            } else if (command.type === 'setVolume' && typeof command.value === 'number') {
                // 松手提交：和主屏 handleSetVolume 一样，写音量同时解除静音。
                updateProbeStore({ volume: command.value, isMuted: false });
            } else if (command.type === 'toggleMute') {
                updateProbeStore({ isMuted: !probeStore.isMuted });
            } else if (command.type === 'toggleLoopMode') {
                // 循环顺序照主屏 handleToggleLoopMode：关 -> 列表 -> 单曲 -> 关。
                const nextLoopMode = probeStore.loopMode === 'off'
                    ? 'all'
                    : probeStore.loopMode === 'all' ? 'one' : 'off';
                updateProbeStore({ loopMode: nextLoopMode });
            } else if (command.type === 'toggleLike') {
                updateProbeStore({ isLiked: !probeStore.isLiked });
            } else if (command.type === 'toggleAutomix') {
                updateProbeStore({ automixEnabled: !probeStore.automixEnabled });
            } else if (command.type === 'applySettings' && command.patch) {
                applyProbePatch(command.patch);
            } else if (command.type === 'playQueueIndex' && typeof command.index === 'number') {
                if (probeStore.queue[command.index]) {
                    updateProbeStore({ queueIndex: command.index });
                }
            } else if (command.type === 'removeQueueSong' && typeof command.index === 'number') {
                updateProbeStore({ queue: probeStore.queue.filter((_, index) => index !== command.index) });
            } else if (command.type === 'moveQueueSongToNext' && typeof command.index === 'number') {
                // 假主屏只做「插到当前播放那首后面」这一步，够验证指令往返就行。
                const next = [...probeStore.queue];
                const [item] = next.splice(command.index, 1);
                next.splice(Math.min(probeStore.queueIndex + 1, next.length), 0, item);
                updateProbeStore({ queue: next });
            } else if (command.type === 'moveQueueSongToEnd' && typeof command.index === 'number') {
                const next = [...probeStore.queue];
                const [item] = next.splice(command.index, 1);
                next.push(item);
                updateProbeStore({ queue: next });
            } else if (command.type === 'shuffleQueue') {
                updateProbeStore({ queue: [...probeStore.queue].reverse() });
            }
        } catch {
            // 忽略解析失败
        }
    },
    log: (message: string) => console.log('[rear-probe] log', message),
};

const RearLyricsProbe: React.FC = () => {
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const listener = () => setVersion(value => value + 1);
        probeStore.listeners.add(listener);
        return () => {
            probeStore.listeners.delete(listener);
        };
    }, []);

    useEffect(() => {
        pushConfig();
    }, [version]);

    useEffect(() => {
        let tick = 0;
        const audioTimer = window.setInterval(() => {
            tick += 1;
            push('audio', buildAudio(tick));
        }, 100);
        return () => window.clearInterval(audioTimer);
    }, []);

    const overlay = useMemo(() => (
        <div data-probe-overlay className="absolute left-0 top-0 z-40 flex flex-col gap-1 p-1 text-[9px]">
            <span className="rounded bg-black/60 px-2 py-1 text-white/80">
                probe: {probeStore.mode} / {probeStore.rearFontScale.toFixed(2)}
            </span>
        </div>
    ), [version]);

    return (
        <div className="fixed inset-0">
            <RearLyricsApp />
            {overlay}
        </div>
    );
};

const probe: ProbeDefinition = {
    id: 'rearLyrics',
    title: '背屏歌词页',
    description: '在 347x212 / dpr 2.8125 视口里挂真实的 RearLyricsApp，用假数据检查左侧安全带、右侧居中与上行指令。',
    Component: RearLyricsProbe,
};

export default probe;
