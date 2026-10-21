# Folia Android 原生模块 —— NDK / CMake 构建脚本。
#
# 两个产物：
#   libfolia_native.so  自检用的最小 JNI 模块（ABI / CPU 能力）
#   libnode_runner.so   把 nodejs-mobile 的 libnode.so 拉起来的 JNI 启动器
#
# libnode.so 本身不在这里编译，而是以预编译库的形式放在
# app/src/main/jniLibs/<abi>/libnode.so（来自 nodejs-mobile v18.20.4），
# AGP 会负责把它打进 APK，这里只需要在链接期引到它。

cmake_minimum_required(VERSION 3.22.1)

project(folia_native CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# NDK 的 log 库，便于从 Java/logcat 观察原生侧输出。
find_library(log-lib log)

# ---------------- 自检模块 ----------------
add_library(folia_native SHARED
        folia_native.cpp)

target_link_libraries(folia_native
        ${log-lib})

# ---------------- Node 启动器 ----------------
# 预编译的 libnode.so（每个 ABI 一份，AGP 会从 jniLibs 打进 APK）。
add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES
        IMPORTED_LOCATION "${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so")

add_library(node_runner SHARED
        node_runner.cpp)

target_include_directories(node_runner PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/node/include/node")

target_link_libraries(node_runner
        node
        ${log-lib})
