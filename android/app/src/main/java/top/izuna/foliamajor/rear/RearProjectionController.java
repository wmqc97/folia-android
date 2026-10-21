package top.izuna.foliamajor.rear;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// 当前文件：Folia 安卓版背屏投屏的总入口。
//
// 启动序列移植自 MiRoot 的 rear/RearProjectionLaunchSequence.kt：
//   1) 背屏直启（am start --display 1）并验证落屏；
//   2) 失败则主屏透明占位 + 迁屏（moveTaskToDisplay 三级回退）。
// 阶段 1 暂不包含锁屏感知、投屏常亮与官方背屏中心接管，这些留到阶段 4。

/**
 * 背屏投屏控制：启动、停止、状态查询。
 *
 * <p>所有对外方法都是异步的，结果通过 {@link Callback} 回主线程。
 */
final class RearProjectionController {

    private static final String TAG = "FoliaRearProjection";

    /** 直启后验证落屏的轮询窗口：30 次 x 20ms ≈ 600ms（MiRoot 实测值）。 */
    private static final int DIRECT_VERIFY_ATTEMPTS = 30;
    private static final long DIRECT_VERIFY_INTERVAL_MS = 20L;
    /** 主屏占位后查找 taskId 的轮询窗口。 */
    private static final int PLACEHOLDER_POLL_ATTEMPTS = 40;
    private static final long PLACEHOLDER_POLL_INTERVAL_MS = 40L;
    /** 迁屏后确认落屏的轮询窗口。 */
    private static final int MOVE_CONFIRM_ATTEMPTS = 25;
    private static final long MOVE_CONFIRM_INTERVAL_MS = 40L;
    /** 让背屏页自己 finish 后，确认任务已经消失的轮询窗口。 */
    private static final int CLEAR_CONFIRM_ATTEMPTS = 20;
    private static final long CLEAR_CONFIRM_INTERVAL_MS = 60L;

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "folia-rear-projection");
        thread.setDaemon(true);
        return thread;
    });

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private RearProjectionController() {
    }

    /** 投屏结果回调（主线程）。 */
    interface Callback {
        /**
         * @param success          是否成功把背屏歌词页投到背屏
         * @param usedPlaceholder  true 表示走了「主屏占位 + 迁屏」回退
         * @param message          失败原因或状态描述
         */
        void onResult(boolean success, boolean usedPlaceholder, String message);
    }

    /** 背屏歌词 Activity 的组件名。 */
    static String targetComponent(Context context) {
        return context.getPackageName() + "/" + RearLyricsActivity.class.getName();
    }

    /**
     * 描述当前特权通道状态：`root` / `shizuku` / `none`。
     *
     * <p>会启动子进程探测，**只能在后台线程调用**。
     */
    static String privilegeStatus() {
        if (PrivilegedShell.rootAvailable()) {
            return "root";
        }
        if (PrivilegedShell.shizukuReady()) {
            return "shizuku";
        }
        return "none";
    }

    /** 特权通道当前是否可用（Shizuku 已授权，或有 root）。只能在后台线程调用。 */
    static boolean isPrivilegeReady() {
        return !"none".equals(privilegeStatus());
    }

    /** 背屏歌词页当前是否已经在背屏上。只能在后台线程调用（会执行 `am stack list`）。 */
    static boolean isProjecting(Context context) {
        String stackList = RearDisplayCommands.captureStackList();
        return RearDisplayCommands.findTaskIdOnDisplay(
                stackList,
                RearDisplayCommands.REAR_DISPLAY_ID,
                RearLyricsActivity.class.getSimpleName()
        ) > 0;
    }

    /** 投屏状态快照，字段全部在后台线程算好。 */
    static final class Status {
        final String channel;
        final boolean privileged;
        final boolean projecting;

        Status(String channel, boolean privileged, boolean projecting) {
            this.channel = channel;
            this.privileged = privileged;
            this.projecting = projecting;
        }
    }

    /**
     * 后台采集状态，结果回主线程。
     *
     * <p>采集过程要启动 `su` / `am stack list` 子进程，放在主线程会直接卡 UI（甚至 ANR），
     * 所以前端每次查状态都必须走这里。
     */
    static void statusAsync(Context context, java.util.function.Consumer<Status> callback) {
        final Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            String channel = privilegeStatus();
            Status status = new Status(channel, !"none".equals(channel), isProjecting(appContext));
            MAIN.post(() -> callback.accept(status));
        });
    }

    /** 启动投屏：直启优先，失败回退主屏占位 + 迁屏。 */
    static void start(Context context, Callback callback) {
        final Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            String component = targetComponent(appContext);
            boolean usedPlaceholder = false;
            String message;

            if (!isPrivilegeReady()) {
                post(callback, false, false, "没有可用的特权通道：请先启动并授权 Shizuku（或 root）");
                return;
            }

            boolean ok = tryDirectLaunch(component);
            if (!ok) {
                Log.d(TAG, "direct launch failed, falling back to placeholder + move");
                ok = tryPlaceholderMove(component);
                usedPlaceholder = ok;
            }

            if (ok) {
                // 落屏成功后再压掉官方背屏中心，然后立刻再 start 一次我们的页面：
                //   1) 不压掉的话，MIUI 会隔一段时间把 SubScreenLauncher 拉回 display 1，
                //      把歌词页盖成黑屏（真机实测任务还在，但 visible=false）；
                //   2) 压掉它的同时 MIUI 可能顺手把背屏熄掉，重新 start 一次配合 Activity 的
                //      android:turnScreenOn="true" 能把背屏点回来。
                PrivilegedShell.run(RearDisplayCommands.suppressOfficialSubscreenCmd());
                PrivilegedShell.run(RearDisplayCommands.directLaunchCmd(component));
                message = usedPlaceholder ? "已通过主屏占位迁屏投到背屏" : "已直启到背屏";
            } else {
                // 没落屏就不要把官方背屏中心留在禁用状态，否则背屏会空着。
                PrivilegedShell.run(RearDisplayCommands.restoreOfficialSubscreenCmd());
                message = "投屏失败：直启与占位迁屏都没成功";
            }
            Log.i(TAG, "start 结束 ok=" + ok + " placeholder=" + usedPlaceholder + " / " + message);
            post(callback, ok, usedPlaceholder, message);
        });
    }

    /**
     * 停止投屏：关掉背屏上的歌词任务。
     *
     * <p>退出时会把投屏期间压掉的官方背屏中心恢复回来并重新拉到背屏，否则背屏会空着。
     */
    static void stop(Context context, Callback callback) {
        final Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            String stackList = RearDisplayCommands.captureStackList();
            boolean removed = RearDisplayCommands.removeTaskOnDisplay(
                    stackList,
                    RearDisplayCommands.REAR_DISPLAY_ID,
                    RearLyricsActivity.class.getSimpleName()
            );
            if (!removed) {
                // 任务删除命令在不同 Android 版本上换过名字，兜底让背屏页自己 finish。
                PrivilegedShell.run(RearDisplayCommands.finishCmd(targetComponent(appContext)));
                removed = waitForRearCleared(CLEAR_CONFIRM_ATTEMPTS, CLEAR_CONFIRM_INTERVAL_MS);
            }
            PrivilegedShell.run(RearDisplayCommands.restoreOfficialSubscreenCmd());
            post(callback, true, false, removed ? "已退出背屏投屏" : "背屏上没有正在运行的投屏页");
        });
    }

    /** 背屏直启并验证落屏。 */
    private static boolean tryDirectLaunch(String component) {
        PrivilegedShell.run(RearDisplayCommands.directLaunchCmd(component));
        return waitForComponentOnRear(DIRECT_VERIFY_ATTEMPTS, DIRECT_VERIFY_INTERVAL_MS);
    }

    /** 主屏占位 -> 找 taskId -> 迁屏 -> 确认。 */
    private static boolean tryPlaceholderMove(String component) {
        PrivilegedShell.run(RearDisplayCommands.placeholderLaunchCmd(component));
        String grep = RearLyricsActivity.class.getSimpleName();
        int taskId = -1;
        for (int attempt = 0; attempt < PLACEHOLDER_POLL_ATTEMPTS; attempt++) {
            String stackList = RearDisplayCommands.captureStackList();
            taskId = RearDisplayCommands.findTaskIdOnDisplay(
                    stackList,
                    RearDisplayCommands.MAIN_DISPLAY_ID,
                    grep
            );
            if (taskId > 0) {
                break;
            }
            sleep(PLACEHOLDER_POLL_INTERVAL_MS);
        }
        if (taskId <= 0) {
            Log.w(TAG, "placeholder task not found on main display");
            return false;
        }
        if (!RearDisplayCommands.moveTaskToDisplay(taskId, RearDisplayCommands.REAR_DISPLAY_ID)) {
            Log.w(TAG, "moveTaskToDisplay failed for taskId=" + taskId);
            return false;
        }
        return waitForComponentOnRear(MOVE_CONFIRM_ATTEMPTS, MOVE_CONFIRM_INTERVAL_MS);
    }

    /** 轮询 am stack list，确认目标组件已经落在背屏。 */
    private static boolean waitForComponentOnRear(int attempts, long intervalMs) {
        String grep = RearLyricsActivity.class.getSimpleName();
        for (int attempt = 0; attempt < attempts; attempt++) {
            String stackList = RearDisplayCommands.captureStackList();
            int taskId = RearDisplayCommands.findTaskIdOnDisplay(
                    stackList,
                    RearDisplayCommands.REAR_DISPLAY_ID,
                    grep
            );
            if (taskId > 0) {
                Log.d(TAG, "landed on rear display, taskId=" + taskId + " (attempt=" + (attempt + 1) + ")");
                return true;
            }
            sleep(intervalMs);
        }
        return false;
    }

    /** 轮询 am stack list，确认背屏上已经没有我们的投屏页。 */
    private static boolean waitForRearCleared(int attempts, long intervalMs) {
        String grep = RearLyricsActivity.class.getSimpleName();
        for (int attempt = 0; attempt < attempts; attempt++) {
            String stackList = RearDisplayCommands.captureStackList();
            int taskId = RearDisplayCommands.findTaskIdOnDisplay(
                    stackList,
                    RearDisplayCommands.REAR_DISPLAY_ID,
                    grep
            );
            if (taskId <= 0) {
                return true;
            }
            sleep(intervalMs);
        }
        return false;
    }

    private static void post(Callback callback, boolean success, boolean usedPlaceholder, String message) {
        if (callback == null) {
            return;
        }
        MAIN.post(() -> callback.onResult(success, usedPlaceholder, message));
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }
}
