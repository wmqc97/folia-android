import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MotionValue } from 'framer-motion';
import type {
    AudioBands,
    CappellaAvatarImage,
    CappellaEmojiImage,
    CappellaTuning,
    CadenzaTuning,
    ClassicTuning,
    CladdaghTuning,
    DioramaTuning,
    FumeTuning,
    LyricData,
    MonetBackgroundImage,
    MonetPortraitImage,
    MonetTuning,
    PartitaTuning,
    PlaybackContext,
    PlayerState,
    SongResult,
    StageSource,
    SubtitleContentMode,
    Theme,
    ThemeMode,
    TiltTuning,
    VisualizerMode,
} from '../types';
import type {
    ObsBrowserSourceAudio,
    ObsBrowserSourceClock,
    ObsBrowserSourceConfig,
    ObsBrowserSourceQueueItem,
    ObsBrowserSourceStatus,
} from '../types/obsBrowserSource';
import {
    buildLegacyObsBrowserSourceBackgroundConfig,
    buildObsBrowserSourceConfigSignature,
    ObsBrowserSourceConfigPublicationTracker,
    downsampleObsSpectrum,
    isObsBrowserSourceBlobCoverUrl,
    resolveObsBrowserSourceClockTime,
    resolveObsBrowserSourceCoverUrl,
    resolveObsBrowserSourceImageAsset,
    resolveObsBrowserSourceImageAssets,
} from '../utils/obsBrowserSource';
import type { TemperaLayerImage } from '../types';
import { loadTemperaLayerImageBlobs } from '../services/temperaLayerImages';
import type { VisualizerTuningBundle } from '../components/visualizer/tuningRegistry';
import type { VisualizerBackgroundConfig } from '../components/visualizer/backgrounds/definition';
import { getSongAlbumLabel, getSongArtistLabel } from '../services/onlineMusic/songMetadata';
import { isSongUnavailable } from '../services/onlineMusic/songAvailability';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useThemeSettingsStore } from '../stores/useThemeSettingsStore';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { useVisualizerAssetStore } from '../stores/useVisualizerAssetStore';
import { audioBands, audioPower, currentTime } from '../stores/motionSignals';
import { useVisualizerTunings } from '../components/visualizer/useVisualizerTunings';
import { useVisualizerBackgroundConfig } from '../components/visualizer/useVisualizerBackgroundConfig';
import { usePlayerChromeSettingsStore } from '../stores/usePlayerChromeSettingsStore';
import { useRearLyricsStore } from '../stores/useRearLyricsStore';
import { useRearLyricsVisualSettingsStore } from '../stores/useRearLyricsVisualSettingsStore';
import { useRearLyricsSyncStore } from '../stores/useRearLyricsSyncStore';
import { isCapacitorAndroid } from '../platform/runtime';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '../stores/useAutomixSettingsStore';

// src/hooks/useObsBrowserSourcePublisher.ts
// Publishes the single playback surface to the local OBS browser source.

const OBS_CLOCK_INTERVAL_MS = 250;
const OBS_AUDIO_INTERVAL_MS = 50;
const OBS_CLOCK_JUMP_THRESHOLD_SEC = 0.35;
const OBS_CLOCK_JUMP_MIN_INTERVAL_MS = 80;
/**
 * 发布通道。默认是 Electron 主进程 IPC（OBS 浏览器源），
 * 安卓端由 useRearLyricsTransport 传进来一条「推给背屏 WebView」的通道。
 *
 * <p>两条通道的载荷完全一样，所以配置构建、时钟外推、频谱降采样都只有一份实现。
 */
export interface ObsBrowserSourcePublishTransport {
    publishConfig: (config: ObsBrowserSourceConfig) => Promise<unknown>;
    publishClock: (clock: ObsBrowserSourceClock) => Promise<unknown>;
    publishAudio: (audio: ObsBrowserSourceAudio) => Promise<unknown>;
}

