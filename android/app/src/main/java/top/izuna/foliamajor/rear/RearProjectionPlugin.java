package top.izuna.foliamajor.rear;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.display.DisplayManager;
import android.util.Log;
import android.view.Display;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;

import rikka.shizuku.Shizuku;

// 当前文件：背屏投屏的 Capacitor 插件，把原生投屏能力暴露给前端。
//
// 前端只需要三件事：查状态、开投屏、关投屏。特权授权（Shizuku）也在这里发起，
// 因为 Android 侧只有 Activity 能拉起 Shizuku 的授权弹窗。
//
// 注意：所有会启动子进程的动作（探测 root、am stack list）都交给
// RearProjectionController 的后台线程执行，插件方法本身不在主线程做阻塞操作。

/**
 * 背屏投屏插件（JS 侧名字：{@code RearProjection}）。
 *
 * <p>真正的投屏逻辑在 {@link RearProjectionController}，本类只做参数校验与结果封装。
 */
@CapacitorPlugin(name = "RearProjection")
public class RearProjectionPlugin extends Plugin {

    private static final String TAG = "FoliaRearPlugin";

    /** Shizuku 授权请求码，回调里用它过滤无关结果。 */
    private static final int SHIZUKU_REQUEST_CODE = 0x5201;

    /**
     * 主屏那一侧（Capacitor 主 Bridge）的插件实例。
     *
     * <p>背屏是另一个 Activity、另一个 WebView，它发来的指令必须回到主 Bridge 才能落到主界面的
     * store 上，所以这里留一个弱引用给 {@link RearLyricsChannel} 用。
     */
    private static WeakReference<RearProjectionPlugin> mainSideInstance = new WeakReference<>(null);

    private final Shizuku.OnRequestPermissionResultListener permissionListener =
            (requestCode, grantResult) -> {
                if (requestCode != SHIZUKU_REQUEST_CODE) {
                    return;
                }
                JSObject payload = new JSObject();
                payload.put("granted", grantResult == PackageManager.PERMISSION_GRANTED);
                notifyListeners("privilegeResult", payload);
            };

