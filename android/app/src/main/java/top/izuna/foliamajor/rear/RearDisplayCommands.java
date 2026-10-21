package top.izuna.foliamajor.rear;

import android.util.Log;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

// 当前文件：Folia 安卓版背屏投屏的 shell 命令封装与 am stack list 解析。
//
// 命令形态与解析规则对齐 MiRoot：
//   - rear/RearProjectionLaunchSequence.kt（直启优先 + 占位迁屏）
//   - rear/RearProjectionManager.kt（RootTask 解析）

/**
 * 背屏（display 1）相关的 shell 命令构造与输出解析。
 *
 * <p>所有方法都会阻塞，必须在后台线程调用。
 */
final class RearDisplayCommands {

    private static final String TAG = "FoliaRearCommands";

    /** 小米背屏的 displayId，本机实测为 1。 */
    static final int REAR_DISPLAY_ID = 1;
    /** 主屏 displayId。 */
    static final int MAIN_DISPLAY_ID = 0;

    /**
     * 背屏左侧摄像头竖带的宽度（物理像素），主歌词必须避开这条带子。
     *
     * <p>真机实测（背屏 976x596，屏幕方向 ROTATION_90）：摄像头玻璃的硬边缘在 277px，
     * 系统 cutout 上报 296px（多出的 19px 是镜头圈/安全边距）。这里取硬件硬边缘 277：
     * 换算到 347 CSS 视口是 98px，比系统值多出约 6.8 CSS px 的可用宽度。
     *
     * <p>用固定值而不是解析 DisplayCutout：竖排两个孔已被系统合并成一条竖带，
     * 各家 ROM 上报的 cutout insets 在背屏上不一定可靠，固定值反而稳定。
     */
    static final int SAFE_LEFT_PX = 277;

    /** 传给背屏页的命令参数名（`am start ... --es folia.rear.cmd finish`）。 */
    static final String REAR_COMMAND_EXTRA = "folia.rear.cmd";
    /** {@link #REAR_COMMAND_EXTRA} 的取值：让背屏页自己关闭。 */
    static final String COMMAND_FINISH = "finish";

    /** 官方背屏中心的包名（背屏默认时钟 / 能效标识 / 应用列表都是它）。 */
    static final String OFFICIAL_SUBSCREEN_PACKAGE = "com.xiaomi.subscreencenter";
    /** 官方背屏中心的启动 Activity。 */
    static final String OFFICIAL_SUBSCREEN_LAUNCHER =
            OFFICIAL_SUBSCREEN_PACKAGE + "/.SubScreenLauncher";

    /** RootTask 行里的 displayId：`RootTask id=3888 bounds=[...] displayId=0 userId=0`。 */
    private static final Pattern ROOT_TASK_DISPLAY = Pattern.compile("RootTask id=\\d+.*displayId=(\\d+)");
    /** RootTask 行里的 id（`am stack remove` 用的就是它）。 */
    private static final Pattern ROOT_TASK_ID = Pattern.compile("RootTask id=(\\d+)");
    /** 兜底：任何一行里的 displayId。 */
    private static final Pattern ANY_DISPLAY = Pattern.compile("displayId=(\\d+)");

    /** 按效果复核时的轮询窗口：12 次 x 60ms ≈ 720ms，足够系统把任务变更写进栈快照。 */
    private static final int VERIFY_ATTEMPTS = 12;
    private static final long VERIFY_INTERVAL_MS = 60L;

    private RearDisplayCommands() {
    }

    /** 背屏直启命令。 */
    static String directLaunchCmd(String component) {
        return "am start --display " + REAR_DISPLAY_ID + " -n " + component;
    }

    /**
     * 压掉官方背屏中心。
     *
     * <p>不压掉的话，MIUI 会在背屏空闲/主屏切换应用之后把 {@code SubScreenLauncher} 重新拉到
     * display 1 的前台，把我们的歌词页盖成一张黑屏（真机实测：任务还在，但
     * {@code visible=false}）。MiRoot 的做法就是投屏期间禁用它，退出时再恢复。
     */
    static String suppressOfficialSubscreenCmd() {
        return "pm disable-user --user 0 " + OFFICIAL_SUBSCREEN_PACKAGE
                + "; am force-stop " + OFFICIAL_SUBSCREEN_PACKAGE;
    }

    /**
     * 恢复官方背屏中心，并把它重新拉回背屏，避免退出投屏后背屏空着。
     *
     * <p>幂等：没被禁用过时 `pm enable` 是空操作。
     */
    static String restoreOfficialSubscreenCmd() {
        return "pm enable " + OFFICIAL_SUBSCREEN_PACKAGE
                + "; pm enable " + OFFICIAL_SUBSCREEN_LAUNCHER
                + "; am start --display " + REAR_DISPLAY_ID + " -n " + OFFICIAL_SUBSCREEN_LAUNCHER;
    }

