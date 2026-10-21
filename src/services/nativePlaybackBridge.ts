import { PlayerState } from '../types';
import type { SongResult } from '../types';
import { currentTime } from '../stores/motionSignals';
import { getSongCoverUrl } from './onlineMusic/songMetadata';
import {
  selectDisplayDuration,
  selectDisplayPlayerState,
  selectDisplaySong,
  usePlaybackStore,
} from '../stores/usePlaybackStore';

type NativePlaybackPlugin = {
  updatePlaybackState: (state: Record<string, unknown>) => Promise<unknown>;
  clearPlaybackState: () => Promise<unknown>;
  addListener: (
    eventName: string,
    listener: (event: { action?: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
};

let installed = false;

/** 上一次真正推给原生的内容，用于跳过没有变化的推送。 */
let lastPushedKey = '';
let lastPushedTitle = '';
let lastPushedArtist = '';
let lastPushedAlbum = '';
let lastPushedCoverUrl = '';

/**
 * 推给原生媒体会话的内容摘要。
 *
 * 播放位置刻意不在内：进度由原生自己按 1 秒外推，跟着 position 走会把
 * 每一秒都变成一次全量推送。歌词行、可视化状态这类高频 store 变更也进不了摘要，
 * 所以订阅回调里绝大多数调用会在这里被挡掉。
 */
const buildPushKey = (state: ReturnType<typeof usePlaybackStore.getState>): string => {
  const song = selectDisplaySong(state);
  if (!song) return 'none';
  return [
    song.id,
    song.name || '',
    song.artists?.map((artist) => artist.name).filter(Boolean).join(' / ') || '',
    song.album?.name || '',
    song.album?.coverUrl || '',
    selectDisplayDuration(state),
    selectDisplayPlayerState(state),
  ].join('|');
};

/**
 * 解析要送给原生媒体通知的封面地址。
 *
 * 原生侧（FoliaPlaybackService）只认得 http(s)，本地封面（folia-cover://、/__folia_cover/、
 * blob:）会被它转交 WebView 解码成位图，所以这里原样传出即可。
 * 优先取专辑封面，其次走 provider 元数据——本地歌曲的封面挂在 localCoverAssetId 派生的
 * 资源上，只有 getSongCoverUrl 才拿得到。
 */
export const resolveNativeCoverUrl = (song: SongResult): string => {
  const albumCover = song.album?.coverUrl;
  if (albumCover && isDirectlyFetchableCoverUrl(albumCover)) return albumCover;
  const providerCover = getSongCoverUrl(song) ?? '';
  if (isDirectlyFetchableCoverUrl(providerCover)) return providerCover;
  return albumCover || providerCover || '';
};

/** 只有 http(s) 能被原生 OkHttp 直接拉取，其余都要交给 WebView 解码。 */
const isDirectlyFetchableCoverUrl = (url: string | null | undefined): url is string => (
  typeof url === 'string' && /^https?:\/\//i.test(url)
);

const pushState = (plugin: NativePlaybackPlugin) => {
  const state = usePlaybackStore.getState();
  const pushKey = buildPushKey(state);
  // 只有「通知上看得见的内容」变了才推。进度类字段每秒由 interval 单独推进，
  // 在这里重复推送会让原生反复重发 MediaSession 元数据、重下封面。
  if (pushKey !== lastPushedKey) {
    lastPushedKey = pushKey;
  } else {
    return;
  }
  const song = selectDisplaySong(state);
  if (!song) {
    void plugin.clearPlaybackState().catch(() => undefined);
    return;
  }
  const playerState = selectDisplayPlayerState(state);
  const playing = playerState === PlayerState.PLAYING;
  const coverUrl = resolveNativeCoverUrl(song);
  // 记住这次发出去的元数据：进度推送要原样带回，否则原生会以为换了首歌。
  lastPushedTitle = song.name || 'Unknown Song';
  lastPushedArtist = song.artists?.map((artist) => artist.name).filter(Boolean).join(' / ') || '';
  lastPushedAlbum = song.album?.name || '';
  lastPushedCoverUrl = coverUrl;
  void plugin.updatePlaybackState({
    title: song.name || 'Unknown Song',
    artist: song.artists?.map((artist) => artist.name).filter(Boolean).join(' / ') || '',
    album: song.album?.name || '',
    coverUrl,
    playing,
    position: Math.max(0, Math.round(currentTime.get() * 1000)),
    duration: Math.max(0, Math.round(selectDisplayDuration(state) * 1000)),
  }).catch(() => undefined);
};

/**
 * 只推进度，不动元数据。
 *
 * 原生侧会按自己上一次收到的位置加时间外推，但拖动进度、seek、缓冲卡顿都会让外推偏离，
 * 所以这里每秒把真实位置发一次，把通知进度条与剩余时间拨回正确值。
 */
const pushProgress = (
  plugin: NativePlaybackPlugin,
  state: ReturnType<typeof usePlaybackStore.getState>,
) => {
  // 播放态必须跟着真实状态走：写死 true 会让前端每次暂停后最多一秒就被原生侧
  // 改回 STATE_PLAYING（通知按钮、锁屏和媒体控制都据此判断该发 pause 还是 play），
  // 表现为「系统媒体控制暂停不了」。
  const playing = selectDisplayPlayerState(state) === PlayerState.PLAYING;
  void plugin.updatePlaybackState({
    title: lastPushedTitle,
    artist: lastPushedArtist,
    album: lastPushedAlbum,
    coverUrl: lastPushedCoverUrl,
    playing,
    position: Math.max(0, Math.round(currentTime.get() * 1000)),
    duration: Math.max(0, Math.round(selectDisplayDuration(state) * 1000)),
  }).catch(() => undefined);
};

export const installNativePlaybackBridge = async (
  plugin: NativePlaybackPlugin,
): Promise<void> => {
  if (installed) return;
  installed = true;

  try {
    await plugin.addListener('mediaAction', ({ action }) => {
      if (!action) return;
      window.dispatchEvent(new CustomEvent('folia-native-media-action', {
        detail: { action },
      }));
    });
  } catch (error) {
    console.warn('[FoliaNativePlayback] Failed to listen for media actions', error);
  }

  usePlaybackStore.subscribe(() => pushState(plugin));
  window.setInterval(() => {
    const state = usePlaybackStore.getState();
    if (selectDisplayPlayerState(state) === PlayerState.PLAYING) {
      pushProgress(plugin, state);
    }
  }, 1000);
  pushState(plugin);
};
