const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=process.env.KAIROS_QA_URL||'http://127.0.0.1:4173/';
const out=path.resolve(__dirname,'../qa-output');
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.KAIROS_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1366,height:900},locale:'fa-IR'});
 await context.addInitScript(()=>localStorage.setItem('kairos_onboarding_seen_version','1'));
 const page=await context.newPage(); const errors=[];const checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 const check=label=>{checks.push(label);console.log('PASS',label)};
 const route=async id=>{await page.goto(base+'#/'+id);await page.locator('section.kp h2').waitFor()};
 try {
 await route('projects');
 await page.getByLabel('نام پروژه',{exact:true}).fill('پروژه آزمایشی کایروس');
 await page.getByLabel('توضیح',{exact:true}).fill('آزمون حفظ اطلاعات');
 await page.getByRole('button',{name:'ساخت پروژه',exact:true}).click();
 await page.getByRole('button',{name:'ذخیرهٔ پروژه',exact:true}).waitFor();
 await page.getByLabel('مرحلهٔ جدید').fill('مرحله اول');
 await page.getByRole('button',{name:'افزودن مرحله',exact:true}).click();
 await page.getByLabel('نام مرحله مرحله اول',{exact:true}).waitFor();check('project and stage creation');
 await page.locator('section.kp').getByRole('button',{name:'کار جدید',exact:true}).click();
 await page.locator('#task-modal-title-input').fill('ساخت قابلیت‌های کایروس');
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('پروژه',{exact:true}).selectOption({label:'پروژه آزمایشی کایروس'});
 await dialog.getByLabel('مرحله',{exact:true}).selectOption({label:'مرحله اول'});
 await dialog.getByLabel('از اینجا ادامه بده',{exact:true}).fill('از بررسی پشتیبان ادامه بده');
 await dialog.getByLabel('مدت باقی‌مانده (دقیقه)',{exact:true}).fill('35');
 await dialog.getByLabel('حجم کار (مثلاً تعداد سؤال)',{exact:true}).fill('10');
 await dialog.getByLabel('واحد حجم کار',{exact:true}).fill('قابلیت');
 await dialog.getByLabel('کار قابل تقسیم به چند جلسه است').check();
 await dialog.getByRole('button',{name:'ذخیرهٔ کار',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 await page.getByText('از اینجا ادامه بده: از بررسی پشتیبان ادامه بده').waitFor();
 await page.reload();
 await page.getByRole('button',{name:'ساخت قابلیت‌های کایروس',exact:true}).click();
 assert.equal(await page.getByRole('dialog').getByLabel('از اینجا ادامه بده',{exact:true}).inputValue(),'از بررسی پشتیبان ادامه بده');
 await page.getByRole('dialog').getByRole('button',{name:'انصراف',exact:true}).click();check('task planning persists after reload');
 await route('events');
 await page.getByLabel('عنوان رویداد',{exact:true}).fill('موعد آزمایشی');
 await page.getByLabel('تاریخ',{exact:true}).fill('2026-12-01');
 await page.getByRole('button',{name:'ذخیرهٔ رویداد',exact:true}).click();
 await page.getByRole('heading',{name:'موعد آزمایشی',exact:true}).waitFor();check('event countdown');
 await route('tracking');
 await page.getByLabel('نام شاخص',{exact:true}).fill('تعداد سؤال');
 await page.getByLabel('واحد',{exact:true}).fill('سؤال');
 await page.getByRole('button',{name:'ذخیرهٔ شاخص',exact:true}).click();
 await page.getByLabel('مقدار (سؤال)',{exact:true}).fill('۱۲٫۵');
 await page.getByRole('button',{name:'ثبت مقدار',exact:true}).click();
 await page.getByRole('cell',{name:/12\.5 سؤال|۱۲٫۵ سؤال/}).waitFor();
 await page.getByRole('button',{name:'ویرایش مشخصات شاخص',exact:true}).click();
 await page.getByLabel('نام شاخص',{exact:true}).waitFor({state:'visible'});
 assert.equal(await page.getByLabel('واحد',{exact:true}).isDisabled(),true);check('Persian decimal metric and unit preservation');
 await route('projects');
 await page.getByRole('button',{name:'جلسهٔ مطالعه',exact:true}).click();
 await page.getByRole('button',{name:'تأیید ساخت 3 کار',exact:true}).click();
 await page.getByRole('button',{name:'مطالعهٔ بخش جدید',exact:true}).waitFor();check('template preview and batch creation');
 await route('customize');
 const row=page.locator('.kp-card').filter({has:page.getByRole('button',{name:'رویدادها',exact:true})}).first();
 await row.getByLabel('مخفی',{exact:true}).click();
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('aside button')).some(b=>b.textContent.trim()==='رویدادها'));
 assert.equal(await page.locator('aside').getByRole('button',{name:'رویدادها',exact:true}).count(),0);
 await row.getByRole('button',{name:'رویدادها',exact:true}).click();
 await page.getByRole('heading',{name:'رویدادها و امتحان‌ها',exact:true}).waitFor();check('hidden destination remains accessible');
 await route('capacity');
 const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);const date=[tomorrow.getFullYear(),String(tomorrow.getMonth()+1).padStart(2,'0'),String(tomorrow.getDate()).padStart(2,'0')].join('-');
 await page.getByLabel('تاریخ خاص (جایگزین برنامهٔ هفتگی وقت آزاد)',{exact:true}).fill(date);
 await page.getByLabel('شروع',{exact:true}).fill('09:00');await page.getByLabel('پایان',{exact:true}).fill('18:00');
 await page.getByRole('button',{name:'افزودن بازه',exact:true}).click();
 await page.getByRole('button',{name:'برداشتن بازه',exact:true}).waitFor();
 await page.getByRole('button',{name:'بررسی ظرفیت و پیش‌نمایش',exact:true}).click();
 await page.getByRole('button',{name:'تأیید و اعمال برنامه',exact:true}).waitFor();
 await page.getByRole('button',{name:'تأیید و اعمال برنامه',exact:true}).click();
 await page.getByRole('heading',{name:'برنامهٔ تأییدشده',exact:true}).waitFor();check('capacity preview and apply');
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme});
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:900});
   for(const id of ['projects','events','tracking','capacity','customize']){
    await route(id);await page.waitForTimeout(100);
    const size=await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(size.scroll<=size.inner+1,`${id}/${width}/${theme}: horizontal overflow ${JSON.stringify(size)}`);
   }
   await route('projects');await page.screenshot({path:path.join(out,`projects-${theme}-${width}.png`),fullPage:true});
  }
 }
 check('five new routes at 320/390/768/1366 in light and dark');
 await page.setViewportSize({width:1366,height:900});
 await page.goto(base+'#/sync');
 const exportButton=page.getByRole('button',{name:'دانلود فایل پشتیبان (JSON)',exact:true});
 const downloadPending=page.waitForEvent('download');await exportButton.click();const download=await downloadPending;
 const exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));
 assert.equal(exported.payload.settings.planning.projects.length,1);
 assert.equal(exported.payload.settings.planning.events.length,1);
 assert.equal(exported.payload.settings.planning.metrics[0].entries[0].value,12.5);
 assert.equal(exported.payload.settings.planning.allocations.length,4);
 assert.ok(exported.payload.settings.planning.layout.desktop.hidden.includes('events'));
 assert.equal(exported.payload.tasks.find(t=>t.title==='ساخت قابلیت‌های کایروس').planning.resume,'از بررسی پشتیبان ادامه بده');
 check('UI backup exports all planning and task metadata');
 if(process.env.KAIROS_QA_OFFLINE==='1'){
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await route('projects');
  await page.getByRole('button',{name:'ساخت قابلیت‌های کایروس',exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'ساخت قابلیت‌های کایروس',exact:true}).waitFor();
  await route('capacity');await page.getByRole('button',{name:'بررسی ظرفیت و پیش‌نمایش',exact:true}).click();
  await page.getByRole('button',{name:'تأیید و اعمال برنامه',exact:true}).waitFor();
  check('offline reload and bundled scheduling Worker');await context.setOffline(false);
 }
 assert.deepEqual(errors,[]);check('no browser runtime errors');
 await fs.writeFile(path.join(out,'browser-result.json'),JSON.stringify({checks,errors,at:new Date().toISOString()},null,2));
 } catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});await fs.writeFile(path.join(out,'failure.txt'),(await page.locator('body').innerText())+'\n'+String(e));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
