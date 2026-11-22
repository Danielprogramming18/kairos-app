const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.KAIROS_QA_URL || 'http://127.0.0.1:4174/';
const out = path.resolve(__dirname, '../qa-output/duration');
const title = 'آزمون مدت بیست‌وپنج به شصت';
const checks = [], errors = [];

async function records(page, store) {
  return page.evaluate(store => new Promise((resolve, reject) => {
    const open = indexedDB.open('kairos_offline_db_v2');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, transaction = db.transaction(store);
      const request = transaction.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    };
  }), store);
}
async function allocations(page) {
  return (await records(page, 'planningRecords')).filter(r => r.collection === 'allocations').map(r => r.value);
}

(async () => {
  await fs.mkdir(out, {recursive:true});
  const browser = await chromium.launch({
    executablePath: process.env.KAIROS_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true,
  });
  const context = await browser.newContext({locale:'fa-IR', timezoneId:'Asia/Tehran'});
  await context.clock.install({time:new Date('2026-11-19T04:30:00Z')});
  await context.addInitScript(() => localStorage.setItem('kairos_onboarding_seen_version', '1'));
  let page = await context.newPage();
  const watch = page => page.on('pageerror', e => errors.push(e.message));
  watch(page);
  const route = async id => { await page.goto(base + '#/' + id); await page.locator('main').waitFor(); };
  const pass = text => {checks.push(text); console.log('PASS', text);};
  try {
    await route('projects');
    await page.getByRole('button', {name:'کار جدید', exact:true}).first().click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('عنوان کار *', {exact:true}).fill(title);
    await dialog.locator('summary').filter({hasText:'زمان‌بندی و تخمین'}).click();
    await dialog.getByLabel('مدت کار / تایمر (دقیقه)', {exact:true}).fill('25');
    await dialog.getByLabel('نوع مشخص کار', {exact:true}).fill('طراحی وب');
    await dialog.getByRole('button', {name:'ذخیرهٔ کار', exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    const target = (await records(page, 'tasks')).find(t => t.title === title);
    assert.equal(target.duration, 25);
    // Add comparable completed history to this disposable browser profile.
    await page.evaluate(target => new Promise((resolve, reject) => {
      const open = indexedDB.open('kairos_offline_db_v2');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('tasks', 'readwrite');
        for (let i = 0; i < 3; i++) tx.objectStore('tasks').put({
          ...target, id:'duration_history_'+i, title:'نمونهٔ تکمیل‌شده '+i,
          status:'done', completed:true, completedAt:'2026-11-18T12:00:00Z',
          createdAt:'2026-11-18T09:00:00Z', updatedAt:'2026-11-18T12:00:00Z',
          planning:{...target.planning, actualMinutes:60, actualConfirmed:true},
        });
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => {db.close(); resolve();};
      };
    }), target);
    await route('capacity');
    await page.getByLabel('تاریخ خاص (جایگزین برنامهٔ هفتگی وقت آزاد)').fill('2026-11-19');
    await page.getByLabel('شروع', {exact:true}).fill('09:00');
    await page.getByLabel('پایان', {exact:true}).fill('17:00');
    await page.getByRole('button', {name:'افزودن بازه', exact:true}).click();
    await page.getByRole('button', {name:'برداشتن بازه', exact:true}).waitFor();
    await page.getByLabel('کار برای تخمین', {exact:true}).selectOption(target.id);
    await page.getByRole('button', {name:'بررسی ظرفیت و پیش‌نمایش', exact:true}).click();
    await page.getByRole('button', {name:'تأیید و اعمال برنامه', exact:true}).click();
    await page.locator('.kp-schedule-row').filter({hasText:title}).waitFor();
    const original = (await allocations(page))[0];
    assert.equal(original.plannedTaskMinutes, 60);
    assert.equal((Date.parse(original.end) - Date.parse(original.start)) / 60000, 60);
    assert.equal((await records(page, 'tasks')).find(t=>t.id===target.id).duration, 25);
    pass('UI approves personal estimate 60 and preserves manual duration 25');
    await page.close();
    page = await context.newPage(); watch(page);
    await route('capacity');
    await page.locator('.kp-schedule-row').filter({hasText:title}).waitFor();
    assert.deepEqual((await allocations(page))[0], original);
    await page.getByRole('button', {name:'جابه‌جایی بازه', exact:true}).click();
    await page.getByLabel('شروع تازه برای '+title).fill('2026-11-19T11:00');
    await page.getByRole('button', {name:'بررسی و ذخیرهٔ جابه‌جایی', exact:true}).click();
    await page.getByText('بازه پس از بررسی تعارض و موعد جابه‌جا شد.', {exact:true}).waitFor();
    const moved = (await allocations(page))[0];
    assert.equal(moved.plannedTaskMinutes, 60);
    assert.equal((Date.parse(moved.end) - Date.parse(moved.start)) / 60000, 60);
    pass('closing/reopening the page retains the basis and allows a 60-minute move');
    await route('projects');
    await page.getByRole('button', {name:title, exact:true}).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('summary').filter({hasText:'زمان‌بندی و تخمین'}).click();
    await dialog.getByLabel('مدت کار / تایمر (دقیقه)', {exact:true}).fill('40');
    await dialog.getByRole('button', {name:'ذخیرهٔ کار', exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await route('capacity');
    await page.getByText(/برای اعمال مدت تازه، دوباره محاسبه و تأیید کن/).waitFor();
    assert.deepEqual((await allocations(page))[0], moved);
    await page.getByRole('button', {name:'بازگرداندن برنامهٔ قبلی', exact:true}).click();
    await page.getByText(/بازه‌های قابل اجرای برنامهٔ قبلی بازگردانده شدند/).waitFor();
    assert.deepEqual((await allocations(page))[0], original);
    const current = (await records(page, 'tasks')).find(t=>t.id===target.id);
    assert.equal(current.duration, 40); assert.equal(current.planning.initialEstimate, 25);
    await page.reload();
    await page.locator('.kp-schedule-row').filter({hasText:title}).waitFor();
    assert.deepEqual((await allocations(page))[0], original);
    pass('editing the task to 40 shows an explanation; undo and reload retain approved 60');
    await page.getByRole('button', {name:'بررسی ظرفیت و پیش‌نمایش', exact:true}).click();
    await page.getByRole('button', {name:'تأیید و اعمال برنامه', exact:true}).click();
    await page.getByRole('heading', {name:'پیش‌نمایش برنامه', exact:true}).waitFor({state:'hidden'});
    assert.equal((await allocations(page))[0].plannedTaskMinutes, 40);
    pass('explicit recalculation and confirmation apply the new 40-minute duration');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out,'result.json'), JSON.stringify({base, browser:browser.version(), checks, errors}, null, 2));
  } catch (error) {
    await page.screenshot({path:path.join(out,'failure.png'), fullPage:true});
    await fs.writeFile(path.join(out,'failure.txt'), String(error)+'\n'+await page.locator('body').innerText());
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode=1;});
