package top.izuna.foliamajor.rear;

import android.content.Context;
import android.content.SharedPreferences;

// 当前文件：Folia 安卓版「背屏任务是否从最近任务里隐藏」的偏好存储。
//
// 为什么要单独存一份：投屏链路是用 `am start` 起 Activity 的，manifest 里的
// `excludeFromRecents` 编译期就定死了，运行期改不了。所以把用户的开关落在
// SharedPreferences 里，构造启动命令时再按需附加 `--exclude-from-recents`。

/**
 * 背屏任务可见性偏好。
 *
 * <p>默认隐藏（true）：和这个开关加进来之前的行为一致，用户划掉主屏任务时
 * 不会顺手把投屏也带走。
 */
final class RearTaskRecentsPreference {

    private static final String PREFS_NAME = "folia_rear_projection";
    private static final String KEY_HIDE_TASK = "hide_rear_task";

    private RearTaskRecentsPreference() {
    }

    /** 当前是否应该把背屏任务从最近任务里隐藏。 */
    static boolean isHidden(Context context) {
        return prefs(context).getBoolean(KEY_HIDE_TASK, true);
    }

    /** 写入开关。 */
    static void write(Context context, boolean hidden) {
        prefs(context).edit().putBoolean(KEY_HIDE_TASK, hidden).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
