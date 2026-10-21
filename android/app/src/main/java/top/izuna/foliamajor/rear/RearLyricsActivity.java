package top.izuna.foliamajor.rear;

import android.content.Intent;
import android.app.ActivityManager;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import top.izuna.foliamajor.WebViewCacheReset;

// 当前文件：Folia 安卓版背屏歌词页 Activity（阶段 2：真实 WebView 承载 ?rear=1 歌词页）。
//
// 这个 Activity 被 RearProjectionController 投到背屏（displayId=1）。它只做承载与桥接：
//   1) 全屏黑底窗口 + 允许内容画进挖孔区（背景铺满，主歌词由页面 CSS 自己避开左侧）；
//   2) 左侧摄像头竖带用原生 View 吞掉触摸 —— 背屏左侧是两个竖排摄像头孔，整条带子不可触摸；
//   3) 用 WebViewAssetLoader 把 https://localhost 映射到 assets/public，加载 ?rear=1 歌词页；
//   4) 注入 window.FoliaRear（@JavascriptInterface）收页面指令，用 evaluateJavascript
//      把主屏推来的快照送进页面（window.__foliaRear.push）。
//
// 页面本体、布局、效果设置都在前端（src/components/rear/），本类不画任何歌词。

/**
 * 背屏歌词页。
 *
 * <p>独立 taskAffinity + singleInstance（见 AndroidManifest），避免和主界面同任务栈被一起拉走。
 */
public class RearLyricsActivity extends AppCompatActivity {

    private static final String TAG = "FoliaRearLyrics";

    /** 左侧安全带宽度（物理像素）的 Intent extra，由投屏方传入。 */
    public static final String EXTRA_SAFE_LEFT_PX = "folia.rear.safeLeftPx";

    /** 系统未上报圆角时的物理像素兜底值。 */
    private static final int FALLBACK_CORNER_RADIUS_PX = 101;

    /** 背屏页的 origin；与 Capacitor 主界面同源，才能共用 localStorage 里的设置。 */
    private static final String REAR_ORIGIN = "https://localhost";

    /** 注入到页面的 JS 宿主对象名，前端读 window.FoliaRear。 */
    private static final String JS_HOST_NAME = "FoliaRear";

    /** 页面 ready 之前的兜底退出按钮延时（毫秒）。 */
    private static final long FALLBACK_EXIT_DELAY_MS = 8000L;

    /** 退出按钮尺寸（dp）。 */
    private static final int EXIT_BUTTON_DP = 30;

    private WebView webView;
    private View fallbackExitButton;
    private WebViewAssetLoader assetLoader;
    private int safeLeftPx = RearDisplayCommands.SAFE_LEFT_PX;
    /** 页面是否已经调过 ready()：ready 之前不推送，避免 evaluateJavascript 打在空上下文上。 */
    private boolean pageReady = false;

