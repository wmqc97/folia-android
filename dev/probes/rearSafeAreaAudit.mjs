import { chromium } from 'playwright';

// dev/probes/rearSafeAreaAudit.mjs
//
// 背屏安全带诊断：量出「哪些文字跑进了左侧摄像头竖带」，用来核对避让是否生效。
// 与 rearLyricsShot.mjs 的区别是它会遍历真实文本节点，输出每个文本块的落点，
// 而不是只看整屏截图 —— 截图只能靠眼睛看，这个能给出「进洞多深」的数值。
//
// 用法：先起 `npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`，再
//   node dev/probes/rearSafeAreaAudit.mjs [模式] [字号] [输出json] [附加query]
// 附加 query 例如 "&frameFontScale=0.8&canvasX=120"，用来试某个样式的构图参数。

const mode = process.argv[2] ?? 'classic';
const fontScale = process.argv[3] ?? '1';
const outJson = process.argv[4] ?? '';
const extraQuery = process.argv[5] ?? '';
const url = `http://127.0.0.1:4173/dev-probe.html?probe=rearLyrics&safeLeftPx=277&physicalWidthPx=976&mode=${mode}&fontScale=${fontScale}${extraQuery}`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
    viewport: { width: 347, height: 212 },
    deviceScaleFactor: 2.8125,
    locale: 'zh-CN',
});
page.on('pageerror', error => console.log('[pageerror]', error.message));
await page.goto(url, { waitUntil: 'load' });
await page.addStyleTag({ content: '[data-probe-overlay]{display:none !important;}' });
await page.waitForTimeout(Number(process.env.WAIT_MS ?? 6000));

const report = await page.evaluate(() => {
    // 与 src/services/rearLyricsBridge.ts 的 resolveRearSafeLeftCss 同一套换算，
    // 保证诊断用的边界和页面实际用的边界是同一个数。
    const params = new URLSearchParams(window.location.search);
    const safeLeftPx = Number(params.get('safeLeftPx')) || 0;
    const physicalWidthPx = Number(params.get('physicalWidthPx')) || 0;
    const viewportW = window.innerWidth || 0;
    const safeLeft = safeLeftPx > 0 && physicalWidthPx > 0 && viewportW > 0
        ? Math.round((safeLeftPx * viewportW) / physicalWidthPx)
        : 105;

    // 叶子文本节点：只取真正渲染出字符的元素，跳过容器
    const blocks = [];
    document.querySelectorAll('*').forEach(el => {
        const hasOwnText = [...el.childNodes].some(
            node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0,
        );
        if (!hasOwnText) return;
        const text = (el.textContent ?? '').trim();
        if (!text) return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return;
        blocks.push({
            text: text.slice(0, 40),
            left: Number(rect.left.toFixed(1)),
            right: Number(rect.right.toFixed(1)),
            top: Number(rect.top.toFixed(1)),
            bottom: Number(rect.bottom.toFixed(1)),
            fontSize: style.fontSize,
        });
    });

    const intruders = blocks
        .filter(b => b.left < safeLeft - 0.5)
        .map(b => ({ ...b, intrusion: Number((safeLeft - b.left).toFixed(1)) }));

    /*
     * 只在屏幕内判定「遮挡」：钟摆这类模式会把上一句 / 下一句排在画布外（top 或 bottom 落在
     * 屏幕之外），它们本来就不会被看见，算进挖孔区只会得出假警报。真正要拦的是
     * 「看得见、却压在摄像带上」的文字，所以这里按 onScreen 再收一次。
     */
    const isOnScreen = (b) => b.bottom > 0 && b.top < window.innerHeight && b.right > 0 && b.left < window.innerWidth;
    const visibleIntruders = intruders.filter(isOnScreen);

    return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        safeLeft,
        visibleWidth: window.innerWidth - safeLeft,
        blockCount: blocks.length,
        onScreenBlockCount: blocks.filter(isOnScreen).length,
        leftMostBlock: blocks.reduce((min, b) => (b.left < min.left ? b : min), blocks[0] ?? null),
        rightMostBlock: blocks.reduce((max, b) => (b.right > max.right ? b : max), blocks[0] ?? null),
        intruders,
        visibleIntruders,
        offScreenIntruders: intruders.filter(b => !isOnScreen(b)),
        blocks: blocks.slice(0, 60),
    };
});
report.mode = mode;
report.fontScale = Number(fontScale);
console.log(JSON.stringify(report, null, 1));
if (outJson) {
    const fs = await import('fs');
    fs.writeFileSync(outJson, JSON.stringify(report, null, 1));
}
await browser.close();