type UseObsBrowserSourcePublisherOptions = {
    isElectronWindow: boolean;
    stageSource: StageSource | null;
    coverUrl: string | null;
    offsetMs: number;
    theme: Theme;
    subtitleTheme?: Theme;
    hideTranslationSubtitle: boolean;
    seed: string | number;
    /** 额外的发布通道（背屏歌词页）。不传时只发 OBS。 */
    transport?: ObsBrowserSourcePublishTransport | null;
    /**
     * 背屏歌词页是否在线。
     *
     * <p>它只影响「要不要发」：背屏在线时即使没有 OBS 客户端也要持续推时钟与频谱，
     * 但**不**参与 isObsBrowserSourceRendering —— 那个标志会让主窗口把 visualizer 切成 still，
     * 背屏投屏时主窗口还在正常用，不能被牵连。
     */
    isRearLyricsActive?: boolean;
    /**
     * 当前歌曲是否已收藏、以及「喜爱」能不能用。
     *
     * <p>这两个值背屏「控制」页要显示，但它们的来源在 App 层（持有的是混音过渡期间的那首歌，
     * 与 Stage / 音源是否支持收藏也要一起判断），所以由调用方算好传进来，
     * 和 config 里其他「从 store 现读」的字段不同。
     */
    isLiked?: boolean;
    likeDisabled?: boolean;
    bgMode?: ThemeMode;
    hasCustomTheme?: boolean;
};

const emptyObsStatus = (): ObsBrowserSourceStatus => ({
    enabled: false,
    port: 0,
    token: null,
    url: null,
    clientCount: 0,
});

const getSongArtist = (song: SongResult | null) => getSongArtistLabel(song) || null;

const getSongAlbum = (song: SongResult | null) => getSongAlbumLabel(song) || null;

/**
 * Loads the Tempera pool out of IndexedDB and inlines it as data URLs. The overlay is served
 * from the local OBS server, a different origin from the main window, so it has no copy of the
 * store those files live in - the blob has to travel inside the published config.
 */
const resolveTemperaLayerAssets = async (
    pool: TemperaLayerImage[] | undefined,
): Promise<{ id: string; name: string; url: string }[]> => {
    if (!pool || pool.length === 0) return [];
    const blobs = await loadTemperaLayerImageBlobs(pool);
    const assets = await Promise.all(pool.map(async image => {
        const blob = blobs.get(image.id);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        try {
            return { id: image.id, name: image.name, url: await resolveObsBrowserSourceCoverUrl(url) ?? url };
        } finally {
            URL.revokeObjectURL(url);
        }
    }));
    return assets.filter((asset): asset is { id: string; name: string; url: string } => asset !== null);
};

