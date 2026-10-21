package top.izuna.foliamajor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.text.TextUtils;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.annotation.Nullable;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

public class FoliaPlaybackService extends Service {
    private static final String TAG = "FoliaPlaybackService";
    private static final String CHANNEL_ID = "folia_playback";
    private static final int NOTIFICATION_ID = 31009;
    /** 会话 tag：与 KeepAliveService 曾经的 tag 相同，但那个服务已不再持有会话。 */
    private static final String SESSION_TAG = "FoliaPlayback";
    /** 通知进度条 / 时间戳用的更新间隔，1 秒足够，避免每帧重绘通知。 */
    private static final long PROGRESS_TICK_MS = 1000L;
    /** 封面位图上限：媒体通知与锁屏只用小图，按 512 裁切既清晰又不爆 binder。 */
    private static final int ARTWORK_TARGET_SIZE = 512;

    private MediaSession mediaSession;
    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();
    private final OkHttpClient artworkClient = new OkHttpClient();
    private final Map<String, Bitmap> artworkCache = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    /** 前端当前声明的封面来源（可能是 http(s)、blob:、data: 或本地 cover 路径）。 */
    private volatile String currentArtworkUrl = "";
    /** 已经送进 MediaSession 的封面来源，用于跳过重复下载。 */
    private volatile String appliedArtworkUrl = "";
    private volatile Bitmap appliedArtworkBitmap = null;
    private volatile String lastRequestedCoverUrl = "";
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private static volatile String powerDiagnostic = "inactive";

