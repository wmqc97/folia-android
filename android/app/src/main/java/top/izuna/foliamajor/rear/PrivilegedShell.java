package top.izuna.foliamajor.rear;

import android.content.pm.PackageManager;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

import rikka.shizuku.Shizuku;

// 当前文件：Folia 安卓版背屏投屏的特权命令执行层。
//
// 背屏投屏依赖 am / service call / pm 这些必须以 shell 或 root 身份执行的命令，
// 普通应用进程没有权限，所以统一从这里走：Root（su -c）优先，失败自动回退 Shizuku。
// 结构移植自 MiRoot 的 capability/PrivilegedShell.kt。

/**
 * 特权 shell 执行入口。
 *
 * <p>本机（Xiaomi 17 Pro Max）实测无 root，因此实际生效的是 Shizuku 通道；
 * 保留 root 分支是为了兼容有 root 的设备，行为与 MiRoot 一致。
 */
final class PrivilegedShell {

    private static final String TAG = "FoliaRearShell";
    /** 单条命令的最长等待时间；投屏链路里的命令都是毫秒级，8 秒足够。 */
    private static final long DEFAULT_TIMEOUT_SECONDS = 8L;
    /** root 探测结果的缓存时长：探测要起一个 su 进程，有 root 的设备上还可能弹授权框。 */
    private static final long ROOT_PROBE_TTL_MS = 30_000L;

    private static volatile boolean rootProbeResult;
    private static volatile long rootProbeAt;

    private PrivilegedShell() {
    }

    /** Shizuku 服务是否在运行，且本应用已被授权。 */
    static boolean shizukuReady() {
        try {
            if (!Shizuku.pingBinder()) {
                return false;
            }
            return Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable error) {
            Log.w(TAG, "shizukuReady failed: " + error.getMessage());
            return false;
        }
    }

    /**
     * Root 是否可用（su 能起来）。
     *
     * <p>结果缓存 30 秒，避免每次查状态都起一个 `su` 子进程。
     */
    static boolean rootAvailable() {
        long now = System.currentTimeMillis();
        if (now - rootProbeAt < ROOT_PROBE_TTL_MS) {
            return rootProbeResult;
        }
        boolean available = probeRoot();
        rootProbeResult = available;
        rootProbeAt = now;
        return available;
    }

    /** 真正执行一次 `su -c id` 探测。 */
    private static boolean probeRoot() {
        try {
            Process process = new ProcessBuilder("su", "-c", "id").redirectErrorStream(true).start();
            boolean ok = process.waitFor(3, TimeUnit.SECONDS) && process.exitValue() == 0;
            if (!ok) {
                process.destroyForcibly();
            }
            return ok;
        } catch (Throwable error) {
            return false;
        }
    }

    /** 执行命令并等待结束；true 表示命令在超时前结束（不看退出码，见下）。 */
    static boolean run(String command) {
        return run(command, DEFAULT_TIMEOUT_SECONDS);
    }

    /**
     * 执行命令并等待结束（带超时）；true 表示命令在超时前结束。
     *
     * <p>不返回退出码：Shizuku 通道上 {@code waitFor} 与 {@code exitValue} 在部分 Android 版本
     * （本机 Android 17 实测）会抛 {@code IllegalArgumentException("process hasn't exited")}，
     * 退出码不可信。命令的成败统一由调用方按“效果”复核（例如再抓一次 `am stack list`）。
     */
    static boolean run(String command, long timeoutSeconds) {
        Process process = null;
        try {
            process = start(command);
            drainAsync(process.getErrorStream());
            // 读到 EOF 即命令结束（stdout 关闭是唯一在两个通道上都可靠的结束信号）。
            boolean finished = readToEnd(process.getInputStream(), timeoutSeconds, command) != null;
            if (!finished) {
                Log.w(TAG, "timeout: " + command);
            }
            return finished;
        } catch (Throwable error) {
            Log.w(TAG, "run failed: " + command + " / " + error);
            return false;
        } finally {
            closeQuietly(process);
        }
    }

