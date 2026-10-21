package top.izuna.foliamajor.rear;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

// 当前文件：背屏歌词的数据中转站（主屏 WebView <-> 原生 <-> 背屏 WebView）。
//
// 两个 WebView 是不同的 JS 上下文，互相看不见对方的内存状态，所以中间由这一层做三件事：
//   1) 主屏推来的快照缓存一份，背屏页 ready() 时补推，避免「页面比推送慢一步」丢首帧；
//   2) 把快照转发给背屏 WebView（evaluateJavascript 调 window.__foliaRear.push）；
//   3) 把背屏发来的指令转发给主屏的 Capacitor 插件（exit 例外，原生直接关页）。
//
// 这里只做转发与缓存，不做任何业务判断。

/**
 * 背屏歌词通道。
 *
 * <p>全部方法都可在任意线程调用，内部自己切主线程。
 */
final class RearLyricsChannel {

    private static final String TAG = "FoliaRearChannel";

    /** 三种快照的 kind，与前端 RearLyricsPushKind 一致。 */
    static final String KIND_CONFIG = "config";
    static final String KIND_CLOCK = "clock";
    static final String KIND_AUDIO = "audio";

    private static final String[] ALL_KINDS = {KIND_CONFIG, KIND_CLOCK, KIND_AUDIO};

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    /** 最近一次收到的三份快照；背屏页 ready() 时原样补推。 */
    private static final Map<String, String> LAST_SNAPSHOT = new ConcurrentHashMap<>();

    private static WeakReference<RearLyricsActivity> rearActivity = new WeakReference<>(null);

    private RearLyricsChannel() {
    }

    /** 背屏页创建时登记，用于把快照推过去。 */
    static void attach(RearLyricsActivity activity) {
        rearActivity = new WeakReference<>(activity);
    }

    /** 背屏页销毁时注销。 */
    static void detach(RearLyricsActivity activity) {
        if (rearActivity.get() == activity) {
            rearActivity = new WeakReference<>(null);
        }
    }

    /** 主屏推来一份快照：先缓存，再转发给背屏页（背屏不在线时只缓存）。 */
    static void pushSnapshot(String kind, String json) {
        if (kind == null || json == null) {
            return;
        }
        LAST_SNAPSHOT.put(kind, json);

        RearLyricsActivity activity = rearActivity.get();
        if (activity == null) {
            return;
        }
        MAIN.post(() -> activity.pushSnapshot(kind, json));
    }

    /** 背屏页 JS 就绪：标记可推送、补推缓存快照，并通知主屏开始推流。 */
    static void onRearReady(RearLyricsActivity activity) {
        MAIN.post(() -> {
            activity.onPageReadyFromJs();
            for (String kind : ALL_KINDS) {
                String cached = LAST_SNAPSHOT.get(kind);
                if (cached != null) {
                    activity.pushSnapshot(kind, cached);
                }
            }
        });
        Log.i(TAG, "背屏页已就绪，通知主屏开始推流");
        RearProjectionPlugin.dispatchRearState(true);
    }

    /** 背屏页开始加载或 Activity 销毁：通知主屏停推（页面重载后 ready() 会再打开）。 */
    static void onRearInactive(String reason) {
        Log.i(TAG, "背屏页离线: " + reason);
        RearProjectionPlugin.dispatchRearState(false);
    }

    /** 页面主动请求快照。 */
    static void replayToRear(RearLyricsActivity activity) {
        MAIN.post(() -> {
            for (String kind : ALL_KINDS) {
                String cached = LAST_SNAPSHOT.get(kind);
                if (cached != null) {
                    activity.pushSnapshot(kind, cached);
                }
            }
        });
    }

    /**
     * 背屏页发来的指令。
     *
     * <p>{@code exit} 由原生直接处理（关掉背屏页），其余原样转给主屏。
     */
    static void handleCommandFromRear(RearLyricsActivity activity, String json) {
        if (json == null || json.isEmpty()) {
            return;
        }

        String type = null;
        try {
            type = new JSONObject(json).optString("type", null);
        } catch (Throwable error) {
            Log.w(TAG, "解析背屏指令失败: " + error.getMessage());
            return;
        }

        if ("exit".equals(type)) {
            Log.i(TAG, "背屏页请求退出");
            MAIN.post(activity::finish);
            return;
        }

        final String payload = json;
        MAIN.post(() -> RearProjectionPlugin.dispatchCommand(payload));
    }
}