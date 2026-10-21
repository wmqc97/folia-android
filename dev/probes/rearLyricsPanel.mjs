import { chromium } from 'playwright';

// dev/probes/rearLyricsPanel.mjs
//
// 打开背屏设置面板、切到指定页签，截图并量出面板尺寸与滚动量。
// 用来在不动真机的前提下逐页检查背屏面板（242x212 可见区放不放得下、要不要横向滚动）。
// 用法：先 `npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`，再
//   node dev/probes/rearLyricsPanel.mjs <页签> [输出png] [宽] [高]
// 页签：common | background | visualizer（缺省 common）。背屏面板与主屏「歌词效果」同构，
// 只保留这三页，不再有歌词 / 列表 / 控制 / 字幕页。
// 缺省视口 347x212 / dpr 2.8125，就是小米 17 Pro Max 背屏的 WebView 尺寸。

const TAB_IDS = ['common', 'background', 'visualizer'];

const tab = process.argv[2] ?? 'common';
if (!TAB_IDS.includes(tab)) {
    console.error(`未知页签「${tab}」，可选：${TAB_IDS.join(' | ')}`);
    process.exit(1);
}
const out = process.argv[3] ?? `_shots/panel-${tab}.png`;
const width = Number(process.argv[4] ?? 347);
const height = Number(process.argv[5] ?? 212);
const url = 'http://127.0.0.1:4173/dev-probe.html?probe=rearLyrics&safeLeftPx=296&physicalWidthPx=976';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: width > 500 ? 2 : 2.8125,
    locale: 'zh-CN',
});
page.on('pageerror', error => console.log('[pageerror]', error.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1800);
// 探针自己的调试按钮会挡住背屏内容，截图时藏掉。
await page.addStyleTag({ content: '[data-probe-overlay]{display:none !important;}' });

// 先点控制栏的齿轮唤起面板，再切页签；面板靠 data-rear-* 锚点定位，不依赖中文文案。
await page.locator('[data-rear-control="settings"]').click({ force: true });
await page.waitForTimeout(300);
await page.locator(`[data-rear-tab="${tab}"]`).click({ force: true });
await page.waitForTimeout(400);

const info = await page.evaluate(() => {
    const root = document.querySelector('[data-rear-panel]');
    const scroller = root?.querySelector('.overflow-y-auto');
    // 页签条是主屏播放页面板那种分段式（flex-1 等分），不再横向滚动；
    // 这里量「最窄那一格」的宽度，用来确认 3 个文字页签（通用/背景/动画）放不放得下。
    const tabButtons = [...(root?.querySelectorAll('[data-rear-tab]') ?? [])];
    const tabWidths = tabButtons.map(button => Math.round(button.getBoundingClientRect().width));
    return {
        tab: root?.getAttribute('data-rear-panel'),
        panelW: Math.round(root?.getBoundingClientRect().width ?? 0),
        panelH: Math.round(root?.getBoundingClientRect().height ?? 0),
        scrollH: scroller?.scrollHeight ?? null,
        clientH: scroller?.clientHeight ?? null,
        tabWidths,
        // 标签被挤到换行 / 溢出时该格的内容宽会超过格子宽，等于就把问题暴露出来了。
        tabOverflow: tabButtons.map(button => Math.ceil(button.scrollWidth - button.clientWidth)),
    };
});
// panelW 应约等于「CSS 视口宽 - 左侧安全带 - 两侧留白」（347 - 105 - 6 = 236）。
console.log('[info]', JSON.stringify(info));
await page.screenshot({ path: out });
await browser.close();
console.log('[shot]', out);
