import { omni } from '../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import { isCapacitorAndroid } from './runtime';

// src/platform/restoreProviderAuth.ts
//
// 安卓端启动时的音源登录态恢复。
//
// 关键：**必须等后端就绪后再恢复**。bootstrap 极早期调用时，本地 Node 后端
// 还没起来（要解包/启动，需要几秒到几十秒），getLoginStatus 会失败 →
// 表现为"重启后 QQ/波点显示未登录"。
// 所以这里先轮询等后端有响应，再逐一恢复各音源的登录态。

export const restoreProviderAuth = async (): Promise<void> => {
  if (!isCapacitorAndroid()) return;
  console.log('[AuthRestore] 启动恢复流程开始');

  // [folia] 原生桥架构：没有本地 Node 后端，登录态经原生桥（CookieManager）直接读取，
  // 无需等待——立即恢复。

  const tasks: Array<{ providerId: 'bodian' | 'qq' | 'kugou'; label: string }> = [
    { providerId: 'bodian', label: '波点' },
    { providerId: 'qq', label: 'QQ 音乐' },
    // 酷狗：重启后头像不显示 —— 账号 store 里存的是**上次会话的头像 URL**，
    // 酷狗头像链接带签名会过期。启动时重新拉取 user_detail 拿新鲜头像。
    { providerId: 'kugou', label: '酷狗' },
  ];

  for (const { providerId, label } of tasks) {
    try {
      const user = await omni.getLoginStatus(providerId);
      if (!user) {
        console.log(`[AuthRestore] ${label}: 未登录`);
        continue;
      }
      const store = useOnlineProviderAccountStore.getState();
      const existing = store.accounts[providerId]?.user;
      if (existing && String(existing.id) === String((user as { id?: unknown }).id)) {
        console.log(`[AuthRestore] ${label}: 账号状态已一致，跳过`);
        continue;
      }
      store.updateAccount(providerId, {
        status: 'authenticated',
        user: user as never,
        hydration: 'ready',
        freshness: 'fresh',
        error: undefined,
      });
      console.log(`[AuthRestore] ${label}: 已恢复登录账号 user=${JSON.stringify(user).slice(0, 300)}`);
    } catch (error) {
      console.log(`[AuthRestore] ${label} 恢复失败:`, error instanceof Error ? error.message : error);
    }
  }
};
