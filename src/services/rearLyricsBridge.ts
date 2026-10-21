// src/services/rearLyricsBridge.ts
// 背屏歌词页（?rear=1）与原生宿主之间的数据通道。
//
// 背屏页跑在 RearLyricsActivity 自己的 WebView 里，和主界面不是同一个 JS 上下文，
// 所以拿不到主界面的内存状态。数据只能走原生：
//   主屏 WebView --Capacitor RearProjection 插件--> 原生 --evaluateJavascript--> 背屏 WebView
//   背屏 WebView --@JavascriptInterface FoliaRear--> 原生 --Capacitor 事件--> 主屏 WebView
// 推下来的三种数据流与 OBS 源完全同构（config / clock / audio），这样背屏能直接复用
// VisualizerRenderer 与 OBS 那套时钟外推逻辑。

import type {
    ObsBrowserSourceAudio,
    ObsBrowserSourceClock,
    ObsBrowserSourceConfig,
} from '../types/obsBrowserSource';
import type {
    SubtitleContentMode,
    Theme,
    UrlBackgroundItem,
    VisualizerBackgroundMode,
} from '../types';
import type { AudioQualityPreference } from '../types/onlineMusic';

/** 原生推给背屏页的三种数据流。 */
export type RearLyricsPushKind = 'config' | 'clock' | 'audio';

/** 三种数据流各自对应的载荷类型。 */
export interface RearLyricsPushPayloadMap {
    config: ObsBrowserSourceConfig;
    clock: ObsBrowserSourceClock;
    audio: ObsBrowserSourceAudio;
}

/** 背屏页发给原生、由原生转交主屏的指令。主屏是唯一真源，背屏只发意图。 */
export type RearLyricsCommand =
    | { type: 'next' }
    | { type: 'prev' }
    | { type: 'togglePlay' }
    | { type: 'seek'; time: number }
    | { type: 'setVisualizerMode'; mode: string }
    | { type: 'stepVisualizerMode'; delta: 1 | -1 }
    | { type: 'setLyricsFontScale'; value: number }
    | { type: 'applySettings'; patch: RearLyricsSettingsPatch }
    // 背屏页 ready / 恢复时请求主屏重发一份当前 config（绕过发布器的去重）。
    | { type: 'requestSnapshot' }
    // 背屏「控制」页（音量 / 静音 / 循环 / 喜爱 / 智能过渡）。
    // 这一组是播放状态而不是视觉设置，所以走独立指令、不进 applySettings 补丁：
    // previewVolume 只改输出增益（拖动中每帧发，不写 store 也不落本地存储），
    // setVolume 才是拖动落定的那一次提交，和主屏 VolumeRow 的「预览 + 提交」同一套语义。
    | { type: 'previewVolume'; value: number }
    | { type: 'setVolume'; value: number }
    | { type: 'toggleMute' }
    | { type: 'toggleLoopMode' }
    | { type: 'setLoopMode'; mode: 'off' | 'all' | 'one' }
    | { type: 'toggleLike' }
    | { type: 'toggleAutomix' }
    | { type: 'openAudioEqualizer' }
    | { type: 'openVisualizerSettings' }
    | { type: 'openBackgroundSettings' }
    // 背屏「歌词样式」入口：在主屏打开「背屏歌词样式」专属页，逐个效果调边界与字号。
    | { type: 'openRearLyricsStyleSettings' }
    | { type: 'setBackgroundMode'; mode: VisualizerBackgroundMode }
    | { type: 'setTheme'; theme: Theme }
    // 播放列表页（背屏面板的「列表」页签）：
    // 队列本体始终在 config 里跟着推送走（只读回显），操作则一律按下标发回主屏，
    // 由主屏拿自己那份 playQueue 解析。背屏不持有队列副本，避免两份队列对不上。
    | { type: 'playQueueIndex'; index: number }
    | { type: 'removeQueueSong'; index: number }
    | { type: 'moveQueueSongToNext'; index: number }
    | { type: 'moveQueueSongToEnd'; index: number }
    | { type: 'shuffleQueue' }
    | { type: 'exit' };

