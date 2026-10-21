// 把 nodejs-mobile 的 libnode.so 拉起来：JNI 入口 -> node::Start()。
//
// node::Start() 会阻塞直到 Node 事件循环退出，所以 Java 侧必须在独立线程里调用它。

#include <jni.h>

#include <android/log.h>
#include <node.h>
#include <unistd.h>

#include <string>
#include <vector>

#define LOG_TAG "FoliaNode"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C" JNIEXPORT jint JNICALL
Java_top_izuna_foliamajor_NodeRunner_nativeStartNode(
        JNIEnv* env, jclass /*clazz*/, jstring projectDir, jstring entryScript) {

    const char* dir = env->GetStringUTFChars(projectDir, nullptr);
    const char* entry = env->GetStringUTFChars(entryScript, nullptr);
    if (dir == nullptr || entry == nullptr) {
        LOGE("projectDir / entryScript 参数为空");
        return -1;
    }

    // Node 是按 cwd 解析相对路径的，必须先切到项目目录，否则 require 全部找不到。
    if (chdir(dir) != 0) {
        LOGE("chdir 失败: %s", dir);
    }

    const std::string entryPath = std::string(dir) + "/" + entry;

    std::vector<char*> argv;
    argv.push_back(const_cast<char*>("node"));
    argv.push_back(const_cast<char*>(entryPath.c_str()));
    argv.push_back(nullptr);

    LOGI("启动 Node: cwd=%s entry=%s", dir, entryPath.c_str());

    const int rc = node::Start(static_cast<int>(argv.size()) - 1, argv.data());

    LOGI("Node 已退出，code=%d", rc);

    env->ReleaseStringUTFChars(projectDir, dir);
    env->ReleaseStringUTFChars(entryScript, entry);
    return rc;
}
