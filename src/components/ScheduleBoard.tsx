import React,{useState} from 'react';
import type {Task} from '../types';
import {localDate} from '../domain/planning';
import {usePlanning} from '../app/PlanningContext';
import {domainEntityToTask,usePlatform} from '../app/PlatformContext';
import {moveScheduleAllocation,withConfirmedScheduleDurations} from '../utils/planningEngine';
import {scheduleRows,taskRevisionSnapshot} from '../utils/scheduleView';
import {basisLabels} from '../utils/commitmentReview';
import {Field,useClock} from './PlanningShared';

const localInput=(timestamp:string)=>{const d=new Date(timestamp);return `${localDate(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
export function ScheduleBoard({tasks,date,title='برنامهٔ تأییدشده',onEdit,compact=false}:{tasks:Task[];date?:string;title?:string;onEdit?:(id:string)=>void;compact?:boolean}) {
  const {state,change,refresh,ready}=usePlanning();const {container}=usePlatform();const now=useClock();
  const [editing,setEditing]=useState<string|null>(null),[start,setStart]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const rows=scheduleRows(withConfirmedScheduleDurations(state.allocations,now),tasks,date==='today'?localDate(now):date);const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const move=async(key:string,taskId:string,oldStart:string,oldEnd:string)=>{
    if(busy)return;setBusy(true);setMessage('');
    try {
      const [fresh,entities]=await Promise.all([container.planning.getPlanning(),container.tasks.listTasks()]);const freshTasks=entities.map(domainEntityToTask);
      const index=fresh.allocations.findIndex(a=>a.taskId===taskId&&a.start===oldStart&&a.end===oldEnd);
      if(index<0)throw Error('این بازه تغییر کرده است؛ برنامه را تازه کن.');
      const result=moveScheduleAllocation(fresh,freshTasks,index,new Date(start).toISOString(),new Date());
      if(!result.valid)throw Error(result.messages.join(' '));
      await container.planning.savePlanning({...fresh,revision:fresh.revision+1,previousAllocations:withConfirmedScheduleDurations(fresh.allocations,new Date()),allocations:result.allocations},{expectedRevision:fresh.revision,expectedTaskRevisions:taskRevisionSnapshot(freshTasks)});
      await refresh();setEditing(null);setMessage('بازه پس از بررسی تعارض و موعد جابه‌جا شد.');
    }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  };
  if(!ready)return null;
  return <section className="kp kp-card" aria-label={title}><h3>{title}</h3>{!rows.length?<p>بازهٔ تأییدشده‌ای برای این روز ثبت نشده است.</p>:<><p className="kp-subtle">منطقهٔ نمایش: {timezone}. زمان‌ها به‌صورت لحظهٔ ثابت ذخیره می‌شوند؛ تغییر منطقهٔ زمانی فقط روز و ساعت نمایش را تغییر می‌دهد.</p>{rows.map(({allocation:a,index,task})=>{const key=a.taskId+a.start;const past=Date.parse(a.end)<now.getTime();const overdue=!!task.dueAt&&!task.completed&&Date.parse(task.dueAt)<now.getTime();return <article key={key} className="kp-schedule-row"><div className="kp-actions">{onEdit?<button className="kp-link" onClick={()=>onEdit(task.id)}>{task.title}</button>:<strong>{task.title}</strong>}<span>{task.completed?'انجام‌شده':task.status==='archived'?'بایگانی':past?'بازهٔ گذشته':'برنامه‌ریزی‌شده'}</span>{a.locked&&<small>قفل‌شده</small>}{overdue&&<small>موعد گذشته</small>}</div><p><time dateTime={a.start}>{new Date(a.start).toLocaleString('fa-IR')}</time> تا <time dateTime={a.end}>{new Date(a.end).toLocaleString('fa-IR')}</time></p>{a.durationBasis && <small>مبنای مدت: {basisLabels[a.durationBasis]}</small>}{a.plannedTaskMinutes !== undefined && <p>مدت مبنای این برنامه: {a.plannedTaskMinutes?.toLocaleString('fa-IR')} دقیقه.</p>}{a.durationBasis && <small>مبنای مدت: {basisLabels[a.durationBasis]}</small>}{a.plannedTaskMinutes !== undefined && a.plannedTaskMinutes !== (task.planning?.remainingMinutes ?? task.duration) && <p>مدت تنظیم‌شدهٔ فعلی کار {(task.planning?.remainingMinutes ?? task.duration).toLocaleString('fa-IR')} دقیقه است. جابه‌جایی و بازگردانی، مدت تأییدشده را حفظ می‌کنند. برای اعمال مدت تازه، دوباره محاسبه و تأیید کن. اگر بازه قفل است، ابتدا قفل را بردار.</p>}{!compact&&<div className="kp-actions"><label><input type="checkbox" checked={!!a.locked} disabled={busy} onChange={e=>void change(s=>{const current=s.allocations[index];if(!current||current.taskId!==a.taskId||current.start!==a.start)throw Error('بازه تغییر کرده؛ دوباره تلاش کن.');current.locked=e.target.checked;current.plannedTaskMinutes=a.plannedTaskMinutes;})}/> حفظ بازه / قفل</label><button disabled={busy||!!a.locked||task.completed||task.status==='archived'||past} onClick={()=>{setEditing(editing===key?null:key);setStart(localInput(a.start));setMessage('');}}>جابه‌جایی بازه</button></div>}{editing===key&&<form className="kp-actions" onSubmit={e=>{e.preventDefault();void move(key,a.taskId,a.start,a.end);}}><Field label={`شروع تازه برای ${task.title}`}><input required type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></Field><button disabled={busy}>بررسی و ذخیرهٔ جابه‌جایی</button><button type="button" disabled={busy} onClick={()=>setEditing(null)}>انصراف</button></form>}</article>;})}</>}<p role="status">{message}</p><small>کارِ حذف‌شده نمایش داده نمی‌شود. بازهٔ گذشته خودکار به روز دیگری منتقل نمی‌شود.</small></section>;
}
