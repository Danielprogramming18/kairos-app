import React, {useId} from 'react';
import {formatReminderTime, reminderProblem, resolveReminder, type ReminderRule, type ReminderTiming} from '../domain/reminders';

export function ReminderFields({value,onChange,timing,notice,canRequest,request,task=false}: {
  value?: ReminderRule; onChange:(rule?:ReminderRule)=>void; timing:ReminderTiming;
  notice?:string; canRequest?:boolean; request?:()=>void; task?:boolean;
}) {
  const id=useId();
  const now=Date.now();
  const next=value && resolveReminder(value,timing,now);
  const problem=reminderProblem(value,timing,now);
  const defaults:Record<ReminderRule['mode'],ReminderRule>={
    before:{mode:'before',minutes:0},
    day:{mode:'day',days:0,time:'08:00'},
    custom:{mode:'custom',date:timing.date,time:'08:00'},
  };
  const mainClass = task ? 'kte-field' : 'kp-field';
  return <div>
    <div className={mainClass}><label htmlFor={id}>یادآوری</label>
    <select id={id} value={value?.mode ?? ''} onChange={e=>onChange(defaults[e.target.value as ReminderRule['mode']])}>
      <option value="">خاموش</option>
      <option value="before">{task ? 'سر موعد یا چند دقیقه قبل' : 'سر ساعت رویداد یا چند دقیقه قبل'}</option>
      {!task && <option value="day">ساعت دلخواه در همان روز یا روزهای قبل</option>}
      {!timing.repeat && <option value="custom">تاریخ و ساعت دلخواه (میلادی)</option>}
    </select></div>
    {value?.mode==='before' && <label className={mainClass}>فاصله تا موعد (دقیقه، صفر یعنی سر موعد)
      <input type="number" min="0" max="525600" value={value.minutes<0?'':value.minutes} onChange={e=>onChange({...value,minutes:e.target.value===''?-1:Number(e.target.value)})}/>
    </label>}
    {value?.mode==='day' && <label className={mainClass}>چند روز قبل؟ (صفر یعنی همان روز)
      <input type="number" min="0" max="365" value={value.days<0?'':value.days} onChange={e=>onChange({...value,days:e.target.value===''?-1:Number(e.target.value)})}/>
    </label>}
    {value?.mode==='custom' && <label className={mainClass}>تاریخ یادآوری (میلادی)
      <input type="date" value={value.date} onChange={e=>onChange({...value,date:e.target.value})}/>
    </label>}
    {value && value.mode!=='before' && <label className={mainClass}>ساعت یادآوری
      <input type="time" value={value.time} onChange={e=>onChange({...value,time:e.target.value})}/>
    </label>}
    {problem ? <p role="status">{problem}</p> : next!==undefined && <p>زمان پیشنهادی اعلان {formatReminderTime(next)}</p>}
    {notice && <p role="status">{notice}</p>}
    {value && canRequest && <button type="button" onClick={request}>فعال‌کردن مجوز اعلان اندروید</button>}
  </div>;
}
