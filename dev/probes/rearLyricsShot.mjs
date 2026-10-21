import { chromium } from 'playwright';

// dev/probes/rearLyricsShot.mjs
//
// 给 rearLyrics / rearLyricsSetting 探针截图，用来在不动真机的前提下检查布局。
// 用法：先 `npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`，再
//   node dev/probes/rearLyricsShot.mjs <输出png> [等待毫秒] [探针id] [附加query] [宽] [高]
// 缺省视口 347x212 / dpr 2.8125，就是小米 17 Pro Max 背屏的 WebView 尺寸；
// 传了宽度（例如看设置卡片时 900）就把 dpr 降到 2，免得截图大得没法看。

const out = process.argv[2] ?? '_shots/rear-probe.png';
const waitMs = Number(process.argv[3] ?? 6000);
const probe = process.argv[4] ?? 'rearLyrics';
const extra = process.argv[5] ?? '';
const width = Number(process.argv[6] ?? 347);
const height = Number(process.argv[7] ?? 212);
// 是否打印文字落点坐标与可见区边界，用来核对「心象」在背屏上的排版边界。
const geometry = process.argv[8] === 'geometry';
const url = `http://127.0.0.1:4173/dev-probe.html?probe=${probe}&safeLeftPx=277&physicalWidthPx=976${extra}`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: width > 500 ? 2 : 2.8125,
    locale: 'zh-CN',
});
page.on('pageerror', error => console.log('[pageerror]', error.message));
await page.goto(url, { waitUntil: 'load' });
// 探针自己的调试按钮会挡住背屏内容，截图时藏掉。
await page.addStyleTag({ content: '[data-probe-overlay]{display:none !important;}' });
await page.waitForTimeout(waitMs);

const metrics = await page.evaluate(() => {
    const layer = document.querySelector('#root > div > div:nth-child(2)');
    const style = layer ? getComputedStyle(layer) : null;
    return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        dpr: window.devicePixelRatio,
        lyricLayerLeft: style?.left ?? null,
        lyricLayerWidth: style?.width ?? null,
    };
});
console.log('[metrics]', JSON.stringify(metrics));

await page.screenshot({ path: out });
if (geometry) {
    const bounds = await page.evaluate(() => {
        const overlayWords = [...document.querySelectorAll('div[style*="translate3d"]')];
        const collect = (entries) => entries.map((entry) => {
            const rect = entry.getBoundingClientRect();
            return {
                text: (entry.textContent ?? '').slice(0, 12),
                left: Number(rect.left.toFixed(1)),
                right: Number(rect.right.toFixed(1)),
                top: Number(rect.top.toFixed(1)),
                bottom: Number(rect.bottom.toFixed(1)),
            };
        });
        return {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            overlayWordCount: overlayWords.length,
            overlayWords: collect(overlayWords).slice(0, 40),
        };
    });
    console.log('[geometry]', JSON.stringify(bounds, null, 1));
}
await browser.close();
console.log('[shot]', out);
