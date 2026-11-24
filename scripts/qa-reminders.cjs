const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.KAIROS_QA_URL || 'http://127.0.0.1:4186/';
const targetDate = '2099-02-20';
const reminderTitle = 'امتحان شبکه آزمایشی';
const taskTitle = 'کار با یادآور آزمایشی';
const diagnostics = [];

(async () => {
  const browser=await chromium.launch({headless:true,executablePath:process.env.KAIROS_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    for (const native of [false,true]) {
      const ctx=await browser.newContext({timezoneId:'Asia/Tehran'});
      await ctx.addInitScript(native=>{
        localStorage.setItem('kairos_onboarding_seen_version','1');
        if (!native) return;
        const read=(key,fallback)=>JSON.parse(localStorage.getItem(key))??fallback;
        const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
        window.fakePut=write;window.fakeGet=read;
        const emptyMeta={key:'meta',collection:'meta',position:0,value:{schemaVersion:1,revision:0,storageVersion:1,
          breakMinutes:0,minimumSamples:3,layout:{mobile:{order:[],hidden:[],pinned:[]},desktop:{order:[],hidden:[],pinned:[]}}}};
        window.KairosAndroidBridge={postMessage(raw){
          const {requestId,version,operation,payload}=JSON.parse(raw);
          const plans=read('test-plans',[emptyMeta]);
          const tasks=read('test-tasks',{});
          const alarms=read('test-alarms',{});
          let data=null;
          switch(operation) {
            case 'settings.get': data={id:'default',theme:'system',soundEnabled:false,updatedAt:new Date().toISOString()};break;
            case 'tasks.list': data=Object.values(tasks);break;
            case 'tasks.upsert': {
              data={...payload.task,revision:(tasks[payload.task.id]?.revision??0)+1};
              tasks[data.id]=data;write('test-tasks',tasks);break;
            }
            case 'planning.get': data={revision:plans.find(p=>p.key==='meta').value.revision,records:plans,nextCursor:null};break;
            case 'planning.save': {
              const rows=new Map(plans.map(p=>[p.key,p]));
              payload.deletes.forEach(id=>rows.delete(id));
              payload.upserts.forEach(p=>rows.set(p.key,p));
              write('test-plans',[...rows.values()]);data={revision:payload.revision};break;
            }
            case 'habits.list': case 'notes.list': case 'focus.listSessions': data=[];break;
            case 'notifications.getPermission': data=read('test-permission','denied');break;
            case 'notifications.requestPermission': write('test-permission','granted');data='granted';break;
            case 'notifications.listReminders': data={ids:Object.keys(alarms)};break;
            case 'notifications.scheduleReminder': {
              const reminder=payload.reminder;alarms[reminder.id]=reminder;write('test-alarms',alarms);
              data={status:'scheduled',id:reminder.id};break;
            }
            case 'notifications.cancelReminder': delete alarms[payload.id];write('test-alarms',alarms);data={status:'cancelled',id:payload.id};break;
            case 'notifications.getOpenTarget': data=read('test-open',null);break;
            case 'notifications.ackOpenTarget': if (read('test-open',null)?.token===payload.token) write('test-open',null);break;
          }
          return JSON.stringify({requestId,version,ok:true,data});
        }};
      },native);
      const page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>diagnostics.push(e.message));
      await page.goto(base+'#/events');
      const label=name=>page.getByLabel(name,{exact:true});
      const button=name=>page.getByRole('button',{name,exact:true});
      const row=page.locator('article').filter({has:page.getByRole('heading',{name:reminderTitle})});
      const waitAlarms=async count=>page.waitForFunction(n=>Object.keys(window.fakeGet('test-alarms',{})).length===n,count);
      await label('عنوان رویداد').fill(reminderTitle);
      await label('نوع رویداد').selectOption('exam');
      await label('تاریخ').fill(targetDate);
      await label('ساعت اختیاری').fill('11:00');
      await label('تکرار').selectOption('weekly');
      await label('یادآوری').selectOption('day');
      await label('چند روز قبل؟ (صفر یعنی همان روز)').fill('1');
      await label('ساعت یادآوری').fill('08:00');
      await page.getByText(/زمان پیشنهادی اعلان/).waitFor();
      await button('ذخیرهٔ رویداد').click();
      await row.waitFor();
      if (native) {
        await row.getByText(/برای دریافت اعلان، مجوز اندروید/).waitFor();await waitAlarms(0);
        await row.getByRole('button',{name:'ویرایش'}).click();
        await button('فعال‌کردن مجوز اعلان اندروید').click();await waitAlarms(1);
        await row.getByText(/اندروید زمان‌بندی اعلان را تأیید کرد/).waitFor();
        const original=await page.evaluate(()=>Object.values(window.fakeGet('test-alarms',{}))[0]);
        assert.equal(original.item.kind,'exam');assert.equal(original.repeat.frequency,'weekly');
        await label('ساعت یادآوری').fill('09:00');
        await button('ذخیرهٔ رویداد').click();
        await page.waitForFunction(id=>window.fakeGet('test-alarms',{})[id]?.repeat.rule.time==='09:00',original.id);
        const next=await page.evaluate(id=>window.fakeGet('test-alarms',{})[id],original.id);
        assert.equal(next.triggerAtMs-original.triggerAtMs,3600000);
        await page.evaluate(r=>window.fakePut('test-open',{token:'cold',target:r.open}),next);
        await page.goto(base+'#/today');await page.reload();
        await label('عنوان رویداد').waitFor();assert.equal(await label('عنوان رویداد').inputValue(),reminderTitle);
        await page.waitForFunction(()=>window.fakeGet('test-open',null)===null);
        await waitAlarms(1);
      } else await row.getByText(/زمان‌بندی اعلان اندروید.*در دسترس نیست/).waitFor();
      await page.reload();await row.waitFor();await row.getByRole('button',{name:'ویرایش'}).click();
      assert.equal(await label('یادآوری').inputValue(),'day');
      await row.getByRole('button',{name:'حذف',exact:true}).click();
      await row.getByRole('button',{name:'تأیید حذف رویداد'}).click();
      await row.waitFor({state:'detached'});
      if (native) {
        await waitAlarms(0);
        await page.evaluate(()=>{
          window.fakePut('test-open',{token:'removed',target:{kind:'exam',itemId:'removed-id'}});
        });
        await page.goto(base+'#/today');await page.reload();
        await page.getByRole('heading',{name:'رویدادها و امتحان‌ها',exact:true}).waitFor();
        await page.waitForFunction(()=>window.fakeGet('test-open',null)===null);
        assert.equal(await label('عنوان رویداد').inputValue(),'');
      }

      await page.goto(base+'#/projects');
      await button('کار جدید').first().click();
      const dialog=page.getByRole('dialog');
      await dialog.getByLabel('عنوان کار *').fill(taskTitle);
      await dialog.getByLabel('یادآوری',{exact:true}).selectOption('custom');
      await dialog.getByLabel('تاریخ یادآوری (میلادی)').fill(targetDate);
      await dialog.getByLabel('ساعت یادآوری').fill('07:30');
      await dialog.getByText(/زمان پیشنهادی اعلان/).waitFor();
      await dialog.getByRole('button',{name:'ذخیرهٔ کار',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
      if (native) {
        await waitAlarms(1);
        const scheduled=await page.evaluate(()=>Object.values(window.fakeGet('test-alarms',{}))[0]);
        assert.equal(scheduled.triggerAtMs,new Date(targetDate+'T07:30+03:30').getTime());
        await page.evaluate(target=>{
          window.fakePut('test-open',{token:'warm',target});
          window.dispatchEvent(new Event('kairos-reminder-open'));
        },scheduled.open);
        await dialog.waitFor();assert.equal(await dialog.getByLabel('عنوان کار *').inputValue(),taskTitle);
        await dialog.getByRole('button',{name:'انصراف',exact:true}).click();
        await page.goto(base+'#/projects');await page.getByRole('checkbox',{name:'انجام '+taskTitle,exact:true}).check();
        await waitAlarms(0);
      } else {
        await page.reload();
        await button(taskTitle).click();
        assert.equal(await dialog.getByLabel('یادآوری',{exact:true}).inputValue(),'custom');
      }
      await ctx.close();
      console.log('PASS',native?'mock Android: permission, timestamps, update, reopen, delete, complete, warm + cold routing':'web: saved and reopened both item types without an Android bridge');
    }
    assert.deepEqual(diagnostics,[]);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