    /**
     * 让已经在背屏上的歌词页自己 finish 的命令（singleInstance 会走 onNewIntent）。
     *
     * <p>作为 `am stack remove` 失败时的兜底：任务删除命令在不同 Android 版本上换过名字，
     * 而 Activity 自己 finish 永远有效。
     */
    static String finishCmd(String component) {
        return "am start --display " + REAR_DISPLAY_ID + " -n " + component
                + " --es " + REAR_COMMAND_EXTRA + " " + COMMAND_FINISH;
    }

    /**
     * 主屏占位命令。
     *
     * <p>必须显式写 --display 0：占位 Activity 一旦被 miui.rear.policy 路由到背屏，
     * 在背屏被系统锁定时会直接 abort，导致整条回退链路失效。
     */
    static String placeholderLaunchCmd(String component) {
        return "am start --display " + MAIN_DISPLAY_ID + " -n " + component;
    }

    /**
     * 把任务迁到指定 display。三级回退，与 MiRoot 的 TaskService 一致。
     *
     * <p>本机（小米 17 Pro Max / Android 17）实测：第 1 种写法已不存在（unknown command），
     * 第 2 种 `am display move-stack` 可用；第 3 种 service call 的事务号在 Android 17 上已变更
     * （50 变成了 moveRootTaskToTaskDisplayArea），只作为老 ROM 兜底保留。
     */
    static boolean moveTaskToDisplay(int taskId, int displayId) {
        if (taskId <= 0) {
            return false;
        }
        String[] candidates = {
                "am task move-task-to-display " + taskId + " " + displayId,
                "am display move-stack " + taskId + " " + displayId,
                "service call activity_task 50 i32 " + taskId + " i32 " + displayId,
        };
        for (String cmd : candidates) {
            PrivilegedShell.run(cmd);
            // 不看退出码，直接按效果复核：任务真的到目标 display 上才算成功。
            // Shizuku 通道上 exit code 不可靠，只有效果是可信的。
            if (waitUntil(() -> isTaskOnDisplay(captureStackList(), taskId, displayId))) {
                Log.d(TAG, "moveTaskToDisplay ok: " + cmd);
                return true;
            }
            Log.d(TAG, "moveTaskToDisplay retry: " + cmd);
        }
        return false;
    }

    /** 某个 taskId 当前是否在指定 display 上。 */
    static boolean isTaskOnDisplay(String stackList, int taskId, int displayId) {
        return findDisplayIdForTask(stackList, taskId) == displayId;
    }

    /** 在 `am stack list` 输出里找 taskId 所在的 displayId；找不到返回 -1。 */
    static int findDisplayIdForTask(String stackList, int taskId) {
        if (stackList == null || stackList.isEmpty() || taskId <= 0) {
            return -1;
        }
        int currentDisplayId = -1;
        for (String rawLine : stackList.split("\n")) {
            String line = rawLine.trim();
            if (line.startsWith("RootTask")) {
                currentDisplayId = parseDisplayId(line);
                continue;
            }
            if (currentDisplayId < 0) {
                continue;
            }
            if (parseTaskId(line) == taskId) {
                return currentDisplayId;
            }
        }
        return -1;
    }

    /** 抓一次 am stack list。 */
    static String captureStackList() {
        return PrivilegedShell.capture("am stack list");
    }

    /** 在指定 display 上查找组件名匹配 grep 的 taskId；找不到返回 -1。 */
    static int findTaskIdOnDisplay(String stackList, int displayId, String componentGrep) {
        TaskRef ref = findTaskOnDisplay(stackList, displayId, componentGrep);
        return ref == null ? -1 : ref.taskId;
    }

    /**
     * 在指定 display 上找匹配组件的任务。
     *
     * <p>同一 display 下取最后一个匹配，等价于栈顶。
     */
    static TaskRef findTaskOnDisplay(String stackList, int displayId, String componentGrep) {
        if (stackList == null || stackList.isEmpty()) {
            return null;
        }
        int rootTaskId = -1;
        boolean inTargetDisplay = false;
        TaskRef found = null;
        for (String rawLine : stackList.split("\n")) {
            String line = rawLine.trim();
            if (line.startsWith("RootTask")) {
                inTargetDisplay = parseDisplayId(line) == displayId;
                rootTaskId = inTargetDisplay ? parseRootTaskId(line) : -1;
                continue;
            }
            if (!inTargetDisplay) {
                continue;
            }
            int taskId = parseTaskId(line);
            if (taskId <= 0) {
                continue;
            }
            String component = parseComponent(line);
            if (component == null) {
                continue;
            }
            if (componentGrep == null || componentGrep.isEmpty() || component.contains(componentGrep)) {
                found = new TaskRef(rootTaskId, taskId);
            }
        }
        return found;
    }

