package top.izuna.foliamajor;

import android.util.Base64;
import android.util.Log;
import android.webkit.CookieManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * FoliaBridge：Folia Android 扩展协议的原生网络层。
 * 音源请求与扫码登录全部经由这里（OkHttp + 系统级 CookieManager）发出：
 * - Cookie 由 WebView 的 CookieManager 统一管理，登录态即浏览器级体验；
 * - 重定向手动跟随，每一跳的 Set-Cookie 都写入 CookieManager 并回传给 WebView；
 * - 支持 binary 返回（base64），用于二维码 PNG 等二进制响应。
 */
@CapacitorPlugin(name = "FoliaBridge")
public class FoliaBridgePlugin extends Plugin {

    private final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .writeTimeout(90, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .build();

    /**
     * 单个响应体的内存上限。
     *
     * 原生桥没有流式通道：整包读进 ByteArrayOutputStream，再 base64（膨胀 4/3）成 String 交给 JS。
     * 一次 34MB 的音频/FLAC 就会变成 45MB 的字符串分配，在 256MB 堆上直接 OOM —— 真机
     * （Xiaomi 2509FPN0BC / Android 17）就是这样闪退的：FATAL EXCEPTION: CapacitorPlugins，
     * java.lang.OutOfMemoryError at Base64.encodeToString ← executeWithRedirects。
     * 超过上限就抛错，由 Web 侧的 fetch shim 回退到浏览器 fetch，而不是把进程打死。
     */
    private static final int MAX_BODY_BYTES = 8 * 1024 * 1024;

    /** 有上限地读完响应体；超过 MAX_BODY_BYTES 直接抛，绝不把大对象搬进堆。 */
    private byte[] readCappedBody(ResponseBody body) throws java.io.IOException {
        if (body == null) return new byte[0];
        long declared = body.contentLength();
        if (declared > MAX_BODY_BYTES) {
            throw new java.io.IOException("response too large: " + declared + " bytes (limit " + MAX_BODY_BYTES + ")");
        }
        InputStream in = body.byteStream();
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream(declared > 0 ? (int) declared : 8192);
            byte[] buffer = new byte[8192];
            int read;
            int total = 0;
            while ((read = in.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BODY_BYTES) {
                    throw new java.io.IOException("response too large: over " + MAX_BODY_BYTES + " bytes");
                }
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        } finally {
            try { in.close(); } catch (Exception ignored) { }
        }
    }

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("FoliaBridge.request requires url");
            return;
        }
        String method = call.getString("method", "GET");
        String body = call.getString("body");
        boolean binary = Boolean.TRUE.equals(call.getBoolean("binary"));
        int timeoutMs = call.getInt("timeoutMs", 60000);
        boolean followRedirects = !Boolean.FALSE.equals(call.getBoolean("followRedirects"));
        JSObject headers = call.getObject("headers");

        getBridge().execute(() -> {
            try {
                call.resolve(executeWithRedirects(url, method, body, headers, binary, timeoutMs, followRedirects));
            } catch (Exception e) {
                // 记下是哪个 URL 把桥搞失败了（超限时能直接看出是哪类请求在搬大包）
                Log.w("FoliaBridge", "request failed url=" + url + " :: " + e);
                call.reject("FoliaBridge request failed: " + e.getMessage(), e);
            }
        });
    }

    private JSObject executeWithRedirects(String url, String method, String body, JSObject headerObject,
                                          boolean binary, int timeoutMs, boolean followRedirects) throws Exception {
        String currentUrl = url;
        String currentMethod = method;
        String currentBody = body;
        JSObject lastHeaders = new JSObject();
        java.util.List<String> setCookies = new java.util.ArrayList<>();

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);

        for (int hop = 0; hop < 8; hop++) {
            Map<String, String> headerMap = new HashMap<>();
            if (headerObject != null) {
                java.util.Iterator<String> keyIterator = headerObject.keys();
                while (keyIterator.hasNext()) {
                    String key = keyIterator.next();
                    Object value = headerObject.opt(key);
                    if (value != null) {
                        headerMap.put(key, String.valueOf(value));
                    }
                }
            }
            // 浏览器级 Cookie：没有显式 Cookie 头时自动附加 CookieManager 中该域的会话
            if (!headerMap.containsKey("Cookie") && !headerMap.containsKey("cookie")) {
                String cookies = cookieManager.getCookie(currentUrl);
                if (cookies != null && !cookies.isEmpty()) {
                    headerMap.put("Cookie", cookies);
                }
            }

            Request.Builder builder = new Request.Builder().url(currentUrl);
            for (Map.Entry<String, String> entry : headerMap.entrySet()) {
                builder.header(entry.getKey(), entry.getValue());
            }
            boolean hasBody = currentBody != null
                    && ("POST".equalsIgnoreCase(currentMethod) || "PUT".equalsIgnoreCase(currentMethod)
                    || "PATCH".equalsIgnoreCase(currentMethod) || "DELETE".equalsIgnoreCase(currentMethod));
            if (hasBody) {
                String contentType = headerMap.getOrDefault("Content-Type",
                        headerMap.getOrDefault("content-type", "application/x-www-form-urlencoded"));
                builder.method(currentMethod.toUpperCase(),
                        RequestBody.create(MediaType.parse(contentType), currentBody.getBytes("UTF-8")));
            } else {
                builder.method(currentMethod.toUpperCase(), null);
            }

            OkHttpClient scoped = client.newBuilder()
                    .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                    .build();
            Response response = scoped.newCall(builder.build()).execute();
            try {
                // 记录并同步 Set-Cookie 到 CookieManager（跨跳保持会话）
                for (String setCookie : response.headers("Set-Cookie")) {
                    try {
                        cookieManager.setCookie(currentUrl, setCookie);
                    } catch (Exception ignored) {
                    }
                    setCookies.add(setCookie);
                }
                lastHeaders = new JSObject();
                for (Map.Entry<String, java.util.List<String>> entry : response.headers().toMultimap().entrySet()) {
                    String name = entry.getKey();
                    if ("set-cookie".equalsIgnoreCase(name) || entry.getValue().isEmpty()) continue;
                    lastHeaders.put(name, entry.getValue().get(0));
                }

                if (followRedirects && response.isRedirect()) {
                    String location = response.header("Location");
                    if (location != null) {
                        currentUrl = new java.net.URL(new java.net.URL(currentUrl), location).toString();
                        if ("POST".equalsIgnoreCase(currentMethod) && response.code() != 307 && response.code() != 308) {
                            currentMethod = "GET";
                            currentBody = null;
                        }
                        continue;
                    }
                }

                JSObject result = new JSObject();
                result.put("status", response.code());
                result.put("headers", lastHeaders);
                if (!setCookies.isEmpty()) {
                    JSArray arr = new JSArray();
                    for (String part : setCookies) arr.put(part);
                    result.put("setCookies", arr);
                }
                byte[] bodyBytes = readCappedBody(response.body());
                if (binary) {
                    result.put("bodyBase64", Base64.encodeToString(bodyBytes, Base64.NO_WRAP));
                } else {
                    result.put("body", new String(bodyBytes, "UTF-8"));
                }
                cookieManager.flush();
                return result;
            } finally {
                response.close();
            }
        }
        throw new Exception("too many redirects");
    }
}
