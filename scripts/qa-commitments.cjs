const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const base=process.env.KAIROS_QA_URL || 'http://127.0.0.1:4185/kairos-app/';
const title='ویرایش کار فرضی';
async function database(page, operation, data) {
  return page.evaluate(({operation,data})=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('kairos_offline_db_v2');
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result, tx=db.transaction(['tasks','planningRecords'],operation==='read'?'readonly':'readwrite');
      const tasks=tx.objectStore('tasks'), plans=tx.objectStore('planningRecords');
      const t=tasks.getAll(), p=plans.getAll();
      if(operation==='write') for(const item of data) tasks.put(item);
      tx.oncomplete=()=>{db.close();resolve({tasks:t.result,plans:p.result});};
      tx.onerror=()=>reject(tx.error);
    };
  }),{operation,data});
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.KAIROS_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({locale:'fa-IR',timezoneId:'Asia/Tehran',hasTouch:true});
 const errors=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 await context.addInitScript(()=>localStorage.setItem('kairos_onboarding_seen_version','1'));
 const button=name=>page.getByRole('button',{name,exact:true});
 const label=name=>page.getByLabel(name,{exact:true});
 const route=async id=>{await page.goto(base+'#/'+id);await page.locator('main').waitFor();};
 const result=page.getByRole('region',{name:'نتیجهٔ بررسی'});
 try {
  await route('capacity');
  await label('تاریخ خاص (جایگزین برنامهٔ هفتگی وقت آزاد)').fill('2030-01-02');
  await label('شروع').fill('09:00');await label('پایان').fill('11:00');
  await button('افزودن بازه').click();await button('برداشتن بازه').waitFor();
  await context.clock.install({time:new Date('2030-01-02T08:00:00+03:30')});
  const task={id:'current',title:'تعهد فعلی',duration:30,priority:2,completed:false,status:'todo',targetDate:'2030-01-02',
    category:'work',tags:[],subtasks:[],revision:1,createdAt:'2029-01-01T09:00:00Z',updatedAt:'2029-01-01T09:00:00Z',planning:{initialEstimate:30}};
  await database(page,'write',[task,{...task,id:'waiting',title:'منتظر مشتری دیگر',planning:{waiting:true}}]);
  await page.reload();await button('اگر این کار را قبول کنم؟').waitFor();
  await label('کار برای تخمین').selectOption('current');await button('بررسی ظرفیت و پیش‌نمایش').click();
  await result.getByText(/فعلاً لحاظ نشده: منتظر مشتری دیگر/).waitFor();await button('تأیید و اعمال برنامه').click();
  await page.locator('.kp-schedule-row').filter({hasText:'تعهد فعلی'}).waitFor();
  const initial=await database(page,'read');
  const draft=async(minutes,due)=>{
    await button('اگر این کار را قبول کنم؟').click();await label('عنوان کار فرضی').fill(title);
    await label('مدت دستی (دقیقه)').fill(minutes);await label('موعد کار فرضی').fill('2030-01-02T'+due);
    await button('بررسی ظرفیت و پیش‌نمایش').click();await result.waitFor();
  };
  await draft('80','09:30');await result.getByText(/۸۰ دقیقه|80 دقیقه/).first().waitFor();
  assert.equal(await button('ثبت کار و اعمال همین برنامه').count(),0);assert.match(await result.innerText(),/پیوسته/);
  await button('لغو پیش‌نمایش').click();assert.deepEqual(await database(page,'read'),initial);
  await draft('','10:00');await result.getByText(/سناریوی فرضی با پیش‌فرض تایمر/).waitFor();
  assert.equal(await button('ثبت کار و اعمال همین برنامه').isDisabled(),true);
  await page.getByRole('checkbox',{name:/این مدت‌های فرضی/}).check();assert.equal(await button('ثبت کار و اعمال همین برنامه').isEnabled(),true);
  await button('لغو پیش‌نمایش').click();assert.deepEqual(await database(page,'read'),initial);
  console.log('PASS unrelated waiting, infeasible deadline, timer assumption, cancellation preserves tasks and plan');
  await draft('40','10:00');await result.getByText(/پایان پیشنهادی/).waitFor();
  const afterEdit={...task,duration:35,revision:2};await database(page,'write',[afterEdit]);
  await button('ثبت کار و اعمال همین برنامه').click();await page.getByText(/پیش‌نمایش تازه را بررسی و دوباره تأیید کن/).waitFor();
  assert.ok(!(await database(page,'read')).tasks.some(t=>t.title===title));
  await button('ثبت کار و اعمال همین برنامه').click();await page.locator('.kp-schedule-row').filter({hasText:title}).waitFor();
  const saved=await database(page,'read'), actual=saved.tasks.find(t=>t.title===title);
  assert.equal(actual.duration,40);assert.equal(actual.planning.initialEstimate,40);
  assert.ok(saved.plans.some(p=>p.collection==='allocations'&&p.value.taskId===actual.id&&p.value.durationBasis==='manual'));
  await draft('100','09:20');await button('فقط ثبت کار بدون زمان‌بندی').click();
  await page.getByText('کار ثبت شد. زمان‌بندی قبلی حفظ شد.').waitFor();
  const only=await database(page,'read');assert.equal(only.tasks.length,saved.tasks.length+1);assert.deepEqual(only.plans,saved.plans);
  console.log('PASS stale preview reviewed again, atomic confirm, task-only save preserves allocations');
  await route('settings');const key='عبارت نمونه برای آزمون پشتیبان کایروس';
  for(const theme of ['light','dark']) {
    await page.emulateMedia({colorScheme:theme});await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
    for(const width of [320,390]) {
      await page.setViewportSize({width,height:800});
      const password=label('گذرواژه رمزگذاری پشتیبان'), secure=button('دانلود امن');
      await page.evaluate(()=>document.fonts.ready);
      for(const element of [password,secure]) {
        await element.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
        // Wait for layout and overlays to settle exactly as a real touch action would.
        await element.tap({trial:true});
        const bounds=await element.evaluate(el=>{
          const r=el.getBoundingClientRect();
          return {left:r.left,right:r.right,height:r.height,viewport:innerWidth,control:el.tagName};
        });
        assert.ok(bounds.left>=0 && bounds.right<=width+0.5 && bounds.height>=44 && bounds.viewport===width,
          theme+'/'+width+' touch target '+JSON.stringify(bounds));
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await password.fill(key);
      const downloading=page.waitForEvent('download');await secure.tap();
      const bytes=await fs.readFile(await (await downloading).path());
      const envelope=JSON.parse(bytes);assert.equal(envelope.kdf.iterations,600000);
      await page.locator('input[type=file]').setInputFiles({name:'secure.json',mimeType:'application/json',buffer:bytes});
      await label('گذرواژه رمزگشایی فایل پشتیبان').fill(key);await button('رمزگشایی و بررسی').tap();
      await button('تأیید و جایگزینی کامل داده‌ها').tap();
      await page.getByText(/اطلاعات فایل پشتیبان پس از ثبت اسنپ‌شات امنیتی/).waitFor();
      const restored=await database(page,'read');assert.ok(restored.tasks.some(t=>t.id===actual.id));
      await page.reload();await secure.waitFor();console.log('PASS secure backup layout, touch download, decrypt and restore',theme,width);
    }
  }
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
