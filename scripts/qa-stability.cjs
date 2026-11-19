const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const base = process.env.KAIROS_QA_URL || 'http://127.0.0.1:4173/';
const out = path.resolve(__dirname, '../qa-output/stability');
const chromePath = process.env.KAIROS_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const checks = [], errors = [];
const quickTitle = 'ثبت سریع آزمون رابط';
let taskTitle = 'طراحی رابط آزمایشی با عنوان بلند فارسی برای بررسی نمایش در موبایل و دسکتاپ';
const projectTitle = 'پروژهٔ آزمون پایداری';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(test, label, timeout = 10000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await test()) return; await pause(100); }
  throw Error('Timed out: ' + label);
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
  // Keep a full 30-minute window available, even if the test host runs near midnight.
  // Installed clocks advance normally, including the real wait before confirmation.
  await context.clock.install({ time: new Date('2026-11-19T06:30:00Z') });
  await context.addInitScript(() => localStorage.setItem('kairos_onboarding_seen_version', '1'));
  let page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  const check = name => { checks.push(name); console.log('PASS', name); };
  const route = async (id, target = page) => { await target.goto(base + '#/' + id); await target.locator('main').waitFor(); await target.waitForTimeout(130); };
  const shell = () => page.locator('main section.kp').first();
  const taskDialog = () => page.getByRole('dialog', { name: /ثبت کار جدید|ویرایش کار/ });
  const openNewTask = async () => { await page.getByRole('button', { name: 'کار جدید', exact: true }).first().click(); await taskDialog().waitFor(); };
  const openEditorGroup = async name => { const details = taskDialog().locator('details').filter({ has: page.locator('summary').filter({ hasText: name }) }).first(); if (!await details.evaluate(el => el.open)) await details.locator('summary').first().click(); };
  const saveTask = async () => { await taskDialog().getByRole('button', { name: 'ذخیرهٔ کار', exact: true }).click(); await taskDialog().waitFor({ state: 'hidden' }); };
  const chooseProject = async () => { await page.getByLabel('پروژه', { exact: true }).selectOption({ label: projectTitle }); await page.getByRole('heading', { name: 'پیشرفت کل پروژه', exact: true }).waitFor(); };
  const menuLocation = id => page.getByLabel('محل نمایش ' + id, { exact: true });
  const mobileLabels = () => page.locator('nav[aria-label="ناوبری پایین موبایل"] button').allTextContents().then(labels => labels.map(x => x.trim()));
  const desktopLabels = () => page.locator('aside nav button').allTextContents().then(labels => labels.map(x => x.trim()));
  const todayKey = () => page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  try {
    await route('projects'); await page.getByRole('heading', { name: 'پروژه‌ها و جست‌وجو', exact: true }).waitFor();
    assert.deepEqual(await desktopLabels(), ['امروز', 'کارها', 'پروژه‌ها', 'تقویم', 'تمرکز', 'بیشتر']);
    await page.setViewportSize({ width: 390, height: 800 });
    assert.deepEqual(await mobileLabels(), ['امروز', 'کارها', 'پروژه‌ها', 'بیشتر']);
    await page.setViewportSize({ width: 1366, height: 900 }); check('new desktop/mobile defaults expose projects and fixed More');

    await openNewTask();
    assert.deepEqual(await taskDialog().locator('details').evaluateAll(items => items.map(el => el.open)), [false, false, false]);
    assert.equal(await taskDialog().getByLabel('مدت کار / تایمر (دقیقه)', { exact: true }).isVisible(), false);
    await taskDialog().getByLabel('عنوان کار *', { exact: true }).fill(quickTitle); await saveTask();
    await page.getByRole('button', { name: quickTitle, exact: true }).waitFor();
    await page.getByLabel('انجام ' + quickTitle, { exact: true }).click();
    await eventually(() => page.getByLabel('انجام ' + quickTitle, { exact: true }).isChecked(), 'quick task completed');
    check('title-only save with collapsed advanced fields and optional completion feedback');

    await page.getByLabel('نام پروژه', { exact: true }).fill(projectTitle);
    await page.getByRole('button', { name: 'ساخت پروژه', exact: true }).click();
    await page.getByRole('heading', { name: 'پیشرفت کل پروژه', exact: true }).waitFor();
    await page.locator('summary').filter({ hasText: 'مدیریت مرحله‌ها' }).click();
    for (const name of ['مرحلهٔ آغاز', 'مرحلهٔ بررسی']) {
      await page.getByLabel('مرحلهٔ جدید', { exact: true }).fill(name);
      await page.getByRole('button', { name: 'افزودن مرحله', exact: true }).click();
      await page.getByLabel('نام مرحله ' + name, { exact: true }).waitFor();
    }
    await openNewTask(); await taskDialog().getByLabel('عنوان کار *', { exact: true }).fill(taskTitle);
    await openEditorGroup('پروژه و مرحله');
    await taskDialog().getByLabel('پروژه', { exact: true }).selectOption({ label: projectTitle });
    await taskDialog().getByLabel('مرحله', { exact: true }).selectOption({ label: 'مرحلهٔ آغاز' });
    await taskDialog().getByLabel('از اینجا ادامه بده', { exact: true }).fill('از بخش ذخیره‌سازی ادامه بده');
    await openEditorGroup('زمان‌بندی و تخمین');
    await taskDialog().getByLabel('مدت کار / تایمر (دقیقه)', { exact: true }).fill('30');
    await taskDialog().getByLabel('مدت باقی‌مانده (دقیقه)', { exact: true }).fill('30');
    await taskDialog().getByLabel('نوع مشخص کار', { exact: true }).fill('طراحی رابط وب');
    const date = await todayKey(); const tomorrow = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    await taskDialog().getByLabel('موعد تحویل (تاریخ و ساعت محلی، اختیاری)', { exact: true }).fill(tomorrow + 'T17:00');
    await openEditorGroup('جزئیات پیشرفته');
    await taskDialog().getByLabel('توضیحات و جزئیات (اختیاری)', { exact: true }).fill('شرح پیشرفته باید با ویرایش عنوان حفظ شود.');
    await saveTask();
    await route('projects'); await chooseProject();
    await page.getByRole('button', { name: taskTitle, exact: true }).click();
    await eventually(async () => (await taskDialog().locator('details').evaluateAll(items => items.map(el => el.open))).every(open => !open), 'reopened form groups collapsed');
    assert.deepEqual(await taskDialog().locator('details').evaluateAll(items => items.map(el => el.open)), [false, false, false]);
    assert.equal(await taskDialog().getByLabel('از اینجا ادامه بده', { exact: true }).inputValue(), 'از بخش ذخیره‌سازی ادامه بده');
    assert.equal(await taskDialog().getByLabel('نوع مشخص کار', { exact: true }).inputValue(), 'طراحی رابط وب');
    taskTitle += ' — ویرایش عنوان'; await taskDialog().getByLabel('عنوان کار *', { exact: true }).fill(taskTitle); await saveTask();
    await page.getByRole('button', { name: taskTitle, exact: true }).waitFor();
    check('collapsed edit preserves project, stage, deadline, resume and specific work type');

    await page.getByLabel('مرحلهٔ کار ' + taskTitle, { exact: true }).selectOption({ label: 'مرحلهٔ بررسی' });
    await page.getByLabel('فیلتر مرحله', { exact: true }).selectOption({ label: 'مرحلهٔ بررسی' });
    await page.getByRole('region', { name: 'کارهای مرحله مرحلهٔ بررسی', exact: true }).getByRole('button', { name: taskTitle, exact: true }).waitFor();
    await page.getByLabel('فیلتر مرحله', { exact: true }).selectOption('all');
    const management = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'مدیریت مرحله‌ها' }) }).first();
    if (!await management.evaluate(el => el.open)) await management.locator('summary').first().click();
    const stageRow = page.locator('article').filter({ has: page.getByLabel('نام مرحله مرحلهٔ بررسی', { exact: true }) }).first();
    await stageRow.getByRole('button', { name: 'حذف مرحله', exact: true }).click();
    assert.equal(await stageRow.getByRole('button', { name: 'تأیید انتقال کارها و حذف مرحله', exact: true }).isDisabled(), true);
    await stageRow.getByLabel('کارهای این مرحله به کجا منتقل شوند؟', { exact: true }).selectOption('__none');
    await stageRow.getByRole('button', { name: 'تأیید انتقال کارها و حذف مرحله', exact: true }).click();
    await page.getByRole('region', { name: 'کارهای مرحله بدون مرحله', exact: true }).getByRole('button', { name: taskTitle, exact: true }).waitFor();
    await eventually(async () => await page.getByLabel('نام مرحله مرحلهٔ بررسی', { exact: true }).count() === 0, 'stage deletion committed after transfer');
    check('stage grouping/filter/transfer and explicit delete destination preserve the task');

    await route('more');
    await page.getByRole('button', { name: 'شخصی‌سازی منو', exact: true }).last().waitFor();
    await page.getByLabel('جست‌وجوی قابلیت', { exact: true }).fill('شاخص');
    await page.getByRole('button', { name: 'باز کردن شاخص‌ها', exact: true }).waitFor();
    await route('customize'); await page.getByLabel('چیدمان دستگاه', { exact: true }).selectOption('desktop');
    await menuLocation('رویدادها').selectOption('main');
    await eventually(async () => (await desktopLabels()).includes('رویدادها'), 'desktop shortcut added');
    await page.getByLabel('سنجاق پروژه‌ها', { exact: true }).click();
    await eventually(async () => (await desktopLabels())[0] === 'پروژه‌ها', 'desktop pin first');
    const moveUp = page.getByRole('button', { name: 'کارها بالاتر', exact: true });
    await moveUp.focus(); await page.keyboard.press('Enter');
    await eventually(async () => (await desktopLabels())[1].startsWith('کارها'), 'keyboard reorder applied');
    const calendarHandle = page.getByRole('button', { name: 'کشیدن تقویم برای تغییر ترتیب', exact: true });
    const targetRow = page.locator('article').filter({ has: menuLocation('امروز') });
    await calendarHandle.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const handleBox = await calendarHandle.boundingBox(), targetBox = await targetRow.boundingBox();
    assert.ok(handleBox && targetBox);
    const x = handleBox.x + handleBox.width / 2, y = handleBox.y + handleBox.height / 2;
    const destX = targetBox.x + targetBox.width / 2, destY = targetBox.y + targetBox.height / 4;
    assert.ok(await calendarHandle.evaluate((el, point) => el.contains(document.elementFromPoint(point.x, point.y)), { x, y }), 'the drag handle is under the pointer');
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 10, y + 2, { steps: 4 });
    await page.mouse.move(destX, destY, { steps: 16 });
    await page.mouse.move(destX + 1, destY + 1); await page.mouse.up();
    await eventually(async () => (await desktopLabels())[2] === 'تقویم', 'pointer drag saved within unpinned group');
    await menuLocation('رویدادها').selectOption('hidden');
    await eventually(async () => !(await desktopLabels()).includes('رویدادها'), 'desktop hidden');
    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByLabel('چیدمان دستگاه', { exact: true }).selectOption('mobile');
    await menuLocation('تقویم').selectOption('main');
    await eventually(async () => (await mobileLabels()).length === 5, 'mobile full');
    await menuLocation('رویدادها').selectOption('main');
    const replacement = page.getByRole('dialog', { name: 'کدام میان‌بر جایگزین شود؟', exact: true }); await replacement.waitFor();
    assert.ok((await mobileLabels()).includes('تقویم')); assert.ok(!(await mobileLabels()).includes('رویدادها'));
    await replacement.getByLabel('میان‌بر برای جایگزینی', { exact: true }).selectOption('calendar');
    await replacement.getByRole('button', { name: 'تأیید جایگزینی', exact: true }).click(); await replacement.waitFor({ state: 'hidden' });
    assert.equal((await mobileLabels()).length, 5); assert.ok((await mobileLabels()).includes('رویدادها')); assert.ok(!(await mobileLabels()).includes('تقویم'));
    await page.getByLabel('سنجاق رویدادها', { exact: true }).click(); await eventually(async () => (await mobileLabels())[0] === 'رویدادها', 'mobile pin first');
    await page.getByLabel('سنجاق رویدادها', { exact: true }).click(); await eventually(() => page.getByLabel('سنجاق رویدادها', { exact: true }).isChecked().then(x => !x), 'unpin saved');
    assert.ok((await mobileLabels()).includes('رویدادها'));
    await menuLocation('رویدادها').selectOption('hidden'); await eventually(async () => !(await mobileLabels()).includes('رویدادها'), 'mobile hide');
    await menuLocation('رویدادها').selectOption('main'); await eventually(async () => (await mobileLabels()).includes('رویدادها'), 'mobile restore');
    await page.close();
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 800 }); await route('customize');
    await page.getByLabel('چیدمان دستگاه', { exact: true }).waitFor(); assert.ok((await mobileLabels()).includes('رویدادها'));
    await page.setViewportSize({ width: 1366, height: 900 });
    assert.equal((await desktopLabels())[0], 'پروژه‌ها'); assert.equal((await desktopLabels())[2], 'تقویم'); assert.ok(!(await desktopLabels()).includes('رویدادها'));
    await page.getByLabel('چیدمان دستگاه', { exact: true }).selectOption('mobile');
    await page.getByRole('button', { name: 'بازگرداندن چیدمان پیش‌فرض موبایل', exact: true }).click();
    await eventually(async () => (await mobileLabels()).length === 4, 'mobile defaults restored');
    assert.equal((await desktopLabels())[0], 'پروژه‌ها');
    check('More search, mobile replacement, pin/unpin, hide/restore, reopen and independent device reset');
    check('desktop keyboard and drag reorder persist after closing the page and opening a new tab');

    await route('capacity');
    await page.getByLabel('تاریخ خاص (جایگزین برنامهٔ هفتگی وقت آزاد)', { exact: true }).fill(date);
    await page.getByLabel('شروع', { exact: true }).fill('00:00'); await page.getByLabel('پایان', { exact: true }).fill('23:59');
    await page.getByRole('button', { name: 'افزودن بازه', exact: true }).click(); await page.getByRole('button', { name: 'برداشتن بازه', exact: true }).waitFor();
    await page.getByLabel('افق برنامه‌ریزی (روز)', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'بررسی ظرفیت و پیش‌نمایش', exact: true }).click(); await page.getByRole('button', { name: 'تأیید و اعمال برنامه', exact: true }).waitFor();
    await page.waitForTimeout(3200);
    await page.getByRole('button', { name: 'تأیید و اعمال برنامه', exact: true }).click();
    await page.getByRole('heading', { name: 'پیش‌نمایش برنامه', exact: true }).waitFor({ state: 'hidden' });
    await page.locator('.kp-schedule-row').filter({ hasText: taskTitle }).waitFor();
    check('live 30-minute preview confirms after 3.2 seconds with one action');
    await route('today'); await page.getByRole('region', { name: 'برنامهٔ تأییدشدهٔ امروز', exact: true }).getByText(taskTitle, { exact: true }).waitFor();
    await route('calendar'); await page.getByRole('region', { name: 'برنامهٔ تأییدشدهٔ روز انتخابی', exact: true }).getByText(taskTitle, { exact: true }).waitFor();
    check('confirmed schedule shares task-backed data with today and calendar');

    await route('capacity');
    const scheduleBoard = page.getByRole('region', { name: 'برنامهٔ تأییدشده', exact: true });
    const originalStart = await scheduleBoard.locator('time').first().getAttribute('datetime');
    await scheduleBoard.getByRole('button', { name: 'جابه‌جایی بازه', exact: true }).click();
    const startField = scheduleBoard.getByLabel('شروع تازه برای ' + taskTitle, { exact: true });
    await startField.fill(tomorrow + 'T19:00');
    await scheduleBoard.getByRole('button', { name: 'بررسی و ذخیرهٔ جابه‌جایی', exact: true }).click();
    await eventually(async () => (await scheduleBoard.getByRole('status').innerText()).trim().length > 0, 'invalid move explained');
    assert.equal(await scheduleBoard.locator('time').first().getAttribute('datetime'), originalStart);
    await startField.fill(date + 'T12:00');
    await scheduleBoard.getByRole('button', { name: 'بررسی و ذخیرهٔ جابه‌جایی', exact: true }).click();
    await startField.waitFor({ state: 'hidden' });
    const movedStart = await scheduleBoard.locator('time').first().getAttribute('datetime');
    assert.equal(movedStart, date + 'T08:30:00.000Z');
    await scheduleBoard.getByLabel('حفظ بازه / قفل', { exact: true }).click();
    await eventually(() => scheduleBoard.getByLabel('حفظ بازه / قفل', { exact: true }).isChecked(), 'confirmed slot locked');
    await eventually(() => scheduleBoard.getByRole('button', { name: 'جابه‌جایی بازه', exact: true }).isDisabled(), 'locked slot cannot move');
    check('invalid move keeps original time, valid move persists and locked slot disables further moves');
    await page.getByRole('button', { name: 'بررسی ظرفیت و پیش‌نمایش', exact: true }).click(); await page.getByRole('button', { name: 'تأیید و اعمال برنامه', exact: true }).waitFor();
    const concurrent = await context.newPage(); concurrent.on('pageerror', error => errors.push(error.message));
    await route('projects', concurrent); await concurrent.getByRole('button', { name: taskTitle, exact: true }).click();
    taskTitle += ' — تغییر هم‌زمان'; await concurrent.locator('#task-modal-title-input').fill(taskTitle);
    await concurrent.getByRole('button', { name: 'ذخیرهٔ کار', exact: true }).click(); await concurrent.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'تأیید و اعمال برنامه', exact: true }).click();
    await page.getByRole('heading', { name: 'پیش‌نمایش برنامه', exact: true }).waitFor();
    await eventually(async () => /تغییر/.test(await shell().innerText()), 'real change reason');
    assert.ok(await page.getByRole('button', { name: 'تأیید و اعمال برنامه', exact: true }).isVisible());
    await page.getByRole('button', { name: 'تأیید و اعمال برنامه', exact: true }).click(); await page.getByRole('heading', { name: 'پیش‌نمایش برنامه', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await scheduleBoard.locator('time').first().getAttribute('datetime'), movedStart);
    assert.equal(await scheduleBoard.getByLabel('حفظ بازه / قفل', { exact: true }).isChecked(), true);
    await concurrent.close(); check('concurrent task edit refreshes preview with a reason and preserves locked time');

    await route('projects'); await page.getByLabel('انجام ' + taskTitle, { exact: true }).click(); await eventually(() => page.getByLabel('انجام ' + taskTitle, { exact: true }).isChecked(), 'task complete');
    await route('today'); await page.getByRole('region', { name: 'برنامهٔ تأییدشدهٔ امروز', exact: true }).locator('.kp-schedule-row').filter({ hasText: 'انجام‌شده' }).waitFor();
    await route('tasks'); await page.getByRole('button', { name: 'حذف کار ' + taskTitle, exact: true }).click(); await page.getByRole('button', { name: 'بله، حذف شود', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    for (const [id, title] of [['capacity', 'برنامهٔ تأییدشده'], ['today', 'برنامهٔ تأییدشدهٔ امروز'], ['calendar', 'برنامهٔ تأییدشدهٔ روز انتخابی']]) {
      await route(id); const board = page.getByRole('region', { name: title, exact: true }); await board.waitFor(); assert.equal(await board.locator('.kp-schedule-row').count(), 0);
    }
    check('completion status and soft-deletion propagate across all schedule views');

    await route('projects'); await openNewTask();
    const longTitle = 'بررسی دسترس‌پذیری و چیدمان کارهای پروژه با عنوان طولانی فارسی '.repeat(3).trim();
    await taskDialog().getByLabel('عنوان کار *', { exact: true }).fill(longTitle); await saveTask();
    await page.getByRole('button', { name: longTitle, exact: true }).waitFor();
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await page.waitForFunction(color => document.documentElement.dataset.theme === color, theme);
      for (const width of [320, 390, 768, 1366]) {
        await page.setViewportSize({ width, height: 850 });
        for (const id of ['projects', 'events', 'tracking', 'capacity', 'more', 'customize', 'calendar']) {
          await route(id);
          if (id === 'projects') await page.getByRole('button', { name: longTitle, exact: true }).waitFor();
          const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, direction: getComputedStyle(document.querySelector('main')).direction }));
          assert.equal(size.direction, 'rtl');
          assert.ok(size.scroll <= size.width + 1, `overflow ${id}/${theme}/${width}: ${JSON.stringify(size)}`);
        }
        await route('more'); await page.screenshot({ path: path.join(out, `more-${theme}-${width}.png`), fullPage: true });
      }
    }
    check('seven RTL routes, including long Persian titles, fit four widths in two verified themes');

    await page.setViewportSize({ width: 1366, height: 900 }); await route('settings');
    const downloadPending = page.waitForEvent('download'); await page.getByRole('button', { name: 'دانلود فایل پشتیبان (JSON)', exact: true }).click();
    const download = await downloadPending; const backup = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(backup.payload.planning.projects.length, 1); assert.equal(backup.payload.planning.projects[0].stages.length, 1);
    const savedTask = backup.payload.tasks.find(task => task.title === taskTitle); assert.ok(savedTask.deletedAt); assert.equal(savedTask.planning.resume, 'از بخش ذخیره‌سازی ادامه بده');
    assert.equal(savedTask.planning.workType, 'طراحی رابط وب'); assert.equal(savedTask.duration, 30); assert.equal(savedTask.planning.stageId, undefined);
    assert.equal(backup.payload.settings.planning, undefined); assert.ok(backup.payload.planning.layout.desktop.pinned.includes('projects'));
    assert.deepEqual(backup.payload.planning.layout.mobile.main, ['dashboard', 'workspace', 'projects']);
    check('canonical UI backup preserves normalized planning, task extras, trash and independent layouts');

    const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran' });
    try {
      await touchContext.addInitScript(() => localStorage.setItem('kairos_onboarding_seen_version', '1'));
      const touchPage = await touchContext.newPage();
      touchPage.on('pageerror', error => errors.push(error.message));
      await route('today', touchPage);
      await touchPage.getByRole('navigation', { name: 'ناوبری پایین موبایل' }).getByRole('button', { name: 'بیشتر', exact: true }).tap();
      await touchPage.getByRole('button', { name: 'شخصی‌سازی منو', exact: true }).tap();
      await touchPage.getByRole('heading', { name: 'شخصی‌سازی منو', exact: true }).waitFor();
      assert.equal(await touchPage.locator('button[draggable="true"]').count(), 0);
      const down = touchPage.getByRole('button', { name: 'امروز پایین‌تر', exact: true });
      await down.tap();
      await eventually(async () => (await touchPage.locator('nav[aria-label="ناوبری پایین موبایل"] button').first().innerText()).trim() === 'کارها', 'touch reorder persisted');
      const appearance = await down.evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, tapHighlight: getComputedStyle(el).webkitTapHighlightColor }));
      assert.equal(appearance.outline, 'none'); assert.equal(appearance.tapHighlight, 'rgba(0, 0, 0, 0)');
      check('touch-emulated Chromium navigates and reorders without a drag gesture or focus outline');
      await route('settings', touchPage);
      await touchPage.locator('input[type="file"]').setInputFiles({ name: 'kairos-test-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
      await touchPage.getByRole('button', { name: /۱. جایگزینی کامل/ }).click();
      await touchPage.getByRole('button', { name: 'تأیید و جایگزینی کامل داده‌ها', exact: true }).click();
      await touchPage.getByText(/اطلاعات فایل پشتیبان پس از ثبت اسنپ‌شات امنیتی/).waitFor();
      await touchPage.reload(); await route('projects', touchPage);
      await touchPage.getByRole('button', { name: longTitle, exact: true }).waitFor();
      await touchPage.getByLabel('پروژه', { exact: true }).selectOption({ label: projectTitle });
      await touchPage.getByRole('heading', { name: 'پیشرفت کل پروژه', exact: true }).waitFor();
      assert.deepEqual(await touchPage.locator('nav[aria-label="ناوبری پایین موبایل"] button > span:first-of-type').allTextContents(), ['امروز', 'کارها', 'پروژه‌ها', 'بیشتر']);
      check('restoring the exported backup into a second profile recovers the task, project and menu after reload');
    } finally { await touchContext.close(); }

    if (process.env.KAIROS_QA_OFFLINE === '1') {
      await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await context.setOffline(true); await route('projects'); await openNewTask(); await taskDialog().getByLabel('عنوان کار *', { exact: true }).fill('کار آفلاین'); await saveTask();
      await page.reload(); await page.getByRole('button', { name: 'کار آفلاین', exact: true }).waitFor();
      await route('capacity');
      await page.evaluate(() => {
        const post = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function (message, ...rest) {
          if (message?.action === 'calculate') this.addEventListener('message', event => {
            document.documentElement.dataset.qaOfflineWorkerStatus = event.data?.result?.status;
          }, { once: true });
          return post.call(this, message, ...rest);
        };
      });
      await page.getByRole('button', { name: 'بررسی ظرفیت و پیش‌نمایش', exact: true }).click();
      await page.getByRole('button', { name: 'تأیید و اعمال برنامه', exact: true }).waitFor();
      assert.equal(await page.locator('html').getAttribute('data-qa-offline-worker-status'), 'ready');
      await context.setOffline(false); check('production offline reopen, task save and bundled scheduling Worker');
    }
    await page.setViewportSize({ width: 390, height: 420 }); await route('projects'); await openNewTask();
    const footer = await taskDialog().locator('.kte-footer').boundingBox(); assert.ok(footer.y + footer.height <= 421, 'save footer stays in reduced visual viewport');
    let sawSaveFocus = false;
    await taskDialog().getByLabel('عنوان کار *', { exact: true }).focus();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const focus = await taskDialog().evaluate(el => { const active = document.activeElement; const closed = active?.closest('details:not([open])'); const style = getComputedStyle(active); return { inside: el.contains(active), hiddenDetail: !!closed && active.tagName !== 'SUMMARY', save: active?.textContent === 'ذخیرهٔ کار', outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 }; });
      assert.equal(focus.inside, true); assert.equal(focus.hiddenDetail, false); assert.equal(focus.outline, true); sawSaveFocus ||= focus.save;
    }
    assert.ok(sawSaveFocus, 'save remains reachable by keyboard with groups collapsed');
    await taskDialog().getByRole('button', { name: 'انصراف', exact: true }).click();
    check('reduced viewport shows the save footer, with visible keyboard focus throughout the collapsed form');

    assert.deepEqual(errors, []); check('no browser runtime errors');
    const scripts = await page.locator('script[src]').evaluateAll(items => items.map(item => new URL(item.src).pathname));
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ base, browser: browser.version(), scripts, offlineTested: process.env.KAIROS_QA_OFFLINE === '1', checks, errors, at: new Date().toISOString() }, null, 2));
    await Promise.all(['failure.txt', 'failure.png'].map(name => fs.rm(path.join(out, name), { force: true })));
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
    await fs.writeFile(path.join(out, 'failure.txt'), String(error) + '\n\n' + await page.locator('body').innerText() + '\n\nRuntime errors:\n' + errors.join('\n') + '\n\nPassed checks:\n' + checks.join('\n'));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