/**
 * 背屏设置面板一次性提交的设置补丁。
 *
 * <p>背屏面板就是主屏「歌词效果」的背屏版，可调的项有几十个。如果每项都开一个
 * command，桥这边会长成一个巨大的 switch，改一项设置要动三个文件。所以这里只开一条
 * {@code applySettings}，用「字段名 = 值」的补丁描述改动，主屏按字段落到对应 store 的 handler 上。
 *
 * <p>字段缺省表示「本次不改」，所以背屏不必先知道主屏的全部值再回写。
 * 各模式的 tuning 也是同一思路：{@code tuningPatch} 只带模式名和要合并的那几个参数。
 *
 * <p>构图微调（{@code rearLyricsFrame}）同理：背屏面板上每个效果一行 scale / offsetX，
 * 改哪个模式就带哪个模式名，不必把整张表传来传去。
 */
export interface RearLyricsSettingsPatch {
    /** 背屏专用歌词字号；写的是 rear 字段，不影响主屏字号。 */
    rearLyricsFontScale?: number;
    /**
     * 背屏「构图」：某个 visualizer 模式的歌词画布起点、画布内渲染中心、字号与效果缩放。
     * mode 是 visualizer 模式名；缺省字段表示「本次不改这一项」。
     */
    rearLyricsFrame?: {
        mode: string;
        canvasX?: number;
        canvasY?: number;
        centerOffsetX?: number;
        centerOffsetY?: number;
        fontScale?: number;
        effectScaleX?: number;
        effectScaleY?: number;
    };
    /** 某个 visualizer 模式回到出厂构图。 */
    resetRearLyricsFrame?: string;
    /** 歌词字体样式 / 字重（null = 跟随主题）。 */
    lyricsFontStyle?: Theme['fontStyle'];
    lyricsFontWeight?: number | null;
    /** 歌词效果模式与整体不透明度。 */
    visualizerMode?: string;
    visualizerOpacity?: number;
    /** 背景模式与它那几个通用开关。 */
    backgroundMode?: VisualizerBackgroundMode;
    backgroundOpacity?: number;
    useCoverColorBg?: boolean;
    disableVignette?: boolean;
    disableGeometricBackground?: boolean;
    /** 歌词模式 tuning：合并到该模式的 tuning 上（mode = visualizer 模式名）。 */
    tuningPatch?: { mode: string; patch: Record<string, unknown> };
    /** 歌词模式 tuning 还原出厂（mode = visualizer 模式名）。 */
    resetTuning?: string;
    /** 背景模式的 tuning 合并 / 还原（mode = 背景模式名）。 */
    backgroundTuningPatch?: { mode: string; patch: Record<string, unknown> };
    resetBackgroundTuning?: string;
    /** URL 背景列表；item.id 由主屏的 sanitize 逻辑补齐。 */
    urlBackgroundAdd?: UrlBackgroundItem;
    urlBackgroundUpdate?: { id: string; patch: Partial<Omit<UrlBackgroundItem, 'id'>> };
    urlBackgroundDelete?: string;
    urlBackgroundSelectedId?: string | null;
    /** 字幕页（完全复用主屏控件）。 */
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
    resetSubtitleSettings?: boolean;
    /** 控制页（复用主屏控制页签）。 */
    toggleLoopMode?: boolean;
    toggleLike?: boolean;
    toggleMute?: boolean;
    generateAiTheme?: boolean;
    themeSource?: 'default' | 'ai' | 'custom';
    toggleDaylight?: boolean;
    /** 上传类资源当前无法跨背屏桥接，仅清除已有资源。 */
    clearCappellaCustomEmojiPack?: boolean;
    clearCappellaCustomAvatar?: boolean;
    clearMonetPortraitImage?: boolean;
    audioQuality?: AudioQualityPreference;
    /** 「播放歌曲就自动投到背屏」开关。 */
    autoStartOnPlayback?: boolean;
    /**
     * 「通用」页卡头那个「默认」还原：字体样式 / 字重 / 整体透明度 / 背屏字号回到默认。
     *
     * <p>和主屏那页的还原同义，只是字号进的是背屏专用字段。
     */
    resetCommonSettings?: boolean;
}

/**
 * 原生注入到背屏 WebView 的宿主对象（{@code addJavascriptInterface(obj, "FoliaRear")}）。
 *
 * <p>方法体在 JavaBridge 线程执行，原生侧必须自己切回主线程再碰 WebView。
 */