    /** 背屏物理圆角半径；Android 11 以下或系统未上报时为 0。 */
    private int cornerRadiusPx = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 背屏 Activity 可能是进程起来后创建的第一个 Activity，所以这里也要清一次（幂等）。
        WebViewCacheReset.resetIfAppUpdated(this);
        super.onCreate(savedInstanceState);
        safeLeftPx = readSafeLeftPx(getIntent());
        cornerRadiusPx = readCornerRadiusPx();
        if (handleCommand(getIntent())) {
            return;
        }
        RearLyricsChannel.attach(this);
        configureWindow();
        setContentView(buildContentView());
        applyRecentsVisibility();
        Log.i(TAG, "背屏歌词页已创建 safeLeftPx=" + safeLeftPx
                + " physicalWidth=" + physicalWidthPx()
                + " cornerRadiusPx=" + cornerRadiusPx
                + " displayId=" + currentDisplayId());
    }

    /**
     * 按用户开关决定背屏任务是否出现在最近任务里。
     *
     * <p>manifest 里的 {@code excludeFromRecents} 编译期就定死了，投屏又是走 {@code am start}
     * 起的任务，所以只能在 Activity 里用 {@link ActivityManager.AppTask#setExcludeFromRecents}
     * 在运行期兑现。开关由设置卡片的 setHideRearTask 写进 SharedPreferences。
     */
    private void applyRecentsVisibility() {
        try {
            boolean hidden = RearTaskRecentsPreference.isHidden(this);
            int taskId = getTaskId();
            if (taskId < 0) {
                return;
            }
            ActivityManager manager = getSystemService(ActivityManager.class);
            if (manager == null) {
                return;
            }
            for (ActivityManager.AppTask task : manager.getAppTasks()) {
                if (task.getTaskInfo().id == taskId) {
                    task.setExcludeFromRecents(hidden);
                    return;
                }
            }
        } catch (Throwable error) {
            // 机型不支持时只是「任务照常可见」，不值得让背屏页起不来。
            Log.w(TAG, "设置背屏任务可见性失败: " + error.getMessage());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // singleInstance：投屏方用 `--es folia.rear.cmd finish` 让我们自己关掉。
        handleCommand(intent);
    }

    @Override
    protected void onDestroy() {
        RearLyricsChannel.detach(this);
        RearLyricsChannel.onRearInactive("activity destroyed");
        // 兜底恢复官方背屏中心：正常退出走 RearProjectionController.stop()，
        // 但用户直接划掉任务时不会经过那里，背屏会一直空着（因为投屏期间把它禁用掉了）。
        // 放到后台线程，别阻塞 onDestroy。
        new Thread(
                () -> PrivilegedShell.run(RearDisplayCommands.restoreOfficialSubscreenCmd()),
                "folia-rear-restore-official"
        ).start();
        if (webView != null) {
            try {
                webView.removeJavascriptInterface(JS_HOST_NAME);
                webView.destroy();
            } catch (Throwable error) {
                Log.w(TAG, "销毁 WebView 失败: " + error.getMessage());
            }
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            // 背屏也会被系统栏/官方背屏中心抢焦点，拿到焦点后重新收一次，保证全屏不被压扁。
            applyImmersive();
        }
    }

    /**
     * 把一份快照推给背屏页。
     *
     * <p>必须在主线程调用；页面还没注册 window.__foliaRear 时静默丢弃（ready() 后会补推）。
     */
    void pushSnapshot(String kind, String json) {
        if (webView == null || kind == null || json == null) {
            return;
        }
        if (!pageReady) {
            return;
        }
        // 用 JSONObject.quote 把 kind 与 json 变成合法 JS 字符串字面量，页面自己 JSON.parse。
        String script = "window.__foliaRear&&window.__foliaRear.push("
                + JSONObject.quote(kind) + "," + JSONObject.quote(json) + ");";
        try {
            webView.evaluateJavascript(script, null);
        } catch (Throwable error) {
            Log.w(TAG, "推送背屏快照失败(" + kind + "): " + error.getMessage());
        }
    }

    /** 处理投屏方通过 intent 下发的命令；返回 true 表示本次启动已被命令消费。 */
    private boolean handleCommand(Intent intent) {
        if (intent == null) {
            return false;
        }
        String command = intent.getStringExtra(RearDisplayCommands.REAR_COMMAND_EXTRA);
        if (RearDisplayCommands.COMMAND_FINISH.equals(command)) {
            Log.i(TAG, "收到 finish 命令，关闭背屏页");
            finish();
            return true;
        }
        return false;
    }

    /** 读取投屏方传入的安全带宽度，非法值回落到默认值。 */
    private int readSafeLeftPx(Intent intent) {
        int fallback = RearDisplayCommands.SAFE_LEFT_PX;
        int value = intent == null ? 0 : intent.getIntExtra(EXTRA_SAFE_LEFT_PX, fallback);
        return value > 0 ? value : fallback;
    }

    /** 背屏的物理像素宽度；页面用它把安全带宽度换算成 CSS px。 */
    private int physicalWidthPx() {
        try {
            return getResources().getDisplayMetrics().widthPixels;
        } catch (Throwable error) {
            return 0;
        }
    }

    /** 读取背屏屏幕四角圆角半径；Android 11 起系统会通过 WindowInsets 上报。 */
    private int readCornerRadiusPx() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return FALLBACK_CORNER_RADIUS_PX;
        }
        try {
            WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
            if (insets == null) {
                return FALLBACK_CORNER_RADIUS_PX;
            }
            android.view.RoundedCorner corner = insets.getRoundedCorner(
                    android.view.RoundedCorner.POSITION_TOP_LEFT
            );
            return corner == null || corner.getRadius() <= 0
                    ? FALLBACK_CORNER_RADIUS_PX
                    : Math.max(0, corner.getRadius());
        } catch (Throwable error) {
            Log.w(TAG, "读取背屏圆角失败: " + error.getMessage());
            return FALLBACK_CORNER_RADIUS_PX;
        }
    }

    /** 背屏页所在 display 的 id，仅用于日志排查。 */
    @SuppressWarnings("deprecation")
    private int currentDisplayId() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && getDisplay() != null) {
                return getDisplay().getDisplayId();
            }
        } catch (Throwable error) {
            Log.w(TAG, "读取 displayId 失败: " + error.getMessage());
        }
        return getWindowManager().getDefaultDisplay().getDisplayId();
    }

    /** 全屏黑底 + 内容可画进挖孔区 + 常亮。 */
    private void configureWindow() {
        Window window = getWindow();
        // 必须先触发 decorView 创建：PhoneWindow.getInsetsController() 在 decor 还没建好时会 NPE。
        window.getDecorView();
        window.setBackgroundDrawable(new ColorDrawable(Color.BLACK));
        // 背屏是常驻歌词显示，亮屏期间不该跟着息屏策略黑掉。
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // 背景要铺满整块屏（含左侧摄像头竖带），所以内容必须允许画进挖孔区。
        // ALWAYS 是 API 30 才有的常量，28/29 只能用 SHORT_EDGES 近似。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            window.setAttributes(attributes);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attributes);
        }
        applyImmersive();
    }

    /** 收起系统栏，让 WebView 铺满背屏。 */
    private void applyImmersive() {
        try {
            View decor = getWindow().getDecorView();
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && getWindow().getInsetsController() != null) {
                getWindow().setDecorFitsSystemWindows(false);
                getWindow().getInsetsController().hide(android.view.WindowInsets.Type.systemBars());
                getWindow().getInsetsController().setSystemBarsBehavior(
                        android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } catch (Throwable error) {
            Log.w(TAG, "收起系统栏失败: " + error.getMessage());
        }
    }

    /** 根布局：黑底 FrameLayout + WebView + 左侧触摸屏蔽条 + 兜底退出按钮。 */
    private View buildContentView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        configureWebView(webView.getSettings());
        webView.setWebViewClient(buildWebViewClient());
        webView.addJavascriptInterface(new RearLyricsHost(this), JS_HOST_NAME);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // 左侧摄像头竖带：整条不可触摸。放在 WebView 之上，直接吃掉这一条的触摸事件。
        View shield = new View(this);
        shield.setClickable(true);
        shield.setFocusable(true);
        shield.setContentDescription("背屏摄像头区域");
        root.addView(shield, new FrameLayout.LayoutParams(
                safeLeftPx, ViewGroup.LayoutParams.MATCH_PARENT));

        root.addView(buildFallbackExitButton(), buildExitButtonParams());

        webView.loadUrl(buildRearUrl());
        scheduleFallbackExit();
        return root;
    }

    /**
     * 背屏页地址。
     *
     * <p>安全带宽度与屏幕物理宽度都以查询参数传进去，页面自己换算 CSS px，
     * 避免把 280 这种物理像素常量写进前端样式。
     */
    private String buildRearUrl() {
        return REAR_ORIGIN + "/index.html?rear=1"
                + "&safeLeftPx=" + safeLeftPx
                + "&physicalWidthPx=" + physicalWidthPx()
                + "&cornerRadiusPx=" + cornerRadiusPx;
    }

    /**
     * 兜底退出按钮：页面 8 秒还没 ready（比如资源没打进包）时露出来，避免背屏被卡住没法退出。
     *
     * <p>页面正常加载后由 {@link #markPageReady()} 永久隐藏 —— 正常运行时退出入口在页面自己的控制栏里。
     */
    private View buildFallbackExitButton() {
        TextView exit = new TextView(this);
        exit.setText("✕");
        exit.setTextColor(Color.parseColor("#CCFFFFFF"));
        exit.setTextSize(14f);
        exit.setGravity(Gravity.CENTER);
        exit.setBackgroundColor(Color.parseColor("#33FFFFFF"));
        exit.setClickable(true);
        exit.setContentDescription("退出背屏歌词");
        exit.setVisibility(View.GONE);
        exit.setOnClickListener(view -> finish());
        fallbackExitButton = exit;
        return exit;
    }

    private FrameLayout.LayoutParams buildExitButtonParams() {
        int size = dpToPx(EXIT_BUTTON_DP);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(size, size);
        params.gravity = Gravity.TOP | Gravity.END;
        params.topMargin = dpToPx(6);
        params.rightMargin = dpToPx(6);
        return params;
    }

    private void scheduleFallbackExit() {
        if (webView == null) {
            return;
        }
        webView.postDelayed(() -> {
            if (!pageReady && fallbackExitButton != null && !isFinishing()) {
                Log.w(TAG, "页面 " + FALLBACK_EXIT_DELAY_MS + "ms 未就绪，显示兜底退出按钮");
                fallbackExitButton.setVisibility(View.VISIBLE);
            }
        }, FALLBACK_EXIT_DELAY_MS);
    }

    /** 页面 ready() 后：撤掉兜底按钮并允许推送。 */
    private void markPageReady() {
        pageReady = true;
        if (fallbackExitButton != null) {
            fallbackExitButton.setVisibility(View.GONE);
        }
    }

    /** 背屏 WebView 配置：与主界面同一套视口策略，CSS 像素 = dp，前端样式才能直接复用。 */
    private void configureWebView(WebSettings settings) {
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(100);
        // 封面图 / 本地服务是 http，页面本体是 https，默认会被当混合内容拦掉。
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }

    /**
     * 用 WebViewAssetLoader 把 https://localhost 映射到 assets/public。
     *
     * <p>这样背屏页和 Capacitor 主界面同源（同样的 localStorage / IndexedDB），
     * 页面可以读到主界面持久化的主题与效果设置，不需要额外同步。
     */
    private WebViewClient buildWebViewClient() {
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("localhost")
                .addPathHandler("/", path -> {
                    try {
                        // path 是 PathMatcher 去掉前缀后剩下的部分，不同 androidx 版本给的形态不一样
                        // （可能带前导 "/"，也可能不带）。这里统一补上再拼 assets 目录，
                        // 否则会拼出 "publicindex.html" 这种路径，导航直接变成 net error 页。
                        String assetPath = path.startsWith("/") ? path : "/" + path;
                        return new WebViewAssetLoader.AssetsPathHandler(this).handle("/public" + assetPath);
                    } catch (Throwable error) {
                        Log.w(TAG, "读取本地资源失败 " + path + ": " + error.getMessage());
                        return null;
                    }
                })
                .build();

        return new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return assetLoader.shouldInterceptRequest(android.net.Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                // 页面重载意味着 window.__foliaRear 没了，先按离线处理；ready() 会重新打开推流。
                pageReady = false;
                RearLyricsChannel.onRearInactive("page started");
                scheduleFallbackExit();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "背屏页加载完成: " + url);
            }
        };
    }

    /** 页面 ready() 回调；由 {@link RearLyricsChannel} 在主线程调用。 */
    void onPageReadyFromJs() {
        markPageReady();
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }
}