export const useObsBrowserSourcePublisher = ({
    isElectronWindow,
    stageSource,
    coverUrl,
    offsetMs,
    theme,
    subtitleTheme,
    hideTranslationSubtitle,
    seed,
    transport,
    isRearLyricsActive = false,
    isLiked = false,
    likeDisabled = false,
    bgMode,
    hasCustomTheme = false,
}: UseObsBrowserSourcePublisherOptions) => {
    const visualizerTunings = useVisualizerTunings();
    const backgroundConfig = useVisualizerBackgroundConfig();
    const transparentPlayerBackground = usePlayerChromeSettingsStore(state => state.transparentPlayerBackground);
    const enablePlayerPageNativeBlur = usePlayerChromeSettingsStore(state => state.enablePlayerPageNativeBlur);
    // The overlay is composited by OBS, so it always publishes the transparent variant when the
    // player page itself is transparent - there is no window chrome behind it to show through.
    const background = useMemo(() => ({
        ...backgroundConfig,
        transparent: transparentPlayerBackground || enablePlayerPageNativeBlur,
    }), [backgroundConfig, transparentPlayerBackground, enablePlayerPageNativeBlur]);

    // Read here rather than passed in. Every one of these is a store field or a module-level motion
    // signal, and App.tsx was naming 22 of them purely to forward them to this hook.
    const activePlaybackContext = usePlaybackStore(state => state.activePlaybackContext);
    const currentSong = usePlaybackStore(state => state.currentSong);
    const playQueue = usePlaybackStore(state => state.playQueue);
    const lyrics = usePlaybackStore(state => state.lyrics);
    const duration = usePlaybackStore(state => state.duration);
    const playerState = usePlaybackStore(state => state.playerState);
    const isDaylight = useThemeSettingsStore(state => state.isDaylight);
    const staticMode = useThemeSettingsStore(state => state.staticMode);
    const visualizerMode = useVisualizerSettingsStore(state => state.visualizerMode);
    const visualizerOpacity = useVisualizerSettingsStore(state => state.visualizerOpacity);
    const lyricsFontScale = useTypographySettingsStore(state => state.lyricsFontScale);
    // 背屏专用字号：和主屏的 lyricsFontScale 分开设置，随 config 一起下发，
    // 背屏页渲染时用它覆盖 lyricsFontScale（见 RearLyricsApp）。
    const rearLyricsFontScale = useTypographySettingsStore(state => state.rearLyricsFontScale);
    // 背屏「构图」微调表：每个 lyrics 效果一份 scale/offsetX，随 config 一起下发。
    const rearLyricsFrames = useTypographySettingsStore(state => state.rearLyricsFrames);
    // 背屏独立视觉覆盖：背景 / 歌词模式 / 字幕等所有「背屏歌词样式」里的改动都记在这里。
    // 它只随 config 下发，不参与主屏渲染，也不会被 OBS 浏览器源读取。
    const rearLyricsVisual = useRearLyricsVisualSettingsStore(state => state.override);
    const lyricsFontStyle = useTypographySettingsStore(state => state.lyricsFontStyle);
    const lyricsFontWeight = useTypographySettingsStore(state => state.lyricsFontWeight);
    const subtitleFontInheritsLyrics = useTypographySettingsStore(state => state.subtitleFontInheritsLyrics);
    const subtitleFontStyle = useTypographySettingsStore(state => state.subtitleFontStyle);
    const subtitleFontWeight = useTypographySettingsStore(state => state.subtitleFontWeight);
    const subtitleFontScale = useTypographySettingsStore(state => state.subtitleFontScale);
    const subtitleFontFamily = useTypographySettingsStore(state => state.subtitleFontFamily);
    const subtitleFontFallbackFamilies = useTypographySettingsStore(state => state.subtitleFontFallbackFamilies);
    const subtitleOverlayOpacity = useTypographySettingsStore(state => state.subtitleOverlayOpacity);
    const subtitleOverlayBackground = useTypographySettingsStore(state => state.subtitleOverlayBackground);
    const subtitleUpcomingLyricsBlur = useTypographySettingsStore(state => state.subtitleUpcomingLyricsBlur);
    const showHarmonySubtitle = useTypographySettingsStore(state => state.showHarmonySubtitle);
    const harmonySubtitleBackground = useTypographySettingsStore(state => state.harmonySubtitleBackground);
    const showSubtitleTranslation = useTypographySettingsStore(state => state.showSubtitleTranslation);
    const subtitleContentMode = useTypographySettingsStore(state => state.subtitleContentMode);
    // 只给背屏设置面板回显「播放即自动投屏」开关；OBS 源不读它。
    const rearLyricsAutoStart = useRearLyricsStore(state => state.autoStartOnPlayback);
    // 背屏「控制」页要回显的播放状态：音量 / 静音 / 循环 / 智能过渡。改这些的入口仍然在主屏，
    // 这里只负责把它们随 config 带给背屏，背屏那边是只读显示。
    const volume = useAudioSettingsStore(state => state.volume);
    const isMuted = useAudioSettingsStore(state => state.isMuted);
    const loopMode = useAudioSettingsStore(state => state.loopMode);
    const automixEnabled = useAutomixSettingsStore(state => state.automixEnabled);
    const audioQuality = useAudioSettingsStore(state => state.audioQuality);
    const cappellaCustomEmojiImages = useVisualizerAssetStore(state => state.cappellaCustomEmojiImages);
    const cappellaCustomAvatarImages = useVisualizerAssetStore(state => state.cappellaCustomAvatarImages);
    const monetPortraitImage = useVisualizerAssetStore(state => state.monetPortraitImage);

    // The pool rides in the tuning bundle that is already published; only the files are missing
    // on the overlay side, and those are resolved below.
    const temperaLayerImages = visualizerTunings?.tempera?.layerImages;
    const [status, setStatus] = useState<ObsBrowserSourceStatus>(() => emptyObsStatus());
    const [obsCoverUrl, setObsCoverUrl] = useState<string | null>(coverUrl);
    const [obsCustomImages, setObsCustomImages] = useState<{
        cappellaEmoji: CappellaEmojiImage[];
        cappellaAvatar: CappellaAvatarImage[];
        monetBackground: MonetBackgroundImage | null;
        monetPortrait: MonetPortraitImage | null;
        temperaLayer: { id: string; name: string; url: string }[];
    }>({ cappellaEmoji: [], cappellaAvatar: [], monetBackground: null, monetPortrait: null, temperaLayer: [] });
    const isExternallyRendering = status.enabled && status.clientCount > 0;
    // 背屏在线时也要发（它没有 Electron 状态可查，在线与否由原生事件告诉我们）。
    // 分开两个开关是刻意的：config 沿用原来的「开关打开就发」，而时钟与频谱仍然只在真有客户端
    // （OBS 连上了，或背屏页在线）时才推，避免空转。
    /*
     * 安卓上 config 始终推给原生缓存：即使这一刻背屏页还没 ready / active 状态漏了，
     * 原生也会把最新一份留着，页面 ready 时补推的就是当前设置。
     * 时钟/频谱仍然只在真的有客户端时推，避免空转。
     */
    const shouldPublishConfig = status.enabled || isRearLyricsActive || isCapacitorAndroid();
    const shouldPublishStream = isExternallyRendering || isRearLyricsActive;

    // Electron IPC 通道：OBS 浏览器源。非 Electron 环境下是 null。
    const electronTransport = useMemo<ObsBrowserSourcePublishTransport | null>(() => {
        if (!isElectronWindow) {
            return null;
        }
        const api = window.electron;
        if (!api?.publishObsBrowserSourceConfig || !api?.publishObsBrowserSourceClock || !api?.publishObsBrowserSourceAudio) {
            return null;
        }
        return {
            publishConfig: next => api.publishObsBrowserSourceConfig(next),
            publishClock: next => api.publishObsBrowserSourceClock(next),
            publishAudio: next => api.publishObsBrowserSourceAudio(next),
        };
    }, [isElectronWindow]);

    const publishTargets = useMemo(
        () => [electronTransport, transport].filter((target): target is ObsBrowserSourcePublishTransport => Boolean(target)),
        [electronTransport, transport],
    );
    const lastPublishedClockRef = useRef<ObsBrowserSourceClock | null>(null);
    const lastClockPublishMsRef = useRef(0);
    const configPublicationTrackerRef = useRef(new ObsBrowserSourceConfigPublicationTracker());
    // 背屏 ready / 恢复时请求一次强制重发；发布器平时按签名去重。
    const snapshotRequestId = useRearLyricsSyncStore(state => state.snapshotRequestId);

    const refreshStatus = useCallback(async () => {
        if (!isElectronWindow || !window.electron?.getObsBrowserSourceStatus) {
            setStatus(emptyObsStatus());
            return emptyObsStatus();
        }

        const nextStatus = await window.electron.getObsBrowserSourceStatus();
        setStatus(nextStatus);
        return nextStatus;
    }, [isElectronWindow]);

    useEffect(() => {
        void refreshStatus();
        return window.electron?.onObsBrowserSourceStatusChanged?.(nextStatus => {
            setStatus(nextStatus);
        });
    }, [refreshStatus]);

    useEffect(() => {
        let cancelled = false;

        if (!isObsBrowserSourceBlobCoverUrl(coverUrl)) {
            setObsCoverUrl(coverUrl);
            return () => {
                cancelled = true;
            };
        }

        setObsCoverUrl(null);
        void resolveObsBrowserSourceCoverUrl(coverUrl).then(nextCoverUrl => {
            if (!cancelled) {
                setObsCoverUrl(nextCoverUrl);
            }
        }).catch(error => {
            console.warn('[OBS] Failed to resolve blob cover for browser source', error);
            if (!cancelled) {
                setObsCoverUrl(null);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [coverUrl]);

    useEffect(() => {
        let cancelled = false;

        void Promise.all([
            resolveObsBrowserSourceImageAssets(cappellaCustomEmojiImages),
            resolveObsBrowserSourceImageAssets(cappellaCustomAvatarImages),
            background?.customImage ? resolveObsBrowserSourceImageAsset(background.customImage) : null,
            monetPortraitImage ? resolveObsBrowserSourceImageAsset(monetPortraitImage) : null,
            // Tempera keeps its pool in IndexedDB rather than in the store, so it is read here
            // and inlined; the overlay's origin has no copy of it.
            resolveTemperaLayerAssets(temperaLayerImages),
        ]).then(([cappellaEmoji, cappellaAvatar, monetBackground, monetPortrait, temperaLayer]) => {
            if (!cancelled) {
                setObsCustomImages({ cappellaEmoji, cappellaAvatar, monetBackground, monetPortrait, temperaLayer });
            }
        }).catch(error => {
            console.warn('[OBS] Failed to resolve custom images for browser source', error);
            if (!cancelled) {
                setObsCustomImages({
                    cappellaEmoji: [], cappellaAvatar: [], monetBackground: null, monetPortrait: null, temperaLayer: [],
                });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [background?.customImage, cappellaCustomAvatarImages, cappellaCustomEmojiImages, monetPortraitImage, temperaLayerImages]);

    const config = useMemo<ObsBrowserSourceConfig>(() => {
        const resolvedBackground = {
            ...background,
            customImage: obsCustomImages.monetBackground,
        };

        return {
            activePlaybackContext,
            stageSource,
            hasTrack: Boolean(currentSong || lyrics),
            song: currentSong ? { id: currentSong.id, name: currentSong.name } : null,
            songArtist: getSongArtist(currentSong),
            songAlbum: getSongAlbum(currentSong),
            coverUrl: obsCoverUrl,
            lyrics,
            theme,
            subtitleTheme,
            isDaylight,
            bgMode,
            hasCustomTheme,
            visualizerMode,
            visualizerTunings,
            background: resolvedBackground,
            ...buildLegacyObsBrowserSourceBackgroundConfig(resolvedBackground),
            lyricsFontScale,
            rearLyricsFontScale,
            rearLyricsFrames,
            rearLyricsVisual,
            lyricsFontStyle,
            lyricsFontWeight,
            rearLyricsAutoStart,
            volume,
            isMuted,
            loopMode,
            isLiked,
            likeDisabled,
            automixEnabled,
            audioQuality,
            queue: playQueue.map(song => ({
                id: song.id,
                name: song.name,
                artist: getSongArtistLabel(song),
                unavailable: isSongUnavailable(song),
            })),
            queueIndex: currentSong
                ? playQueue.findIndex(song => getPlaybackSongKey(song) === getPlaybackSongKey(currentSong))
                : -1,
            subtitleFontScale,
            subtitleFontStyle,
            subtitleFontWeight,
            subtitleFontFamily,
            subtitleFontFallbackFamilies,
            visualizerOpacity,
            subtitleOverlayOpacity,
            subtitleOverlayBackground,
            subtitleUpcomingLyricsBlur,
            showHarmonySubtitle,
            harmonySubtitleBackground,
            staticMode,
            hideTranslationSubtitle,
            showSubtitleTranslation,
            subtitleContentMode,
            subtitleFontInheritsLyrics,
            seed,
            cappellaCustomEmojiImages: obsCustomImages.cappellaEmoji,
            cappellaCustomAvatarImages: obsCustomImages.cappellaAvatar,
            monetPortraitImage: obsCustomImages.monetPortrait,
            temperaLayerImageAssets: obsCustomImages.temperaLayer,
            updatedAt: Date.now(),
        };
    }, [
        activePlaybackContext,
        background,
        currentSong,
        hideTranslationSubtitle,
        showSubtitleTranslation,
        subtitleContentMode,
        isDaylight,
        bgMode,
        hasCustomTheme,
        lyrics,
        lyricsFontScale,
        rearLyricsFontScale,
        rearLyricsFrames,
        rearLyricsVisual,
        lyricsFontStyle,
        lyricsFontWeight,
        rearLyricsAutoStart,
        volume,
        isMuted,
        loopMode,
        isLiked,
        likeDisabled,
        automixEnabled,
        audioQuality,
        playQueue,
        subtitleFontScale,
        subtitleFontStyle,
        subtitleFontWeight,
        subtitleFontFamily,
        subtitleFontFallbackFamilies,
        subtitleFontInheritsLyrics,
        obsCustomImages,
        obsCoverUrl,
        seed,
        stageSource,
        staticMode,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        subtitleUpcomingLyricsBlur,
        showHarmonySubtitle,
        harmonySubtitleBackground,
        theme,
        subtitleTheme,
        visualizerMode,
        visualizerTunings,
        visualizerOpacity,
    ]);

    const buildClock = useCallback((): ObsBrowserSourceClock => ({
        currentTime: currentTime.get(),
        duration,
        playerState,
        sentAtMs: Date.now(),
        playbackRate: 1,
        lyricOffsetMs: offsetMs,
    }), [currentTime, duration, playerState, offsetMs]);

    const buildAudio = useCallback((): ObsBrowserSourceAudio => ({
        audioPower: audioPower.get(),
        bands: {
            bass: audioBands.bass.get(),
            lowMid: audioBands.lowMid.get(),
            mid: audioBands.mid.get(),
            vocal: audioBands.vocal.get(),
            treble: audioBands.treble.get(),
        },
        spectrum: downsampleObsSpectrum(audioBands.spectrum?.get()),
        sentAtMs: Date.now(),
    }), [audioBands, audioPower]);

    const publishClock = useCallback(() => {
        if (publishTargets.length === 0) {
            return;
        }

        const nextClock = buildClock();
        lastPublishedClockRef.current = nextClock;
        lastClockPublishMsRef.current = nextClock.sentAtMs;
        void Promise.all(publishTargets.map(target => target.publishClock(nextClock))).catch(error => {
            console.warn('[OBS] Failed to publish browser source clock', error);
        });
    }, [buildClock, publishTargets]);

    /*
     * 配置发布串行化：同一时刻只允许一条 config 在飞，飞完再检查最新配置。
     *
     * <p>原来的实现遇到「上一次发布还没 resolve 又来一次改动」会直接跳过第二次，
     * 而 markPublished 记的是第一次的签名；第二次改动于是永远发不出去。
     * 背屏调试时拖滑杆正好是这种高频改动，表现就是「设置了背屏没生效」。
     */
    const latestConfigRef = useRef(config);
    latestConfigRef.current = config;
    const shouldPublishConfigRef = useRef(shouldPublishConfig);
    shouldPublishConfigRef.current = shouldPublishConfig;
    const configPublishingRef = useRef(false);

    const publishLatestConfig = useCallback(async () => {
        if (configPublishingRef.current || publishTargets.length === 0) {
            return;
        }
        configPublishingRef.current = true;
        const tracker = configPublicationTrackerRef.current;
        try {
            for (;;) {
                if (!shouldPublishConfigRef.current) {
                    break;
                }
                const latest = latestConfigRef.current;
                const publication = tracker.prepare(true, latest);
                if (!publication) {
                    break;
                }
                try {
                    await Promise.all(publishTargets.map(target => target.publishConfig(publication.config)));
                    tracker.markPublished(publication.signature);
                } catch (error) {
                    tracker.markFailed(publication.signature);
                    console.warn('[OBS] Failed to publish browser source config', error);
                    break;
                }
                // 发布期间用户可能又改了设置；签名不同就继续发最新的一份。
                if (buildObsBrowserSourceConfigSignature(latestConfigRef.current) === publication.signature) {
                    break;
                }
            }
        } finally {
            configPublishingRef.current = false;
        }
    }, [publishTargets]);

    useEffect(() => {
        const tracker = configPublicationTrackerRef.current;
        if (!shouldPublishConfig || publishTargets.length === 0) {
            tracker.reset();
            return;
        }
        void publishLatestConfig();
    }, [config, shouldPublishConfig, publishTargets, publishLatestConfig]);

    /*
     * 背屏页 ready / 从后台恢复：清掉发布器的去重状态，强制再发一份当前 config。
     * 没有这一步时，主屏设置没变、但背屏重载拿到旧缓存的情况下永远不会再推。
     */
    const lastSnapshotRequestRef = useRef(snapshotRequestId);
    useEffect(() => {
        if (snapshotRequestId === lastSnapshotRequestRef.current) {
            return;
        }
        lastSnapshotRequestRef.current = snapshotRequestId;
        if (!shouldPublishConfigRef.current || publishTargets.length === 0) {
            return;
        }
        configPublicationTrackerRef.current.reset();
        void publishLatestConfig();
    }, [snapshotRequestId, publishTargets, publishLatestConfig]);

    useEffect(() => {
        if (!shouldPublishStream || publishTargets.length === 0) {
            return;
        }

        publishClock();
        const intervalId = window.setInterval(publishClock, OBS_CLOCK_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, [shouldPublishStream, publishTargets, publishClock]);

    useEffect(() => {
        if (!shouldPublishStream) {
            return;
        }

        // Detect seek-like jumps without turning the playback clock into per-frame IPC traffic.
        return currentTime.on('change', (nextTime) => {
            const lastClock = lastPublishedClockRef.current;
            if (!lastClock) {
                return;
            }

            const nowMs = Date.now();
            if (nowMs - lastClockPublishMsRef.current < OBS_CLOCK_JUMP_MIN_INTERVAL_MS) {
                return;
            }

            const expectedTime = resolveObsBrowserSourceClockTime(lastClock, nowMs);
            if (Math.abs(nextTime - expectedTime) >= OBS_CLOCK_JUMP_THRESHOLD_SEC) {
                publishClock();
            }
        });
    }, [currentTime, shouldPublishStream, publishClock]);

    useEffect(() => {
        if (!shouldPublishStream || publishTargets.length === 0) {
            return;
        }

        const publishAudio = () => {
            void Promise.all(publishTargets.map(target => target.publishAudio(buildAudio()))).catch(error => {
                console.warn('[OBS] Failed to publish browser source audio', error);
            });
        };

        publishAudio();
        const intervalId = window.setInterval(publishAudio, OBS_AUDIO_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, [buildAudio, shouldPublishStream, publishTargets]);

    return {
        obsBrowserSourceStatus: status,
        isObsBrowserSourceRendering: isExternallyRendering,
        refreshObsBrowserSourceStatus: refreshStatus,
    };
};
