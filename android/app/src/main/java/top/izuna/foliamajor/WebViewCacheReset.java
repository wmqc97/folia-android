package top.izuna.foliamajor;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.util.Log;

import java.io.File;

// 当前文件：安卓端「每次安装后清一次 WebView 缓存」的工具。
//
// 为什么需要：
//   1) 老版本 APK 里打包了 PWA Service Worker（vite-plugin-pwa）。SW 会把 index.html 和整包 JS
//      预缓存到 app_webview/Default/Service Worker/CacheStorage；升级安装后新包虽然已经落盘，
//      WebView 的导航请求仍然被旧 SW 从 precache 直接返回 —— 表现就是「装了新版，界面还是旧的」。
//   2) 现在 APK 构建已经不再注册 SW（见 vite.config.ts 的 isCapacitorBuild），但老安装的注册会
//      一直留在设备上，所以要在升级后的第一次启动把它们清掉。
//
// 只在「安装时间变了」的第一次启动执行，并且必须在任何 WebView 被创建之前调用。

/**
 * WebView 缓存清理工具。
 *
 * <p>只删 Service Worker 目录与 HTTP 缓存目录，绝不碰 IndexedDB / Local Storage ——
 * 本地曲库索引和用户设置都在那里。
 */
public final class WebViewCacheReset {

    private static final String TAG = "FoliaNative";

    private static final String PREFS_NAME = "folia_webview_cache_reset";

    private static final String KEY_LAST_UPDATE_TIME = "last_update_time";

    /** 要清掉的目录（相对 app 的 dataDir）。 */
    private static final String[] TARGET_DIRS = {
            // Service Worker 注册信息 + 它自己的 CacheStorage 预缓存。
            "app_webview/Default/Service Worker",
            // WebView 的 HTTP 磁盘缓存。
            "cache/WebView",
    };

    /** 同一进程内只判定一次，避免主屏和背屏两个 Activity 各清一遍。 */
    private static boolean checkedThisProcess = false;

    private WebViewCacheReset() {
    }

    /**
     * 本次安装后的第一次启动清掉 WebView 的 Service Worker 与 HTTP 缓存。
     *
     * <p>必须在 WebView 创建之前调用（也就是 Activity 的 super.onCreate 之前）；
     * 重复调用只会命中一次。
     */
    public static synchronized void resetIfAppUpdated(Context context) {
        if (checkedThisProcess) {
            return;
        }
        checkedThisProcess = true;

        try {
            long lastUpdateTime = resolveLastUpdateTime(context);
            if (lastUpdateTime <= 0L) {
                return;
            }

            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            if (prefs.getLong(KEY_LAST_UPDATE_TIME, -1L) == lastUpdateTime) {
                return;
            }
            prefs.edit().putLong(KEY_LAST_UPDATE_TIME, lastUpdateTime).apply();

            File dataDir = context.getDataDir();
            for (String relativePath : TARGET_DIRS) {
                if (deleteRecursively(new File(dataDir, relativePath))) {
                    Log.i(TAG, "已清理 WebView 缓存目录: " + relativePath);
                }
            }
        } catch (Throwable error) {
            // 清理失败不能影响启动；最坏情况只是这一版界面继续走旧缓存。
            Log.w(TAG, "清理 WebView 缓存失败", error);
        }
    }

    /** 读取安装时间；取不到返回 -1，调用方据此跳过清理。 */
    private static long resolveLastUpdateTime(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return info == null ? -1L : info.lastUpdateTime;
        } catch (Throwable error) {
            Log.w(TAG, "读取安装时间失败", error);
            return -1L;
        }
    }

    /** 递归删除文件或目录；目标不存在时返回 false。 */
    private static boolean deleteRecursively(File file) {
        if (file == null || !file.exists()) {
            return false;
        }
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        return file.delete();
    }
}
