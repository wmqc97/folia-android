package top.izuna.foliamajor.rear;

import android.util.Log;
import android.webkit.JavascriptInterface;

// 当前文件：注入到背屏 WebView 的 JS 宿主对象（页面里的 window.FoliaRear）。
//
// 这些方法都在 JavaBridge 线程执行，所以一律不直接碰 WebView：要么丢给
// RearLyricsChannel（它自己切主线程），要么丢给 Activity 的 runOnUiThread。

/**
 * 背屏页 -> 原生的入口。
 *
 * <p>对应前端 {@code src/services/rearLyricsBridge.ts} 里的 RearLyricsNativeHost。
 */
final class RearLyricsHost {

    private static final String TAG = "FoliaRearHost";

    private final RearLyricsActivity activity;

    RearLyricsHost(RearLyricsActivity activity) {
        this.activity = activity;
    }

    /** 页面 JS 已就绪：原生补推缓存快照，并通知主屏开始推流。 */
    @JavascriptInterface
    public void ready() {
        RearLyricsChannel.onRearReady(activity);
    }

    /**
     * 页面主动要一份快照（比如从后台恢复后自检）。
     *
     * <p>先补推原生缓存的旧快照让页面立刻有内容，再让主屏强制重发一份当前 config：
     * 主屏设置没变时发布器会按签名去重，只靠缓存会一直拿到重载前的旧设置。
     */
    @JavascriptInterface
    public void requestSnapshot() {
        RearLyricsChannel.replayToRear(activity);
        RearProjectionPlugin.dispatchCommand("{\"type\":\"requestSnapshot\"}");
    }

    /** 页面发指令（切歌 / 暂停 / 换效果 / 改字号 / 退出），参数是 JSON 字符串。 */
    @JavascriptInterface
    public void send(String json) {
        RearLyricsChannel.handleCommandFromRear(activity, json);
    }

    /** 页面写日志，方便用 logcat 排查背屏问题。 */
    @JavascriptInterface
    public void log(String message) {
        Log.i(TAG, message == null ? "" : message);
    }
}