export interface RearLyricsNativeHost {
    /** 页面 JS 已就绪，可以开始收推送。 */
    ready: () => void;
    /** 请求一份当前快照（主屏收到后立刻重推一次 config）。 */
    requestSnapshot: () => void;
    /** 发送指令，参数是 JSON 字符串。 */
    send: (json: string) => void;
    /** 写原生日志，方便用 logcat 排查背屏问题。 */
    log: (message: string) => void;
}

/** 背屏页暴露给原生的入口，原生用 evaluateJavascript 调 window.__foliaRear.push。 */
export interface RearLyricsPushTarget {
    push: (kind: RearLyricsPushKind, json: string) => void;
}

declare global {
    interface Window {
        FoliaRear?: RearLyricsNativeHost;
        __foliaRear?: RearLyricsPushTarget;
    }
}

/** 是否运行在原生背屏 WebView 里（而不是浏览器里直接打开 ?rear=1）。 */
export const hasRearLyricsNativeHost = (): boolean => (
    typeof window !== 'undefined' && Boolean(window.FoliaRear)
);

/** 注册推送入口。必须在 ready() 之前调用，否则原生第一帧的推送会丢掉。 */
export const installRearLyricsPushTarget = (
    handler: (kind: RearLyricsPushKind, json: string) => void,
): (() => void) => {
    if (typeof window === 'undefined') {
        return () => undefined;
    }
    window.__foliaRear = { push: handler };
    return () => {
        if (window.__foliaRear?.push === handler) {
            delete window.__foliaRear;
        }
    };
};

export const notifyRearLyricsReady = (): void => {
    window.FoliaRear?.ready();
};

export const requestRearLyricsSnapshot = (): void => {
    window.FoliaRear?.requestSnapshot();
};

export const sendRearLyricsCommand = (command: RearLyricsCommand): void => {
    window.FoliaRear?.send(JSON.stringify(command));
};

export const logRearLyrics = (message: string): void => {
    window.FoliaRear?.log(message);
};

/**
 * 背屏左侧摄像头安全带在页面里的默认宽度（CSS px），原生参数缺失时兜底。
 *
 * <p>277 / 976 × 347 ≈ 98.5，取整 98。系统 cutout 报的是 296（≈105），
 * 多出的 19 物理像素是镜头圈；这里跟硬件硬边缘，尽量把可见宽度留给歌词。
 */
export const DEFAULT_REAR_SAFE_LEFT_CSS = 98;

/**
 * 把原生传进来的物理像素安全带换算成 CSS px。
 *
 * <p>直接用 devicePixelRatio 换算在背屏上不可靠（WebView 的视口缩放会变），
 * 所以优先用「安全带物理宽度 × CSS 视口宽 / 屏幕物理宽」这个比值算，取不到再退 dpr。
 */
export const resolveRearSafeLeftCss = (): number => {
    if (typeof window === 'undefined') {
        return DEFAULT_REAR_SAFE_LEFT_CSS;
    }
    const params = new URLSearchParams(window.location.search);
    const safeLeftPx = Number(params.get('safeLeftPx')) || 0;
    const physicalWidthPx = Number(params.get('physicalWidthPx')) || 0;
    const viewportWidth = window.innerWidth || 0;
    if (safeLeftPx > 0 && physicalWidthPx > 0 && viewportWidth > 0) {
        return Math.round((safeLeftPx * viewportWidth) / physicalWidthPx);
    }
    if (safeLeftPx > 0) {
        const dpr = window.devicePixelRatio || 1;
        return Math.round(safeLeftPx / dpr);
    }
    return DEFAULT_REAR_SAFE_LEFT_CSS;
};

/** 背屏屏幕圆角换算成 CSS px；系统未上报时回落 20px。 */
export const resolveRearCornerRadiusCss = (): number => {
    if (typeof window === 'undefined') {
        return 25;
    }
    const params = new URLSearchParams(window.location.search);
    const cornerRadiusPx = Number(params.get('cornerRadiusPx')) || 0;
    const physicalWidthPx = Number(params.get('physicalWidthPx')) || 0;
    const viewportWidth = window.innerWidth || 0;
    if (cornerRadiusPx > 0 && physicalWidthPx > 0 && viewportWidth > 0) {
        return Math.max(0, Math.round((cornerRadiusPx * viewportWidth) / physicalWidthPx));
    }
    if (cornerRadiusPx > 0) {
        const dpr = window.devicePixelRatio || 1;
        return Math.max(0, Math.round(cornerRadiusPx / dpr));
    }
    return 25;
};
