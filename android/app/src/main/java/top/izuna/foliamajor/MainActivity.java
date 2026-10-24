package top.izuna.foliamajor;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

import top.izuna.foliamajor.rear.RearProjectionPlugin;

/**
 * Folia Android 宿主 Activity。
 *
 * 在原生 Capacitor BridgeActivity 之上做了四件事：
 * 1. 横竖屏自适应：Manifest 用 fullSensor，代码里再兜一层，跟随重力感应切换。
 * 2. 沉浸式全屏：隐藏状态栏与导航栏，下拉才临时唤出；并且在 onCreate / onResume /
 *    onWindowFocusChanged 以及若干延时点重复收起——Capacitor 的 StatusBar 插件和启动图收起
 *    都会在 Activity 起来之后把系统栏重新显示出来，只收一次是不够的。
 * 3. WebView 视口收敛：关闭捏合缩放、开启整页适配，解决“画面被放大、比例不对、铺不满屏”。
 *    横屏额外做整页缩放（见 LAYOUT_ZOOM_LANDSCAPE）。
 * 4. NDK 原生模块：加载 libfolia_native.so 并输出本机 ABI / CPU 能力。
 *
 * 另外两件事都和「后台播放不中断」有关（详见 docs/背屏歌词适配方案.md 第 14 节）：
 * Manifest 里给本 Activity 加了 {@code excludeFromRecents}，任务不会出现在最近任务里，
 * 也就不会被划掉——划掉会销毁 WebView，而音频正是 WebView 里的 HTMLAudioElement 在放；
 * 返回键也不再直接结束 Activity，而是退回后台继续播。
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "FoliaNative";

    /** 本地音乐导入桥：SAF 选目录 → 拷贝到 filesDir/local-music。 */

    /**
     * 横屏整页缩放。1.0 = 原始大小，0.75 = 整个界面缩小到 75%。
     *
     * 实现方式：把页面布局宽度按 1/zoom 放大，再让 WebView 等比缩回屏幕宽度。
     * 手机横屏的 CSS 视口只有大约 754x347（2640px / 3.5 密度），桌面版布局在这个尺寸下
     * 偏大，所以横屏默认缩到 75%。
     */
    private static final float LAYOUT_ZOOM_LANDSCAPE = 0.75f;

    /** 竖屏不缩放：手机竖屏的 CSS 视口本来就很窄，界面本身就是按窄屏排的。 */
    private static final float LAYOUT_ZOOM_PORTRAIT = 1.0f;

    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private final Runnable immersiveTask = this::applyImmersiveFullscreen;

    static {
        try {
            System.loadLibrary("folia_native");
        } catch (Throwable t) {
            // 原生库缺失不应拖垮 WebView 主体，降级为仅记录日志。
            Log.w(TAG, "libfolia_native 加载失败，原生能力不可用: " + t.getMessage());
        }
    }

    /** 由 src/main/cpp/folia_native.cpp 实现，返回本机 ABI / 核心数 / NEON 支持摘要。 */
    private static native String nativeRuntimeInfo();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 崩溃记录器：装上未捕获异常钩子，并把上一轮的服务心跳归档到 previous 槽位。
        // 之前一直没人调用它，所以真机闪退在应用侧不留任何痕迹，只能靠 logcat。
        CrashDiagnostics.install(this);
        // 必须在 super.onCreate 之前：那一步就会创建 WebView，之后再动缓存目录不安全。
        WebViewCacheReset.resetIfAppUpdated(this);
        registerPlugin(FoliaCorePlugin.class);
        // 原生协议网络层：音源请求与扫码登录走 OkHttp + 系统 CookieManager（audioNative/*.ts 依赖它）。
        // 用 try/catch 兜住：插件注册失败（例如运行期缺 okhttp 类）只该让音源降级，不该整个 App 起不来。
        try {
            registerPlugin(FoliaBridgePlugin.class);
        } catch (Throwable t) {
            Log.e(TAG, "FoliaBridge 插件注册失败，原生音源降级: " + t);
        }
        // 背屏投屏桥：前端用 RearProjection.startProjection() / stopProjection() 控制背屏歌词页。
        registerPlugin(RearProjectionPlugin.class);
        super.onCreate(savedInstanceState);

        // 横竖屏都支持：跟随重力感应自动切换（竖屏 + 左右两个横屏方向）。
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);

        configureWebView();
        applyImmersiveFullscreen();
        scheduleImmersiveReapply();
        /*
         * API 30 以下：系统栏被临时划出后会自己弹回来，只有「可见性变化」这个回调能立刻压回去
         * （上游 v0.7.21 的 setOnSystemUiVisibilityChangeListener）。
         * 30+ 不用装 —— 那边没有设 SYSTEM_UI_FLAG_FULLSCREEN，这个判据永远成立，
         * 会在 hide() 触发的可见性回调里自激重入。
         */
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
                if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
                    applyImmersiveFullscreen();
                }
            });
        }
        logNativeRuntimeInfo();
        // 本地音乐导入桥必须在 WebView 加载页面之前注册。
        // 注意：WebView 不是字段，要从 Capacitor 的 Bridge 上取（与 configureWebView 一致）。
        Bridge musicBridge = getBridge();
        WebView musicWebView = musicBridge == null ? null : musicBridge.getWebView();
        // [folia] 修复缩放拼贴时的黑闪：WebView 重绘瞬间会露出自身底色（默认白/黑），
        // 固定为 App 的背景色后，露出的底色与界面一致，肉眼不可见。
        if (musicWebView != null) {
            musicWebView.setBackgroundColor(android.graphics.Color.parseColor("#09090b"));
        }

        // Android 13+：通知权限自动请求 —— 未授权时启动即弹系统授权框。
        // （不授权的话，媒体通知/常驻通知都会被系统静默丢弃。）
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 2002);
        }

        /*
         * 前台服务只保留 FoliaPlaybackService（播放时由 FoliaCorePlugin 启动）。
         * 之前这里还会再起一个 KeepAliveService，两个前台服务各自 startForeground，
         * 系统通知栏就会出现两条「音乐播放中」——一条保活占位、一条媒体卡片。
         * 播放保活现在由 FoliaPlaybackService 的 MediaSession + WakeLock 负责，
         * 启动阶段 App 在前台，不需要额外的常驻通知。
         */
        installBackToBackground();
    }

    /**
     * 返回键退回后台，不结束 Activity。
     *
     * <p>以前返回键直接 finish，Activity 一销毁 Capacitor 就把 WebView 也销毁了，音频跟着停，
     * 表现就是「一退出就静音」。现在先让页面自己处理（FoliaCorePlugin.emitBackPressed 与 Escape
     * 同一条链路），页面不接手就 moveTaskToBack：界面退到后台，播放继续。
     */
    private void installBackToBackground() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (FoliaCorePlugin.emitBackPressed()) {
                    return;
                }
                moveTaskToBack(true);
            }
        });
    }

    /**
     * 解包内置 Node 项目并把它拉起来 —— 四个音源后端（网易云/酷狗/QQ/波点）
     * 就这样直接跑在手机本地，App 通过 http://127.0.0.1:&lt;port&gt; 访问，
     * 不需要数据线、adb reverse 或者任何外部服务器。
     */


    @Override
    public void onResume() {
        super.onResume();
        applyImmersiveFullscreen();
        scheduleImmersiveReapply();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // 从通知栏、多任务切回来之后系统栏会重新出现，这里重新收起。
        if (hasFocus) {
            applyImmersiveFullscreen();
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Activity 声明了 configChanges，旋转不会重建；这里把全屏和缩放按新方向重新应用一遍。
        applyImmersiveFullscreen();
        scheduleImmersiveReapply();

        Bridge bridge = getBridge();
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null) {
            applyLayoutZoom(webView);
        }
    }

    /** 在几个时间点重复收起系统栏，压过 Capacitor 插件与启动图带来的重新显示。 */
    private void scheduleImmersiveReapply() {
        uiHandler.removeCallbacks(immersiveTask);
        for (long delay : new long[]{300L, 1200L, 2500L}) {
            uiHandler.postDelayed(immersiveTask, delay);
        }
    }

    /** 系统栏设置的安全入口：个别 ROM 的 insets API 会抛异常，兜住不让它拖垮 Activity。 */
    private void applyImmersiveFullscreen() {
        try {
            applyImmersiveFullscreenUnsafe();
        } catch (Throwable t) {
            Log.w(TAG, "沉浸式全屏设置失败（已忽略）: " + t);
        }
    }

    private void applyImmersiveFullscreenUnsafe() {
        Window window = getWindow();
        // 让内容真正铺满整屏（含状态栏与导航栏区域），而不是被系统栏挤出一圈边。
        WindowCompat.setDecorFitsSystemWindows(window, false);
        // 系统栏本身透明：下拉临时划出时不出现一条不透明色带（上游 v0.7.21 的做法）。
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(android.graphics.Color.TRANSPARENT);
        window.setNavigationBarColor(android.graphics.Color.TRANSPARENT);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());

        /*
         * 双通道（上游 v0.7.21 的写法）：Compat 那一套在部分 ROM 上会被系统栏重新插回来，
         * 所以再直接走一次平台 API。
         * - API 30+：setDecorFitsSystemWindows(false) + WindowInsetsController.hide(statusBars|navigationBars)；
         * - API 30 以下：只能靠 IMMERSIVE_STICKY 那组 View flag，粘性全屏才会被系统自动恢复。
         */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController platformController = window.getInsetsController();
            if (platformController != null) {
                platformController.hide(
                        android.view.WindowInsets.Type.statusBars()
                                | android.view.WindowInsets.Type.navigationBars());
                platformController.setSystemBarsBehavior(
                        android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }

        applyCutoutMode();
    }

    /**
     * 挖孔 / 刘海屏：允许窗口画到挖孔区域里。
     *
     * API 30+ 用 ALWAYS —— 横屏时左右两条长边也可能有挖孔，SHORT_EDGES 只放短边，会留黑边；
     * 低版本只有 SHORT_EDGES 可选。
     */
    /** 挖孔模式的安全入口：同 applyImmersiveFullscreen，ROM 差异不该变成闪退。 */
    private void applyCutoutMode() {
        try {
            applyCutoutModeUnsafe();
        } catch (Throwable t) {
            Log.w(TAG, "挖孔模式设置失败（已忽略）: " + t);
        }
    }

    private void applyCutoutModeUnsafe() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            return;
        }
        WindowManager.LayoutParams attributes = getWindow().getAttributes();
        attributes.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        getWindow().setAttributes(attributes);
    }

    private void configureWebView() {
        try {
            Bridge bridge = getBridge();
            WebView webView = bridge == null ? null : bridge.getWebView();
            if (webView == null) {
                Log.w(TAG, "WebView 尚未就绪，跳过视口配置");
                return;
            }

            WebSettings settings = webView.getSettings();

            // 关键：Capacitor 默认允许 WebView 被捏合放大，一旦缩放级别不是 1，页面就会
            // 看起来“比例变大、铺不满屏幕”。这里直接关掉缩放。
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);

            // 让 WebView 按整页来布局：内容宽于屏幕时整体缩小以适配，而不是只显示局部。
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            settings.setTextZoom(100);
            webView.setInitialScale(0);

            // 页面本体是 https://localhost，而自托管后端（网易云 API）是 http，
            // 默认会被 WebView 当成混合内容拦掉，这里放行。
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

            settings.setMediaPlaybackRequiresUserGesture(false);

            // 横竖屏各自的缩放由 injectLayoutZoom 内部按当前方向决定（见 LAYOUT_ZOOM_*）。
            applyLayoutZoom(webView);
        } catch (Throwable t) {
            Log.w(TAG, "配置 WebView 视口失败", t);
        }
    }

    /**
     * 按当前方向注入整页缩放（横屏缩小、竖屏保持原样），并延时重复几次。
     *
     * 虚拟宽度由 WebView 当前的实际像素宽度换算得出（而不是用启动瞬间的 DisplayMetrics，
     * 那时窗口可能还停在另一个方向），所以旋转后重算才准确。
     */
    private void applyLayoutZoom(final WebView webView) {
        for (long delay : new long[]{300L, 600L, 1200L, 2000L, 3200L}) {
            uiHandler.postDelayed(() -> injectLayoutZoom(webView), delay);
        }
    }

    private void injectLayoutZoom(final WebView webView) {
        try {
            int widthPx = webView.getWidth();
            int heightPx = webView.getHeight();
            if (widthPx <= 0 || heightPx <= 0) {
                return;
            }

            boolean landscape = widthPx > heightPx;
            float zoom = landscape ? LAYOUT_ZOOM_LANDSCAPE : LAYOUT_ZOOM_PORTRAIT;

            /*
             * 原生侧再同步一次缩放百分比（上游 v0.7.21 用的就是 setInitialScale(75)）。
             * 页面里如果自己重建了 <meta name=viewport>，上面那一路就失效了；
             * 这里补的一层让 75% 不依赖页面是否还留着那个 meta。
             */
            webView.setInitialScale(Math.round(zoom * 100f));

            String viewportContent;
            if (zoom >= 0.999f) {
                // 竖屏：还原成标准视口，不做任何缩放。
                viewportContent = "width=device-width, initial-scale=1.0, viewport-fit=cover";
            } else {
                float density = getResources().getDisplayMetrics().density;
                int virtualWidth = Math.round(widthPx / density / zoom);
                viewportContent = "width=" + virtualWidth
                        + ", initial-scale=" + zoom
                        + ", viewport-fit=cover";
            }

            // 注意：**必须删掉旧的 meta 再插一个新的**。
            // Chromium 只在页面加载时读 <meta name=viewport>，事后修改已有标签的 content
            // 通常不会触发视口重算 —— 这正是"横竖屏切换后整体比例没更新"的原因。
            // 移除旧节点 + 插入新节点才会让它重新计算。
            String js = "(function(){"
                    + "var old=document.querySelectorAll('meta[name=viewport]');"
                    + "for(var i=0;i<old.length;i++){old[i].parentNode.removeChild(old[i]);}"
                    + "var m=document.createElement('meta');"
                    + "m.setAttribute('name','viewport');"
                    + "m.setAttribute('content','" + viewportContent + "');"
                    + "document.head.appendChild(m);"
                    // 强制一次样式/布局失效，确保缩放被重新应用。
                    + "void document.documentElement.offsetHeight;"
                    + "})();";
            webView.evaluateJavascript(js, null);
            Log.i(TAG, "布局缩放=" + zoom + " (" + (landscape ? "横屏" : "竖屏") + ") viewport=" + viewportContent);
        } catch (Throwable t) {
            Log.w(TAG, "注入布局缩放失败", t);
        }
    }

    private void logNativeRuntimeInfo() {
        try {
            Log.i(TAG, nativeRuntimeInfo());
        } catch (Throwable t) {
            Log.w(TAG, "读取原生运行时信息失败", t);
        }
    }
}
