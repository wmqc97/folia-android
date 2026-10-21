import type {
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
    MonetBackgroundTuning,
    MonetPortraitImage,
    PlayerState,
    SongResult,
    StageSource,
    SubtitleContentMode,
    Theme,
    ThemeMode,
    UrlBackgroundItem,
    VisualizerBackgroundMode,
    VisualizerMode,
} from '../types';
import type { VisualizerTuningBundle } from '../components/visualizer/tuningRegistry';
import type { VisualizerBackgroundConfig } from '../components/visualizer/backgrounds/definition';
import type { AudioQualityPreference } from './onlineMusic';

// src/types/obsBrowserSource.ts
// Shared contracts for the local OBS browser source renderer.

export interface ObsBrowserSourceStatus {
    enabled: boolean;
    port: number;
    token: string | null;
    url: string | null;
    clientCount: number;
}

/**
 * 背屏「播放列表」页要渲染的一行。
 *
 * 只带渲染需要的字段：完整的 SongResult 体积大、还带着 provider 私有字段，
 * 而背屏只是把队列画出来，真正操作队列的仍然是主屏。所以列表内容照这个样子
 * 精简后随 config 一起下发。
 */
export interface ObsBrowserSourceQueueItem {
    id: SongResult['id'];
    name: string;
    artist: string;
    /** 当前音源不可播放（与主屏 QueueTab 上那个角标同义）。 */
    unavailable: boolean;
}

/**
 * 背屏视觉覆盖。字段全部可选，缺省表示跟随主屏。
 *
 * <p>背屏不需要复制一份主屏视觉 store，只记「和主屏不一样的那几项」，发布时深合并到主屏
 * config 上。显式 null 是有效值（例如字重 null = 跟随效果默认、URL 背景 selectedId null =
 * 未选中），所以消费方要用「字段是否存在」判断，不能把 null 当缺省丢掉。
 */
export interface RearLyricsVisualOverride {
    visualizerMode?: VisualizerMode;
    visualizerOpacity?: number;
    visualizerTunings?: VisualizerTuningBundle;
    background?: VisualizerBackgroundConfig;
    lyricsFontStyle?: Theme['fontStyle'];
    lyricsFontWeight?: number | null;
    lyricsFontFallbackFamilies?: string[];
    lyricsCustomFontFamily?: string | null;
    hideTranslationSubtitle?: boolean;
    showSubtitleTranslation?: boolean;
    subtitleContentMode?: SubtitleContentMode;
    subtitleOverlayOpacity?: number;
    subtitleOverlayBackground?: boolean;
    subtitleUpcomingLyricsBlur?: boolean;
    showHarmonySubtitle?: boolean;
    harmonySubtitleBackground?: boolean;
    subtitleFontInheritsLyrics?: boolean;
    subtitleFontScale?: number;
    subtitleFontStyle?: Theme['fontStyle'];
    subtitleFontWeight?: number | null;
    subtitleFontFamily?: string | null;
    subtitleFontFallbackFamilies?: string[];
    staticMode?: boolean;
}