    /** 执行命令并返回 stdout；失败返回 null。 */
    static String capture(String command) {
        return capture(command, DEFAULT_TIMEOUT_SECONDS);
    }

    /**
     * 执行命令并返回 stdout（stderr 单独抽干丢弃），带超时；失败返回 null。
     *
     * <p>这里**不看退出码**：Shizuku 通道上 {@code Process.exitValue()} 在进程刚结束时可能抛
     * {@code IllegalArgumentException("process hasn't exited")}，而“读到 EOF”本身就说明命令已经结束，
     * 所以直接把读到的内容当作结果。
     */
    static String capture(String command, long timeoutSeconds) {
        Process process = null;
        try {
            process = start(command);
            drainAsync(process.getErrorStream());
            return readToEnd(process.getInputStream(), timeoutSeconds, command);
        } catch (Throwable error) {
            Log.w(TAG, "capture failed: " + command + " / " + error);
            return null;
        } finally {
            closeQuietly(process);
        }
    }

    /** 读到流结束（EOF）为止；超过 deadline 返回 null。 */
    private static String readToEnd(InputStream input, long timeoutSeconds, String command) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        long deadline = System.currentTimeMillis() + timeoutSeconds * 1000L;
        int read;
        while ((read = input.read(chunk)) > 0) {
            buffer.write(chunk, 0, read);
            if (System.currentTimeMillis() > deadline) {
                Log.w(TAG, "capture timeout: " + command);
                return null;
            }
        }
        return buffer.toString(StandardCharsets.UTF_8.name());
    }

    /**
     * 关闭子进程。
     *
     * <p>Shizuku 的远程进程连 {@code isAlive()} 都可能抛异常（它内部会调用 exitValue），
     * 所以这里不再判断存活状态，直接尝试销毁并吞掉一切异常。
     */
    private static void closeQuietly(Process process) {
        if (process == null) {
            return;
        }
        try {
            process.destroyForcibly();
        } catch (Throwable ignored) {
            // 进程已经退出时不同实现会抛不同异常，忽略即可。
        }
    }

    /**
     * 启动一个特权进程：Root 优先，失败回退 Shizuku。
     *
     * <p>启动子进程会阻塞，必须放在后台线程调用。
     */
    private static Process start(String command) throws Exception {
        Exception rootFailure = null;
        try {
            return new ProcessBuilder("su", "-c", command).redirectErrorStream(true).start();
        } catch (Exception error) {
            rootFailure = error;
        }
        if (!shizukuReady()) {
            throw rootFailure != null ? rootFailure : new IllegalStateException("no privileged channel");
        }
        try {
            return shizukuNewProcess(command);
        } catch (Exception error) {
            if (rootFailure != null) {
                error.addSuppressed(rootFailure);
            }
            throw error;
        }
    }

    /**
     * Shizuku API 13 中 {@code Shizuku.newProcess} 不是 public，沿用 MiRoot 的做法用反射调用。
     */
    private static Process shizukuNewProcess(String command) throws Exception {
        Method method = Shizuku.class.getDeclaredMethod(
                "newProcess",
                String[].class,
                String[].class,
                String.class
        );
        method.setAccessible(true);
        Object result = method.invoke(null, new String[]{"sh", "-c", command}, null, null);
        if (!(result instanceof Process)) {
            throw new IllegalStateException("Shizuku.newProcess returned " + result);
        }
        return (Process) result;
    }

    /** 异步抽干输出流，避免子进程因为缓冲区写满而卡住。 */
    private static void drainAsync(final InputStream stream) {
        if (stream == null) {
            return;
        }
        Thread thread = new Thread(() -> {
            try {
                InputStream input = stream;
                byte[] chunk = new byte[4096];
                while (input.read(chunk) > 0) {
                    // 丢弃输出即可，这里只需要让管道保持流动。
                }
            } catch (Throwable ignored) {
                // 进程结束时流会关闭，属正常。
            }
        }, "folia-rear-drain");
        thread.setDaemon(true);
        thread.start();
    }
}
