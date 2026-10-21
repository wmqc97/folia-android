package top.izuna.foliamajor.rear;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

// 当前文件：外部程序开关背屏歌词的广播入口。
//
// 用法（完整清单见 docs/背屏歌词适配方案.md 第 14 节）：
//   adb shell am broadcast -a top.izuna.foliamajor.rear.START -n top.izuna.foliamajor/.rear.RearLyricsControlReceiver
//
// 这里不复制任何投屏逻辑，只把广播翻译成 RearProjectionController 的 start / stop，
// 和主界面按钮走同一条路；界面上的「显示中 / 未开启」标签由 RearLyricsChannel 的事件推回去。

/**
 * 外部控制背屏歌词的广播接收器（Tasker / MacroDroid / adb / 其它 App）。
 *
 * <p>刻意 {@code exported="true"}：不导出外部程序就调用不到。能调用它的程序最多只能开关背屏投屏，
 * 真正的投屏动作仍受 Shizuku / root 特权限制，所以这里不额外加签名级权限（加了 Tasker 就发不进来）。
 */
public class RearLyricsControlReceiver extends BroadcastReceiver {

    private static final String TAG = "FoliaRearControl";

    /** 开启背屏歌词。 */
    public static final String ACTION_START = "top.izuna.foliamajor.rear.START";
    /** 关闭背屏歌词。 */
    public static final String ACTION_STOP = "top.izuna.foliamajor.rear.STOP";
    /** 切换：正在投屏就关，没投屏就开。 */
    public static final String ACTION_TOGGLE = "top.izuna.foliamajor.rear.TOGGLE";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) {
            return;
        }

        final Context appContext = context.getApplicationContext();
        if (ACTION_START.equals(action)) {
            Log.i(TAG, "外部请求：开启背屏歌词");
            RearProjectionController.start(appContext, (success, usedPlaceholder, message) ->
                    Log.i(TAG, "外部开启结果 success=" + success + " placeholder=" + usedPlaceholder + " / " + message));
            return;
        }

        if (ACTION_STOP.equals(action)) {
            Log.i(TAG, "外部请求：关闭背屏歌词");
            RearProjectionController.stop(appContext, (success, usedPlaceholder, message) -> {
                Log.i(TAG, "外部关闭结果 success=" + success + " / " + message);
                // 立刻让主界面把「显示中」的标签收回去，不必等背屏页卸载事件。
                RearProjectionPlugin.dispatchRearState(false);
            });
            return;
        }

        if (ACTION_TOGGLE.equals(action)) {
            // isProjecting 要跑 `am stack list` 子进程，放在主线程会卡住接收器，必须换线程。
            new Thread(() -> {
                boolean projecting = RearProjectionController.isProjecting(appContext);
                Log.i(TAG, "外部请求：切换背屏歌词，当前 projecting=" + projecting);
                Intent forward = new Intent(intent).setAction(projecting ? ACTION_STOP : ACTION_START);
                onReceive(appContext, forward);
            }, "folia-rear-toggle").start();
        }
    }
}
