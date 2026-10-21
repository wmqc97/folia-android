import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 1, locale: 'zh-CN' });
page.on('pageerror', e => console.log('[pageerror]', e.message));
try {
  await page.goto('http://127.0.0.1:4173/dev-probe.html?probe=rearStylePreview', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '_shots/v4-style-preview.png' });
  console.log('ok');
} catch (e) { console.log('ERR', e.message); }
await browser.close();