    /** 指定 display 的栈顶组件（`pkg/cls`）；解析失败返回 null。 */
    static String foregroundComponentOnDisplay(String stackList, int displayId) {
        if (stackList == null || stackList.isEmpty()) {
            return null;
        }
        boolean inTargetDisplay = false;
        String last = null;
        for (String rawLine : stackList.split("\n")) {
            String line = rawLine.trim();
            if (line.startsWith("RootTask")) {
                inTargetDisplay = parseDisplayId(line) == displayId;
                continue;
            }
            if (!inTargetDisplay) {
                continue;
            }
            String component = parseComponent(line);
            if (component != null) {
                last = component;
            }
        }
        return last;
    }

    /**
     * 关闭指定 display 上匹配 grep 的任务。
     *
     * <p>优先 `am stack remove`（Android 17 实测可用，参数是 RootTask id）；
     * `am task remove` 在 Android 17 上已不存在，只作为老 ROM 兜底。
     */
    static boolean removeTaskOnDisplay(String stackList, int displayId, String componentGrep) {
        TaskRef ref = findTaskOnDisplay(stackList, displayId, componentGrep);
        if (ref == null) {
            return false;
        }
        if (ref.rootTaskId > 0) {
            PrivilegedShell.run("am stack remove " + ref.rootTaskId);
            if (waitUntil(() -> isTaskGone(displayId, componentGrep))) {
                Log.d(TAG, "removeTaskOnDisplay ok: am stack remove " + ref.rootTaskId);
                return true;
            }
        }
        if (ref.taskId > 0) {
            PrivilegedShell.run("am task remove " + ref.taskId);
            if (waitUntil(() -> isTaskGone(displayId, componentGrep))) {
                Log.d(TAG, "removeTaskOnDisplay ok: am task remove " + ref.taskId);
                return true;
            }
        }
        return false;
    }

    /** 目标组件是否已经不在该 display 上（用于按效果复核关闭结果）。 */
    private static boolean isTaskGone(int displayId, String componentGrep) {
        return findTaskOnDisplay(captureStackList(), displayId, componentGrep) == null;
    }

    /**
     * 轮询等待条件成立。
     *
     * <p>系统把任务变更写进 `am stack list` 快照需要一点时间，命令返回后立刻复核会误判，
     * 所以这里退避重试一小段。
     */
    private static boolean waitUntil(java.util.function.BooleanSupplier condition) {
        for (int attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
            if (condition.getAsBoolean()) {
                return true;
            }
            sleep(VERIFY_INTERVAL_MS);
        }
        return condition.getAsBoolean();
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }

    /** 解析 `RootTask id=3884 bounds=[...] displayId=1 ...` 里的 RootTask id。 */
    private static int parseRootTaskId(String line) {
        Matcher matcher = ROOT_TASK_ID.matcher(line);
        return matcher.find() ? parseIntOr(matcher.group(1), -1) : -1;
    }

    /** 一个任务的两个 id：`am stack remove` 要 RootTask id，`am task` 要 taskId。 */
    static final class TaskRef {
        final int rootTaskId;
        final int taskId;

        TaskRef(int rootTaskId, int taskId) {
            this.rootTaskId = rootTaskId;
            this.taskId = taskId;
        }
    }

    private static int parseDisplayId(String line) {
        Matcher root = ROOT_TASK_DISPLAY.matcher(line);
        if (root.find()) {
            return parseIntOr(root.group(1), -1);
        }
        Matcher any = ANY_DISPLAY.matcher(line);
        if (any.find()) {
            return parseIntOr(any.group(1), -1);
        }
        return -1;
    }

    /** 解析 `  taskId=3888: com.android.settings/com.android.settings.MainSettings ...`。 */
    private static int parseTaskId(String line) {
        int marker = line.indexOf("taskId=");
        if (marker < 0) {
            return -1;
        }
        int start = marker + "taskId=".length();
        int end = start;
        while (end < line.length() && Character.isDigit(line.charAt(end))) {
            end++;
        }
        if (end == start) {
            return -1;
        }
        return parseIntOr(line.substring(start, end), -1);
    }

    /** 解析 taskId 之后的组件名 `pkg/cls`。 */
    private static String parseComponent(String line) {
        int marker = line.indexOf("taskId=");
        if (marker < 0) {
            return null;
        }
        int colon = line.indexOf(':', marker);
        if (colon < 0) {
            return null;
        }
        int start = colon + 1;
        while (start < line.length() && line.charAt(start) == ' ') {
            start++;
        }
        int end = start;
        while (end < line.length()) {
            char c = line.charAt(end);
            if (c == ' ' || c == '\t' || c == '}') {
                break;
            }
            end++;
        }
        if (end <= start) {
            return null;
        }
        String component = line.substring(start, end).trim();
        return component.contains("/") ? component : null;
    }

    private static int parseIntOr(String value, int fallback) {
        try {
            return Integer.parseInt(value.trim());
        } catch (Throwable error) {
            return fallback;
        }
    }
}
