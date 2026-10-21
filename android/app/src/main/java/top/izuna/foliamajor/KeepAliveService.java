package top.izuna.foliamajor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.app.NotificationCompat;

/**
 * 播放保活前台服务。
 *
 * 只负责把进程提到前台、让后台播放不被系统回收，不持有 MediaSession。
 * 系统级媒体控件（通知栏媒体卡片、锁屏、蓝牙/车机、HyperOS 灵动岛）由
 * FoliaPlaybackService 统一提供，数据来自 FoliaCorePlugin.updatePlaybackState
 * （JS 侧 nativePlaybackBridge 驱动）。
 * 两个前台服务各自持有 MediaSession 会互相抢绑，系统最终只认其中一个，
 * 表现为媒体卡片不显示或按钮无效，所以会话必须全局唯一。
 */
public class KeepAliveService extends Service {

    private static final String CHANNEL_ID = "folia_playback";
    private static final int NOTIFICATION_ID = 1001;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    /** 由 MainActivity 注入（系统创建服务实例，无法走构造器传参）。 */
    private static WebView sharedWebView;
    private static KeepAliveService instance;
    private WebView webView;
    private String lastTitle = "";
    private boolean lastTitleKnown = false;

    /** JS 桥：前端把当前歌曲与播放状态推给原生。 */
    private class Api {
        @JavascriptInterface
        public void updateMedia(String title, String artist, String album, String artUri, double durationMs) {
            mainHandler.post(() -> {
                lastTitle = title == null ? "" : title;
                lastTitleKnown = true;
                refreshNotification();
            });
        }

        @JavascriptInterface
        public void updateLyric(String text) {
            // 歌词只影响通知文案；播放控制与进度统一走 FoliaPlaybackService 的媒体会话。
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        startForegroundInternal();
        attachWebViewWithRetry();
    }

    /** Activity 就绪后主动注入（覆盖"服务先起、界面后来"的进程重启场景）。 */
    public static void attachWebViewNow(WebView view) {
        sharedWebView = view;
        if (instance != null) instance.doAttach(view);
    }

    private void doAttach(WebView view) {
        if (webView != null) return;
        webView = view;
        webView.addJavascriptInterface(new Api(), "FoliaMedia");
        android.util.Log.i("FoliaMedia", "接口已注入 WebView（Activity 主动触发）");
    }

    /**
     * WebView 可能在服务创建时还没就绪（Capacitor 异步初始化）。
     * 注入必须发生在页面 loadUrl 之前才有效，所以这里以 1 秒间隔重试，
     * 最多 60 次 —— 覆盖后端健康检查的整个启动窗口。
     */
    private void attachWebViewWithRetry() {
        final int[] attempts = {0};
        final Runnable[] retry = new Runnable[1];
        retry[0] = () -> {
            attempts[0] += 1;
            if (webView != null) return;   // 已注入
            if (sharedWebView == null) {
                if (attempts[0] <= 60) mainHandler.postDelayed(retry[0], 1000);
                else android.util.Log.e("FoliaMedia", "重试 60 秒仍未获得 WebView，放弃注入");
                return;
            }
            webView = sharedWebView;
            webView.addJavascriptInterface(new Api(), "FoliaMedia");
            android.util.Log.i("FoliaMedia", "接口已注入 WebView（第 " + attempts[0] + " 次尝试）");
        };
        retry[0].run();
    }

    /** MainActivity 在启动服务前注入 WebView。 */
    public static void setSharedWebView(WebView view) {
        sharedWebView = view;
    }

    /** MainActivity 创建服务时传入 WebView，用于把通知按钮的指令回调给页面。 */
    public void attach(WebView webView) {
        this.webView = webView;
        webView.addJavascriptInterface(new Api(), "FoliaMedia");
    }

    private void createChannel() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "音乐播放", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("后台播放音乐时保持运行");
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }
    }

    private void startForegroundInternal() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "音乐播放", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("后台播放音乐时保持运行");
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    private Notification buildNotification() {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        // 只做保活提示，不带播放控制：控制统一由 FoliaPlaybackService 的媒体会话提供。
        // 歌名还没到手时给一句通用文案，避免出现空标题的通知。
        if (lastTitleKnown && !lastTitle.isEmpty()) {
            builder.setContentTitle(lastTitle);
            builder.setContentText("音乐播放中");
        } else {
            builder.setContentTitle("Folia");
            builder.setContentText("音乐播放中");
        }
        return builder.build();
    }


    /** 通知内容/按钮随播放状态变化，需要重新发布。 */
    private void refreshNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
