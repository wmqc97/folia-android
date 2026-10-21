package top.izuna.foliamajor;

import android.util.Log;

/**
 * 在 App 进程内启动 nodejs-mobile 的 Node 运行时。
 *
 * 这样四个音源后端（网易云 / 酷狗 / QQ / 波点）就能直接跑在手机上，
 * App 通过 http://127.0.0.1:&lt;port&gt; 访问它们 —— 不再需要数据线、
 * adb reverse 或者任何外部服务器。
 *
 * 注意：node::Start() 会阻塞到 Node 退出，所以必须跑在独立线程上，
 * 不能占用 Android 主线程。
 */
public final class NodeRunner {

    private static final String TAG = "FoliaNode";

    /** 是否已经在跑，避免重复启动（重复调用 node::Start 是未定义行为）。 */
    private static volatile boolean started = false;

    static {
        // 注意顺序：node_runner 依赖 libnode.so，但 Android 的动态链接器会自行解析，
        // 这里只需加载我们自己的启动器。
        System.loadLibrary("node_runner");
    }

    private NodeRunner() {
    }

    /** 由 cpp/node_runner.cpp 实现，内部调用 node::Start()。 */
    private static native int nativeStartNode(String projectDir, String entryScript);

    /**
     * 后台线程启动 Node。
     *
     * @param projectDir Node 项目所在目录（必须是真实文件路径，不能是 assets 路径）
     * @param entryScript 入口脚本文件名，例如 "index.js"
     */
    public static synchronized void start(final String projectDir, final String entryScript) {
        if (started) {
            Log.i(TAG, "Node 已在运行，忽略重复启动");
            return;
        }
        started = true;

        Thread thread = new Thread(() -> {
            try {
                Log.i(TAG, "Node 启动中，projectDir=" + projectDir + " entry=" + entryScript);
                int code = nativeStartNode(projectDir, entryScript);
                Log.i(TAG, "Node 已退出，code=" + code);
            } catch (Throwable t) {
                Log.e(TAG, "Node 启动失败", t);
            }
        }, "folia-node");
        thread.setDaemon(true);
        thread.start();
    }
}
