// src/types/crypto-js.d.ts
// crypto-js 只有 CommonJS 实现、上游也没带 @types —— 原生协议层只用到 MD5/AES 少数入口，
// 这里给一个宽松声明，避免为了几个函数把整包 @types 拖进来。
declare module 'crypto-js';