export interface ObsBrowserSourceConfig {
    activePlaybackContext: 'main' | 'stage';
    stageSource: StageSource | null;
    hasTrack: boolean;
    song: Pick<SongResult, 'id' | 'name'> | null;
    songArtist: string | null;
    songAlbum: string | null;
    coverUrl: string | null;
    lyrics: LyricData | null;
    theme: Theme;
    subtitleTheme?: Theme;
    isDaylight: boolean;
    bgMode?: ThemeMode;
    hasCustomTheme?: boolean;
    visualizerMode: VisualizerMode;
    visualizerTunings?: VisualizerTuningBundle;
    background?: VisualizerBackgroundConfig;
    /** @deprecated Kept for OBS pages loaded before the background registry refactor. */
    visualizerBackgroundMode?: VisualizerBackgroundMode | null;
    /** @deprecated Kept for OBS pages loaded before the background registry refactor. */
    backgroundOpacity?: number;
    /** @deprecated Kept for OBS pages loaded before the background registry refactor. */
    transparentBackground?: boolean;
    /** @deprecated Kept for OBS pages loaded before the background registry refactor. */
    useCoverColorBg?: boolean;
    /** @deprecated Kept for OBS pages loaded before the background registry refactor. */
    disableGeometricBackground?: boolean;
    /** @deprecated Kept for OBS pages loaded before the background registry refactor. */
    disableVignette?: boolean;
    /** @deprecated Kept for OBS pages loaded before the background registry refactor. */
    monetBackgroundTuning?: MonetBackgroundTuning;
    /** @deprecated Kept for OBS pages loaded before the background registry refactor. */
    monetBackgroundImage?: MonetBackgroundImage | null;
    /** @deprecated Kept for OBS pages loaded before the background registry refactor. */
    urlBackgroundList?: UrlBackgroundItem[];
    /** @deprecated Kept for OBS pages loaded before the background registry refactor. */
    urlBackgroundSelectedId?: string | null;
    lyricsFontScale: number;
    // 背屏专用字号。背屏页渲染时用它覆盖 lyricsFontScale；OBS 浏览器源不读这个字段，
    // 所以主屏的字号不会因为背屏设置而变。缺省时背屏回落到 lyricsFontScale。
    rearLyricsFontScale?: number;
    // 背屏「构图」微调表：visualizer 模式名 -> { scale, offsetX }。
    // 背屏可见区比整块画布窄得多，各效果按大屏设计的构图在这块小屏上不是压到摄像头底下
    // 就是溢出屏幕，所以每个效果单独记一份缩放与中心偏移。缺省 / 空表表示全部按出厂构图。
    // fontScale 是该效果专属的字号倍率，和背屏全局字号叠乘，缺省按 1 处理。
    rearLyricsFrames?: Record<string, {
        /** 歌词画布左边界（CSS px）。 */
        canvasX?: number;
        /** 歌词画布上边界（CSS px）。 */
        canvasY?: number;
        /** 画布内渲染中心相对歌词画布中心的水平偏移。 */
        centerOffsetX?: number;
        /** 画布内渲染中心相对歌词画布中心的垂直偏移。 */
        centerOffsetY?: number;
        /** 该效果专属字号倍率。 */
        fontScale?: number;
        /** 效果缩放倍率（1 = 正好铺满歌词画布）。 */
        effectScaleX?: number;
        effectScaleY?: number;
    }>;
    /**
     * 背屏歌词显示区域的左侧避让宽度（CSS px）。null / 缺省 = 跟随原生实测的摄像头竖带宽度。
     *
     * <p><b>已废弃，不再参与歌词排版。</b>左侧规避改成每个样式自己的 canvasX
     * （见 rearLyricsFrames）。这个字段只为兼容旧配置保留：背屏页读到时忽略，
     * 控制条 / 面板仍用原生实测的摄像头宽度定位。
     */
    rearLyricsSafeLeftCss?: number | null;
    // 背屏独立视觉覆盖。背屏页把它深合并到主屏 config 上再渲染；缺省 / 空对象表示完全跟随主屏。
    // 它和 rearLyricsFontScale / rearLyricsFrames 是同一类背屏专用字段，只是覆盖面更广。
    rearLyricsVisual?: RearLyricsVisualOverride;
    // 背屏设置面板要显示主屏歌词的字体样式 / 字重，才能和主屏「歌词效果 - 通用」页签一致。
    // 都是可选：老的 OBS 页面收到的 config 里没有这两个字段，渲染时按默认值处理。
    lyricsFontStyle?: Theme['fontStyle'];
    lyricsFontWeight?: number | null;
    // 同上，字幕（底部翻译行）的字体样式 / 字重，给背屏「字幕」页签回显用。
    subtitleFontStyle?: Theme['fontStyle'];
    subtitleFontWeight?: number | null;
    // 「播放歌曲就自动投到背屏」开关的当前值，只给背屏设置面板回显用。
    rearLyricsAutoStart?: boolean;
    // 背屏「控制」页的回显：音量 / 静音 / 循环 / 喜爱 / 智能过渡。
    // 这些是播放状态而不是视觉设置，所以主屏只把它们随 config 带下来做「显示」，改动仍然发指令回去。
    // 全是可选：老主屏推来的 config 里没有这些字段，背屏按默认值渲染。
    volume?: number;
    isMuted?: boolean;
    loopMode?: 'off' | 'all' | 'one';
    isLiked?: boolean;
    /** 「喜爱」当前不可用（Stage 播放 / 该音源不支持收藏），与主屏那份判断同一个来源。 */
    likeDisabled?: boolean;
    automixEnabled?: boolean;
    audioQuality?: AudioQualityPreference;
    // 播放队列的精简版（背屏「播放列表」页用）。可选：老版本推来的 config 没有这个字段，
    // 背屏按空列表渲染。
    queue?: ObsBrowserSourceQueueItem[];
    // 当前歌曲在 queue 里的下标；-1 / 缺省表示当前歌曲不在队列里。用来高亮正在播的那一行。
    queueIndex?: number;
    // Optional like the other late additions below: an OBS page kept open across a Folia update may
    // still be fed by (or feeding) a build that predates the field, so the renderer defaults instead
    // of rendering at scale 0. The publisher always sends it.
    subtitleFontScale?: number;
    visualizerOpacity: number;
    subtitleOverlayOpacity: number;
    subtitleOverlayBackground?: boolean;
    subtitleUpcomingLyricsBlur?: boolean;
    // Harmony (background-vocal) subtitles default to on in both the store and the overlay, so a
    // config that omits these must read as "on" rather than silently hiding a layer the main window
    // shows.
    showHarmonySubtitle?: boolean;
    harmonySubtitleBackground?: boolean;
    staticMode: boolean;
    hideTranslationSubtitle: boolean;
    showSubtitleTranslation?: boolean;
    subtitleContentMode?: SubtitleContentMode;
    subtitleFontInheritsLyrics?: boolean;
    seed: string | number;
    cappellaCustomEmojiImages?: CappellaEmojiImage[];
    cappellaCustomAvatarImages?: CappellaAvatarImage[];
    monetPortraitImage?: MonetPortraitImage | null;
    /**
     * Tempera's canvas image pool, inlined as data URLs. The overlay is served from the local
     * OBS server and is therefore a different origin from the main window, so it cannot read
     * the IndexedDB these files actually live in.
     */
    temperaLayerImageAssets?: { id: string; name: string; url: string }[];
    updatedAt: number;
}

export interface ObsBrowserSourceClock {
    currentTime: number;
    duration: number;
    playerState: PlayerState;
    sentAtMs: number;
    playbackRate: number;
    lyricOffsetMs?: number;
}

export interface ObsBrowserSourceAudio {
    audioPower: number;
    bands: {
        bass: number;
        lowMid: number;
        mid: number;
        vocal: number;
        treble: number;
    };
    spectrum: number[];
    sentAtMs: number;
}

export type ObsBrowserSourceEvent =
    | { type: 'config'; payload: ObsBrowserSourceConfig }
    | { type: 'clock'; payload: ObsBrowserSourceClock }
    | { type: 'audio'; payload: ObsBrowserSourceAudio };