    @Override
    public void load() {
        mainSideInstance = new WeakReference<>(this);
        try {
            Shizuku.addRequestPermissionResultListener(permissionListener);
        } catch (Throwable error) {
            // Shizuku 未安装 / 未启动时这里可能抛错，不影响插件其余功能。
            Log.w(TAG, "注册 Shizuku 授权回调失败: " + error.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (mainSideInstance.get() == this) {
            mainSideInstance = new WeakReference<>(null);
        }
        try {
            Shizuku.removeRequestPermissionResultListener(permissionListener);
        } catch (Throwable error) {
            Log.w(TAG, "注销 Shizuku 授权回调失败: " + error.getMessage());
        }
        super.handleOnDestroy();
    }

    /** 当前投屏能力与状态汇总，前端用它决定按钮的可用性与文案。 */
    @PluginMethod
    public void getStatus(PluginCall call) {
        RearProjectionController.statusAsync(getContext(), status -> call.resolve(toJson(status)));
    }

    /**
     * 背屏任务是否从最近任务里隐藏（设置卡片里的开关）。
     *
     * <p>值落在原生侧：投屏链路用 `am start` 起 Activity，manifest 里的
     * {@code excludeFromRecents} 不能动态改，只能由这里记住偏好、启动时按需附加标记。
     */
    @PluginMethod
    public void setHideRearTask(PluginCall call) {
        boolean hidden = Boolean.TRUE.equals(call.getBoolean("hidden", Boolean.TRUE));
        RearTaskRecentsPreference.write(getContext(), hidden);
        JSObject result = new JSObject();
        result.put("hidden", hidden);
        call.resolve(result);
    }

    /** 开始投屏：把背屏歌词页投到 display 1。 */
    @PluginMethod
    public void startProjection(PluginCall call) {
        if (!hasRearDisplay()) {
            call.reject("当前设备没有检测到背屏");
            return;
        }
        RearProjectionController.start(getContext(), (success, usedPlaceholder, message) -> {
            if (!success) {
                call.reject(message, message);
                return;
            }
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("usedPlaceholder", usedPlaceholder);
            result.put("message", message);
            result.put("projecting", true);
            call.resolve(result);
        });
    }

    /** 停止投屏：关掉背屏上的歌词任务。 */
    @PluginMethod
    public void stopProjection(PluginCall call) {
        RearProjectionController.stop(getContext(), (success, usedPlaceholder, message) -> {
            JSObject result = new JSObject();
            result.put("success", success);
            result.put("message", message);
            result.put("projecting", false);
            call.resolve(result);
        });
    }

    /**
     * 申请特权通道。
     *
     * <p>已有 root 或已授权 Shizuku 时直接返回现状；否则拉起 Shizuku 授权弹窗，
     * 授权结果通过 {@code privilegeResult} 事件回传前端。
     */
    @PluginMethod
    public void requestPrivilege(PluginCall call) {
        RearProjectionController.statusAsync(getContext(), status -> {
            JSObject result = toJson(status);
            if ("root".equals(status.channel)) {
                result.put("requested", false);
                call.resolve(result);
                return;
            }
            if (!Shizuku.pingBinder()) {
                call.reject("Shizuku 服务未运行，请先打开 Shizuku 并启动服务");
                return;
            }
            if (Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED) {
                result.put("requested", false);
                call.resolve(result);
                return;
            }
            if (Shizuku.shouldShowRequestPermissionRationale()) {
                call.reject("Shizuku 权限已被拒绝，请在 Shizuku 应用里手动授权 Folia");
                return;
            }
            Shizuku.requestPermission(SHIZUKU_REQUEST_CODE);
            result.put("requested", true);
            call.resolve(result);
        });
    }

    /** 打开 Shizuku 应用，方便用户启动服务或手动授权。 */
    @PluginMethod
    public void openShizukuSettings(PluginCall call) {
        try {
            Intent intent = getContext().getPackageManager()
                    .getLaunchIntentForPackage("moe.shizuku.privileged.api");
            if (intent == null) {
                call.reject("没有安装 Shizuku");
                return;
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("打开 Shizuku 失败: " + error.getMessage(), error);
        }
    }

    /**
     * 主屏推一份背屏快照。
     *
     * <p>载荷已经在前端序列化成 JSON 字符串，原生不做解析，直接缓存并转发给背屏 WebView。
     * 这样 config 里的 data URL 图片、tuning 结构都不会在原生侧被改形。
     */
    @PluginMethod
    public void publishSnapshot(PluginCall call) {
        String kind = call.getString("kind");
        String json = call.getString("json");
        if (kind == null || json == null) {
            call.reject("缺少 kind 或 json");
            return;
        }
        RearLyricsChannel.pushSnapshot(kind, json);
        call.resolve();
    }

    /** 原生 -> 主屏：背屏歌词页在线状态。由 {@link RearLyricsChannel} 调用，可能来自任意线程。 */
    static void dispatchRearState(boolean active) {
        RearProjectionPlugin instance = mainSideInstance.get();
        if (instance == null) {
            Log.w(TAG, "主屏插件实例已不存在，丢弃 rearState=" + active);
            return;
        }
        JSObject payload = new JSObject();
        payload.put("active", active);
        // retainUntilConsumed：主界面还没注册监听时也保留一条，避免首帧状态丢失。
        instance.notifyListeners("rearState", payload, true);
    }

    /**
     * 原生 -> 主屏：背屏发来的指令。
     *
     * <p>不用 retainUntilConsumed：一条迟到的「下一首」比丢一条更糟。
     */
    static void dispatchCommand(String json) {
        RearProjectionPlugin instance = mainSideInstance.get();
        if (instance == null) {
            Log.w(TAG, "主屏插件实例已不存在，丢弃背屏指令");
            return;
        }
        JSObject payload = new JSObject();
        payload.put("json", json);
        instance.notifyListeners("command", payload);
    }

    /** 把原生状态快照转成 JS 对象。 */
    private JSObject toJson(RearProjectionController.Status status) {
        JSObject result = new JSObject();
        result.put("supported", hasRearDisplay());
        result.put("channel", status.channel);
        result.put("privileged", status.privileged);
        result.put("projecting", status.projecting);
        result.put("safeLeftPx", RearDisplayCommands.SAFE_LEFT_PX);
        return result;
    }

    /** 设备是否存在背屏（小米背屏固定为 displayId 1）。 */
    private boolean hasRearDisplay() {
        try {
            Context context = getContext();
            DisplayManager manager =
                    (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
            if (manager == null) {
                return false;
            }
            for (Display display : manager.getDisplays()) {
                if (display.getDisplayId() == RearDisplayCommands.REAR_DISPLAY_ID) {
                    return true;
                }
            }
        } catch (Throwable error) {
            Log.w(TAG, "检测背屏失败: " + error.getMessage());
        }
        return false;
    }
}
