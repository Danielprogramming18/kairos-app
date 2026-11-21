const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const entry = pathToFileURL(path.resolve(__dirname, '../build/android/index.html')).href;

async function checkLocalFile(browser, blockWorkers) {
  const context = await browser.newContext({ locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
  const page = await context.newPage();
  const errors = [];
  const network = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  await context.clock.install({time: new Date('2026-11-19T06:30:00Z')});
  await context.addInitScript(block => {
    localStorage.setItem('kairos_onboarding_seen_version', '1');
    window.planningWorkerResponses = 0;
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args) {
        if (block) throw new DOMException('Worker blocked by test host', 'SecurityError');
        super(...args);
        this.addEventListener('message', event => {
          if (event.data?.result || event.data?.confirmation) window.planningWorkerResponses++;
        });
      }
    };
  }, blockWorkers);
  try {
    await context.setOffline(true);
    await page.goto(entry + '#/projects');
    const title = 'کار آفلاین از فایل محلی';
    await page.getByRole('button', {name:'کار جدید',exact:true}).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('عنوان کار *', {exact:true}).fill(title);
    await dialog.getByRole('button', {name:'ذخیرهٔ کار',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await page.goto(entry + '#/capacity');
    await page.getByLabel('تاریخ خاص (جایگزین برنامهٔ هفتگی وقت آزاد)').fill('2026-11-19');
    await page.getByLabel('شروع', {exact:true}).fill('09:00');
    await page.getByLabel('پایان', {exact:true}).fill('15:00');
    await page.getByRole('button', {name:'افزودن بازه'}).click();
    await page.getByRole('button', {name:'برداشتن بازه'}).waitFor();
    await page.getByRole('button', {name:'بررسی ظرفیت و پیش‌نمایش'}).click();
    const apply = page.getByRole('button', {name:'تأیید و اعمال برنامه'});
    await apply.waitFor();
    if (await apply.isDisabled()) await page.getByRole('checkbox', {name:/این مدت‌های فرضی/}).check();
    await apply.click();
    await page.locator('.kp-schedule-row').filter({hasText:title}).waitFor();
    const responses = await page.evaluate(() => window.planningWorkerResponses);
    assert.equal(blockWorkers ? responses === 0 : responses >= 2, true, 'expected scheduling execution path');
    await page.reload();
    await page.locator('.kp-schedule-row').filter({hasText:title}).waitFor();
    assert.deepEqual(network, []);
    assert.deepEqual(errors, []);
    console.log('PASS offline file entry + stored task + confirmed schedule + reload;', blockWorkers ? 'blocked Worker fallback' : 'bundled Worker');
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.KAIROS_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  try {
    await checkLocalFile(browser, false);
    await checkLocalFile(browser, true);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