    /** 最近一次发布的元数据，进度刷新时直接复用，不必重新拼装。 */
    private volatile String lastTitle = "";
    private volatile String lastArtist = "";
    private volatile String lastAlbum = "";
    private volatile long lastDurationMs = 0L;
    private volatile boolean lastPlaying = false;
    private volatile long lastPositionMs = 0L;
    /** 单例：JS 桥要把封面交回来，必须找得到当前服务实例。 */
    private static volatile FoliaPlaybackService instance;
    /** 已经注入过封面回调桥的 WebView，避免重复 addJavascriptInterface。 */
    private volatile WebView artworkBridgeWebView;
    /** 仅播放中跑进度 tick，暂停时停掉，省掉无意义的定时器唤醒。 */
    private final Runnable progressTicker = new Runnable() {
        @Override public void run() {
            if (!lastPlaying) return;
            long now = System.currentTimeMillis();
            // 以最后一次已知位置为基准外推，比读 audio 更准（前端只在切歌/暂停时推位置）。
            long projected = lastPositionMs + (now - lastPositionAtMs);
            if (lastDurationMs > 0 && projected > lastDurationMs) projected = lastDurationMs;
            publishPlaybackState(projected);
            mainHandler.postDelayed(this, PROGRESS_TICK_MS);
        }
    };
    private volatile long lastPositionAtMs = 0L;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        instance = this;
        installArtworkBridge();
        mediaSession = new MediaSession(this, SESSION_TAG);
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { emit("play"); }
            @Override public void onPause() { emit("pause"); }
            @Override public void onSkipToNext() { emit("next"); }
            @Override public void onSkipToPrevious() { emit("previous"); }
            @Override public void onStop() { emit("stop"); }
            @Override public void onSeekTo(long pos) {
                // 先本地把进度拨过去，通知条立刻跟上；随后前端的 timeupdate 会带真实位置修正。
                lastPositionMs = Math.max(0L, pos);
                lastPositionAtMs = System.currentTimeMillis();
                publishPlaybackState(lastPositionMs);
                emit("seek");
            }
        });
        mediaSession.setActive(true);
        // 会话要能被媒体通知/锁屏/蓝牙发现，播放属性必须声明成音乐，否则部分
        // 系统 UI（含 HyperOS 的媒体卡片）会把它当成普通会话直接忽略。
        mediaSession.setPlaybackToLocal(buildAudioAttributes());
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Folia:Playback");
            wakeLock.setReferenceCounted(false);
        }
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        if (wifiManager != null) {
            int lockMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wifiManager.createWifiLock(lockMode, "Folia:Playback");
            wifiLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || "clear".equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent.getStringExtra("title");
        String artist = intent.getStringExtra("artist");
        String album = intent.getStringExtra("album");
        String coverUrl = intent.getStringExtra("coverUrl");
        boolean playing = intent.getBooleanExtra("playing", false);
        long position = intent.getLongExtra("position", 0);
        long duration = intent.getLongExtra("duration", 0);

        // 元数据只在「歌曲/封面真的变了」时才重建。前端每秒都会推一次进度，
        // 如果每次都重发 setMetadata，酷狗/网易的封面会被反复重下，通知也会每秒闪一次。
        String nextArtworkUrl = coverUrl == null ? "" : coverUrl.trim();
        long normalizedDuration = Math.max(0L, duration);
        boolean metadataChanged = !TextUtils.equals(title, lastTitle)
            || !TextUtils.equals(artist, lastArtist)
            || !TextUtils.equals(album, lastAlbum)
            || normalizedDuration != lastDurationMs
            || !TextUtils.equals(nextArtworkUrl, currentArtworkUrl);
        if (metadataChanged) {
            currentArtworkUrl = nextArtworkUrl;
            lastTitle = title == null ? "" : title;
            lastArtist = artist == null ? "" : artist;
            lastAlbum = album == null ? "" : album;
            lastDurationMs = normalizedDuration;
            if (!currentArtworkUrl.isEmpty()) {
                // 换歌即作废上一张：留着旧封面会让新歌先显示上一首的图。
                appliedArtworkUrl = "";
                appliedArtworkBitmap = null;
            }
            publishMetadata();
            if (!currentArtworkUrl.equals(lastRequestedCoverUrl)) {
                lastRequestedCoverUrl = currentArtworkUrl;
                FoliaCorePlugin.notePlaybackArtwork(
                    currentArtworkUrl,
                    currentArtworkUrl.isEmpty() ? "none" : "queued",
                    ""
                );
            }
            loadArtwork(currentArtworkUrl, bitmap -> {
                if (!TextUtils.equals(currentArtworkUrl, nextArtworkUrl)) return;
                publishMetadata();
            });
        }

        lastPlaying = playing;
        lastPositionMs = Math.max(0L, position);
        lastPositionAtMs = System.currentTimeMillis();
        publishPlaybackState(lastPositionMs);
        startForeground(NOTIFICATION_ID, buildNotification());
        updatePlaybackLocks(playing);
        // 播放中起一个 1 秒的 tick，让通知进度条与时间自己走；暂停/停止时收掉。
        mainHandler.removeCallbacks(progressTicker);
        if (playing) mainHandler.postDelayed(progressTicker, PROGRESS_TICK_MS);
        return START_STICKY;
    }

    /** 用当前缓存的歌曲信息 + 已加载封面重建 MediaSession 元数据。 */
    private void publishMetadata() {
        Bitmap artwork = appliedArtworkBitmap;
        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE,
                lastTitle.isEmpty() ? "Folia" : lastTitle)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, lastArtist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, lastAlbum);
        if (lastDurationMs > 0) {
            metadata.putLong(MediaMetadata.METADATA_KEY_DURATION, lastDurationMs);
        }
        // 位图是通知/锁屏唯一稳定显示的途径；URI 只作为补充，供自己会去下载的
        // 系统组件（部分车机、Wear）使用。blob: / data: 这类只在本进程有效的
        // 来源不能当 URI 发出去，发了只会让对端拿到一张坏图。
        if (artwork != null) {
            metadata.putBitmap(MediaMetadata.METADATA_KEY_ART, artwork);
            metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        } else if (isRemoteArtworkUrl(currentArtworkUrl)) {
            metadata.putString(MediaMetadata.METADATA_KEY_ART_URI, currentArtworkUrl);
            metadata.putString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI, currentArtworkUrl);
        }
        mediaSession.setMetadata(metadata.build());
        FoliaCorePlugin.notePlaybackArtworkApplied(artwork != null);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification());
    }

    /** 只更新播放状态与进度，不动元数据 —— 前端每秒进度就是走这条。 */
    private void publishPlaybackState(long positionMs) {
        if (mediaSession == null) return;
        float speed = lastPlaying ? 1f : 0f;
        int state = lastPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
        mediaSession.setPlaybackState(new PlaybackState.Builder()
            .setActions(
                PlaybackState.ACTION_PLAY
                    | PlaybackState.ACTION_PAUSE
                    | PlaybackState.ACTION_PLAY_PAUSE
                    | PlaybackState.ACTION_SKIP_TO_NEXT
                    | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackState.ACTION_SEEK_TO
                    | PlaybackState.ACTION_STOP
            )
            .setState(state, Math.max(0L, positionMs), speed)
            .build());
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification());
    }

    /** 声明「我在放音乐」，否则系统媒体 UI 可能不接管这个会话。 */
    private android.media.AudioAttributes buildAudioAttributes() {
        return new android.media.AudioAttributes.Builder()
            .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
            .build();
    }

    /**
     * 只有 http(s) 封面值得作为 URI 发出去。
     *
     * 本地封面走 /__folia_cover/ 相对路径、OPFS 的 blob: 或 base64 data:，
     * 这些在 WebView 进程外都不可解析，所以必须由本类下载/解码成位图后再用。
     */
    private static boolean isRemoteArtworkUrl(String url) {
        return url != null && (url.startsWith("http://") || url.startsWith("https://"));
    }

    private Notification buildNotification() {
        boolean playing = lastPlaying;
        Intent activityIntent = new Intent(this, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            activityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        int playPauseIcon = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        PendingIntent playPauseIntent = PendingIntent.getBroadcast(
            this,
            1,
            new Intent(this, PlaybackActionReceiver.class).setAction(playing ? "pause" : "play"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent previousIntent = PendingIntent.getBroadcast(
            this,
            2,
            new Intent(this, PlaybackActionReceiver.class).setAction("previous"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent nextIntent = PendingIntent.getBroadcast(
            this,
            3,
            new Intent(this, PlaybackActionReceiver.class).setAction("next"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
            // 用应用图标而不是系统 ic_media_play：媒体通知的小图标会被系统染白，
            // 用播放键图标在澎湃OS 上会呈现成一个含义不明的三角形。
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(lastTitle.isEmpty() ? "Folia" : lastTitle)
            .setContentText(lastArtist)
            .setContentIntent(contentIntent)
            .setOnlyAlertOnce(true)
            .setOngoing(playing)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "Previous", previousIntent)
            .addAction(playPauseIcon, playing ? "Pause" : "Play", playPauseIntent)
            .addAction(android.R.drawable.ic_media_next, "Next", nextIntent)
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        Bitmap artwork = appliedArtworkBitmap;
        if (artwork != null) builder.setLargeIcon(artwork);
        return builder.build();
    }

    private void loadArtwork(String value, ArtworkCallback callback) {
        if (value == null || value.isEmpty()) return;
        if (value.equals(appliedArtworkUrl)) return;
        Bitmap cached = artworkCache.get(value);
        if (cached != null) {
            mainHandler.post(() -> {
                if (value.equals(currentArtworkUrl)) {
                    appliedArtworkUrl = value;
                    appliedArtworkBitmap = cached;
                    FoliaCorePlugin.notePlaybackArtwork(
                        value,
                        "loaded",
                        "cached " + cached.getWidth() + "x" + cached.getHeight()
                    );
                }
                callback.onLoaded(cached);
            });
            return;
        }
        if (isRemoteArtworkUrl(value)) {
            downloadRemoteArtwork(value, callback);
            return;
        }
        // 本地封面（/__folia_cover/、blob:、data:）只存在于 WebView 侧：
        // OPFS 里的字节、相对路径都解析不了，必须让页面自己把图画到 canvas 上再传回来。
        requestArtworkFromWebView(value, callback);
    }

    /** 走 OkHttp 拉远程封面，成功/失败都写进诊断，方便线上排查「封面不显示」。 */
    private void downloadRemoteArtwork(String value, ArtworkCallback callback) {
        Log.i(TAG, "开始下载封面 url=" + describeArtwork(value));
        artworkExecutor.execute(() -> {
            Bitmap bitmap = null;
            String failure = "";
            try (Response response = artworkClient.newCall(new Request.Builder()
                .url(value)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 13; Mobile)")
                .build()).execute()) {
                ResponseBody body = response.body();
                if (response.isSuccessful() && body != null) {
                    try (InputStream input = body.byteStream()) {
                        bitmap = decodeScaledArtwork(input);
                    }
                    if (bitmap == null) failure = "decode-failed";
                } else {
                    failure = "http-" + response.code();
                }
            } catch (Exception error) {
                failure = error.getClass().getSimpleName();
            }
            if (bitmap != null) {
                Log.i(TAG, "封面下载成功 url=" + describeArtwork(value)
                    + " size=" + bitmap.getWidth() + "x" + bitmap.getHeight());
            } else {
                Log.w(TAG, "封面下载失败 url=" + describeArtwork(value) + " reason=" + failure);
            }
            if (bitmap != null) artworkCache.put(value, bitmap);
            Bitmap resolved = bitmap;
            if (resolved != null) {
                mainHandler.post(() -> {
                    if (value.equals(currentArtworkUrl)) {
                        appliedArtworkUrl = value;
                        appliedArtworkBitmap = resolved;
                        FoliaCorePlugin.notePlaybackArtwork(
                            value,
                            "loaded",
                            resolved.getWidth() + "x" + resolved.getHeight()
                        );
                    }
                    callback.onLoaded(resolved);
                });
            } else {
                FoliaCorePlugin.notePlaybackArtwork(value, "error", failure.isEmpty() ? "unknown" : failure);
            }
        });
    }

    private interface ArtworkCallback {
        void onLoaded(Bitmap bitmap);
    }

    /**
     * 让页面把本地封面画进 canvas，再把 base64 交回来。
     *
     * 本地音乐（OPFS）与缓存封面（blob:）在原生侧没有任何可打开的句柄，
     * 而系统媒体控件只认位图。页面里已经有这张图的解码版本，借它一步最省事。
     */
    private void requestArtworkFromWebView(String value, ArtworkCallback callback) {
        final WebView webView = FoliaCorePlugin.getSharedWebView();
        if (webView == null) {
            FoliaCorePlugin.notePlaybackArtwork(value, "error", "webview-unavailable");
            return;
        }
        // 覆盖安装或 WebView 重建会把注入的接口冲掉，取不到就补一次。
        installArtworkBridge();
        mainHandler.post(() -> {
            if (!TextUtils.equals(currentArtworkUrl, value)) return;
            String script = "(function(){"
                + "var done=false;"
                + "function finish(ok,data){"
                + "if(done)return;done=true;"
                + "try{FoliaPlaybackArtwork.resolve(" + JSON_QUOTE + ",ok,data);}catch(e){}"
                + "}"
                // data: 与 blob: 都能直接喂给 Image；相对路径要先补成绝对地址。
                + "var src=" + JSON_QUOTE + ";"
                + "if(src.charAt(0)==='/'){src=location.origin+src;}"
                + "var img=new Image();"
                + "img.crossOrigin='anonymous';"
                + "img.onload=function(){"
                + "try{"
                + "var size=Math.min(img.naturalWidth,img.naturalHeight);"
                + "if(!size||size<=0){finish(false,'');return;}"
                + "var c=document.createElement('canvas');"
                + "c.width=size;c.height=size;"
                + "var ctx=c.getContext('2d');"
                + "ctx.drawImage(img,0,0,size,size);"
                // 正方形裁切：通知与锁屏的封面位都是正方形，避免系统再压一次变形。
                + "finish(true,c.toDataURL('image/jpeg',0.85));"
                + "}catch(e){finish(false,String(e&&e.name||'canvas'));}"
                + "};"
                + "img.onerror=function(){finish(false,'load-failed');};"
                + "img.src=src;"
                + "})();";
            webView.evaluateJavascript(script.replace(JSON_QUOTE, escapeForJs(value)), null);
        });
    }

    /** 往页面里挂一个回信用对象；页面把图画好后调 resolve(url, ok, data)。 */
    private void installArtworkBridge() {
        WebView webView = FoliaCorePlugin.getSharedWebView();
        if (webView == null) return;
        // 同一个 WebView 只需要注入一次；换过 WebView（覆盖安装/重建）才需要重来。
        if (artworkBridgeWebView == webView) return;
        artworkBridgeWebView = webView;
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void resolve(String url, boolean ok, String data) {
                if (!ok || TextUtils.isEmpty(data)) {
                    Log.w(TAG, "封面未取到 url=" + describeArtwork(url) + " reason=" + (data == null ? "empty" : data));
                    FoliaCorePlugin.notePlaybackArtwork(url, "error", data == null ? "empty" : data);
                    return;
                }
                byte[] bytes;
                try {
                    String payload = data.contains(",") ? data.substring(data.indexOf(',') + 1) : data;
                    bytes = Base64.decode(payload, Base64.DEFAULT);
                } catch (Exception error) {
                    FoliaCorePlugin.notePlaybackArtwork(url, "error", "base64");
                    return;
                }
                if (bytes.length == 0) {
                    FoliaCorePlugin.notePlaybackArtwork(url, "error", "empty-bytes");
                    return;
                }
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) {
                    Log.w(TAG, "封面解码失败 url=" + describeArtwork(url));
                    FoliaCorePlugin.notePlaybackArtwork(url, "error", "decode-failed");
                    return;
                }
                artworkCache.put(url, bitmap);
                Log.i(TAG, "封面已就绪 url=" + describeArtwork(url)
                    + " size=" + bitmap.getWidth() + "x" + bitmap.getHeight());
                mainHandler.post(() -> {
                    if (!TextUtils.equals(currentArtworkUrl, url)) return;
                    appliedArtworkUrl = url;
                    appliedArtworkBitmap = bitmap;
                    FoliaCorePlugin.notePlaybackArtwork(
                        url,
                        "loaded",
                        "webview " + bitmap.getWidth() + "x" + bitmap.getHeight()
                    );
                    publishMetadata();
                });
            }
        }, "FoliaPlaybackArtwork");
    }

    /** JS 字符串字面量里的双引号占位符，替换时转义用户数据。 */
    private static final String JSON_QUOTE = "\u0000quoted\u0000";

    /** 日志里只露域名与协议，避免把带参数的封面地址整个写进 logcat。 */
    private static String describeArtwork(String url) {
        if (url == null || url.isEmpty()) return "(none)";
        int cut = url.indexOf('?');
        String head = cut > 0 ? url.substring(0, cut) : url;
        return head.length() > 80 ? head.substring(0, 80) + "..." : head;
    }

    private static String escapeForJs(String value) {
        StringBuilder out = new StringBuilder(value.length() + 2);
        out.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '"' || c == '\\') { out.append('\\').append(c); }
            else if (c < 0x20) { out.append(String.format("\\u%04x", (int) c)); }
            else { out.append(c); }
        }
        out.append('"');
        return out.toString();
    }

    /**
     * 解码并按 512 上限裁切。
     *
     * 必须先整段读进内存：BitmapFactory 量尺寸要消耗一次流，正式解码又要一次，
     * 而网络流读过头就退不回去，直接复用会让第二次解码拿到空数据返回 null
     * （表现为「封面一直下载失败」）。封面对外尺寸很小，缓存整个字节数组是可接受的代价。
     * 裁切则是为了别把 CDN 上的原图（常见 1000px+）整个解进内存，
     * 再塞进 MediaMetadata 时被 Binder 的 1MB 限制截断。
     */
    private static Bitmap decodeScaledArtwork(InputStream input) {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[16 * 1024];
        int read;
        try {
            while ((read = input.read(chunk)) > 0) {
                buffer.write(chunk, 0, read);
            }
        } catch (java.io.IOException error) {
            return null;
        }
        byte[] data = buffer.toByteArray();
        if (data.length == 0) return null;
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = Math.max(1, Integer.highestOneBit(
            Math.max(bounds.outWidth, bounds.outHeight) / ARTWORK_TARGET_SIZE));
        return BitmapFactory.decodeByteArray(data, 0, data.length, options);
    }

    /**
     * Keeps the remote-audio proxy alive in the background.
     *
     * A foreground service keeps the process visible, but it does not stop Doze from throttling
     * the CPU or the Wi-Fi radio. Playback pulls the stream through LocalAudioServer, so losing
     * either one shows up as intermittent audio while the screen is off.
     */
    private void updatePlaybackLocks(boolean playing) {
        try {
            if (playing) {
                if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
                if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
            } else {
                if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
            }
            powerDiagnostic = "wake=" + (wakeLock != null && wakeLock.isHeld() ? "held" : "released")
                + " wifi=" + (wifiLock != null && wifiLock.isHeld() ? "held" : "released")
                + " error=none";
        } catch (Exception error) {
            powerDiagnostic = "wake=" + (wakeLock != null && wakeLock.isHeld() ? "held" : "released")
                + " wifi=" + (wifiLock != null && wifiLock.isHeld() ? "held" : "released")
                + " error=" + error.getClass().getSimpleName();
        }
    }

    static String getPowerDiagnostic() {
        return powerDiagnostic;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Folia playback",
                NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void emit(String action) {
        FoliaCorePlugin.emitMediaAction(action);
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacks(progressTicker);
        instance = null;
        artworkBridgeWebView = null;
        updatePlaybackLocks(false);
        artworkExecutor.shutdownNow();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
