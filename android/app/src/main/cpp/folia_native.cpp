// Folia Android 原生模块（NDK / CMake）。
//
// 作用：把 Android NDK 构建链接入本工程，并提供一个可被 Java 调用、可在启动时自证能力的最小
// JNI 入口。当前 WebView 主体并不依赖原生代码，这个模块存在的意义是：
//   1. 让 `ndkVersion` / `externalNativeBuild` / abiFilters 这条链路真正参与编译，而不是摆设；
//   2. 在 logcat（tag=FoliaNative）里输出实际运行的 ABI、核心数与 NEON 支持，便于排查
//      “装错架构 / 模拟器跑的是 x86_64” 这类问题；
//   3. 后续若要接入原生音频处理或 nodejs-mobile 之类的本地运行时，可直接在此扩展。
//
// 实现上刻意不使用 C++ 标准库（只用 libc 的 snprintf），这样不会再静态链入整套 libc++——
// 否则每个 ABI 的 .so 会从几 KB 膨胀到近 1 MB。

#include <jni.h>
#include <stdio.h>
#include <unistd.h>

namespace {

const char* AbiName() {
#if defined(__aarch64__)
  return "arm64-v8a";
#elif defined(__arm__)
  return "armeabi-v7a";
#elif defined(__x86_64__)
  return "x86_64";
#elif defined(__i386__)
  return "x86";
#else
  return "unknown";
#endif
}

const char* NeonSupport() {
#if defined(__aarch64__)
  return "yes";  // AArch64 的 NEON 是强制的
#elif defined(__ARM_NEON) || defined(__ARM_NEON__)
  return "yes";
#else
  return "no";
#endif
}

}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_top_izuna_foliamajor_MainActivity_nativeRuntimeInfo(JNIEnv* env, jclass /*clazz*/) {
  long cores = sysconf(_SC_NPROCESSORS_ONLN);
  if (cores <= 0) {
    cores = 0;
  }

  char info[160];
  snprintf(info, sizeof(info),
           "folia-native/1 abi=%s cores=%ld neon=%s word=%dbit cpp=%ld",
           AbiName(), cores, NeonSupport(),
           static_cast<int>(sizeof(void*) * 8),
           static_cast<long>(__cplusplus));

  return env->NewStringUTF(info);
}
