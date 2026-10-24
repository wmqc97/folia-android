// scripts/patch-capacitor-systembars.mjs
// Capacitor 8 的 SystemBars 会在窗口 inset 变化时用 evaluateJavascript 往页面里写
// --safe-area-inset-* 变量；首次回调发生在页面还是 about:blank 的时候，此时
// document.documentElement 是 null，脚本抛 TypeError 并被它自己的 catch 打成
// console.error（logcat 里那串 “Error injecting safe area CSS”）。
// 这里把那四行改成可选链调用：documentElement 还没准备好时静默跳过，下次 inset
// 变化会再写一遍，不影响任何布局。
// 每次 npm install 之后由 package.json 的 postinstall 自动重放，幂等。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = resolve(
  ROOT,
  'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java',
);

if (!existsSync(TARGET)) {
  console.log('[patch-systembars] 跳过：未找到 @capacitor/android 源码（可能还没装依赖）');
  process.exit(0);
}

const source = readFileSync(TARGET, 'utf8');
const FROM = 'document.documentElement.style.setProperty(';
const TO = 'document.documentElement?.style?.setProperty?.(';

if (!source.includes(FROM)) {
  if (source.includes(TO)) console.log('[patch-systembars] 已经是打过补丁的状态');
  else console.log('[patch-systembars] 跳过：上游实现已变化，请人工确认');
  process.exit(0);
}

const patched = source.split(FROM).join(TO);
writeFileSync(TARGET, patched);
console.log(`[patch-systembars] 已打补丁：${patched.split(TO).length - 1} 处 safe-area 写入改为可选链`);
