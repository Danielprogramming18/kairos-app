const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.KAIROS_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const base = process.env.KAIROS_QA_URL || 'http://127.0.0.1:4174/';
    const legacy = pathToFileURL(path.resolve('build/android/index.html')).href;
    await page.goto(legacy + '?kairosStorageTransfer=1');
    const snapshot = await page.evaluate(() => {
      localStorage.setItem('kairos_unsaved_task_draft_v1', 'پیش‌نویس آزمایش');
      localStorage.setItem('kairos_theme_preference', 'dark');
      localStorage.setItem('kairos_github_config_v1','synthetic marker');
      return window.KairosPreferences.read();
    });
    assert.equal(snapshot.kairos_unsaved_task_draft_v1, 'پیش‌نویس آزمایش');
    assert.equal(snapshot.kairos_github_config_v1, undefined);
    await page.goto(base + '?kairosStorageTransfer=1');
    assert.equal(await page.evaluate(s => window.KairosPreferences.copy(s) && window.KairosPreferences.copy(s), snapshot), true);
    assert.equal(await page.evaluate(s => window.KairosPreferences.copy({...s,kairos_unsaved_task_draft_v1:'different'}), snapshot), false);
    await page.goto(base);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    const intro = page.frameLocator('iframe');
    await intro.locator('#kairos-intro-title').waitFor();
    await intro.locator('#kairos-intro-skip').click();
    await page.locator('iframe').waitFor({state:'detached'});
    const readings = await page.evaluate(async () => {
      const key = await crypto.subtle.importKey('raw',new TextEncoder().encode('public QA benchmark'), 'PBKDF2', false,['deriveBits']);
      const values = [];
      for (let i=0;i<3;i++) {
        const start=performance.now();
        await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(16),iterations:600000},key,256);
        values.push(Math.round(performance.now()-start));
      }
      return values;
    });
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    assert.match(policy, /script-src 'self';/);
    const report = {browser:browser.version(), pbkdf2Sha256Milliseconds:readings, passed:['preference transfer preserves draft and theme', 'repeat transfer and mismatched destination', 'legacy credential excluded', 'offline bundled introduction starts and exits', 'production script policy']};
    await fs.writeFile('qa-output/security-browser.json', JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
