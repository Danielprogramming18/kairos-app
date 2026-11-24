import {useCallback, useEffect, useRef, useState} from 'react';
import type {ReminderHost} from '../application/repositories';
import {reminderMessages, statusForError, syncReminders, type ReminderStatus} from '../application/reminderSync';
import type {PlanningEvent} from '../domain/planning';
import {nativeReminder, reminderId, taskReminderTiming, type NativeReminder, type ReminderTarget} from '../domain/reminders';
import type {Task} from '../types';

export function useReminders(host:ReminderHost|undefined, ready:boolean, tasks:Task[], events:PlanningEvent[],
  navigate:(target:ReminderTarget)=>void) {
  const [revision, retry] = useState(0);
  const [state, setState] = useState<{key:string; outcome:Awaited<ReturnType<typeof syncReminders>>}>();
  const queue = useRef(Promise.resolve());
  const handleOpen = useRef(navigate);
  const lastOpened = useRef<string|undefined>(undefined);
  handleOpen.current = navigate;
  const desired:NativeReminder[] = [];
  const now = Date.now();
  for (const task of tasks) {
    if (!task.planning?.reminder || task.completed || task.status==='archived' || task.deletedAt) continue;
    const reminder = nativeReminder(reminderId('task',task.id),{kind:task.projectId?'projectTask':'task',itemId:task.id},
      task.title,task.planning.reminder,taskReminderTiming(task.targetDate,task.dueAt),now);
    if (reminder) desired.push(reminder);
  }
  for (const event of events) {
    if (!event.reminder) continue;
    const reminder = nativeReminder(reminderId('event',event.id),{kind:event.kind??'event',itemId:event.id},event.title,event.reminder,event,now);
    if (reminder) desired.push(reminder);
  }
  const key = JSON.stringify(desired);

  useEffect(()=>{
    if (!ready) return;
    let current = true;
    queue.current = queue.current.then(async()=>{
      if (!current) return;
      const outcome = await syncReminders(host,JSON.parse(key));
      if (current) setState({key,outcome});
    });
    return ()=>{current=false;};
  },[host,key,ready,revision]);

  useEffect(()=>{
    if (!ready || !host) return;
    let active = true;
    let opening = false;
    let pending = false;
    const open = async () => {
      if (opening) {pending=true;return;}
      opening = true;
      try {
        const message = await host.openTarget();
        if (!active || !message || typeof message.token!=='string' || !message.token ||
            !message.target || typeof message.target.itemId!=='string' || !message.target.itemId ||
            !['task','projectTask','event','exam','appointment'].includes(message.target.kind)) return;
        if (lastOpened.current!==message.token) {
          handleOpen.current(message.target);
          lastOpened.current=message.token;
        }
        await host.acknowledge(message.token);
      } catch { /* An older host may not support notification taps. */ }
      finally {opening=false;if (active && pending) {pending=false;void open();}}
    };
    const resume = () => {
      if (document.visibilityState==='hidden') return;
      retry(r=>r+1);
      void open();
    };
    void open();
    window.addEventListener('kairos-reminder-open',open);
    window.addEventListener('focus',resume);
    window.addEventListener('kairos-reminder-permission',resume);
    document.addEventListener('visibilitychange',resume);
    return ()=>{
      active=false;
      window.removeEventListener('kairos-reminder-open',open);
      window.removeEventListener('focus',resume);
      window.removeEventListener('kairos-reminder-permission',resume);
      document.removeEventListener('visibilitychange',resume);
    };
  },[host, ready]);

  const request = useCallback(async()=>{
    if (!host) return;
    try {await host.requestPermission();}
    catch (error) {setState({key,outcome:{statuses:{},fallback:statusForError(error),cancelFailed:false}});}
    finally {retry(r=>r+1);}
  },[host,key]);

  const outcome = state?.key===key ? state.outcome : undefined;
  const status = (id:string) => {
    if (!desired.some(r=>r.id===id)) return undefined;
    return outcome?.statuses[id] ?? outcome?.fallback ?? (host ? undefined : 'unsupported');
  };
  return {
    status, request,
    notice: (id:string) => {
      const s=status(id);
      return s ? reminderMessages[s] : undefined;
    },
    summary: outcome?.cancelFailed ? 'لغو بعضی اعلان‌های قبلی تأیید نشد. کایروس پس از بازگشت به برنامه دوباره بررسی می‌کند.' :
      desired.length && outcome
        ? outcome.fallback ? reminderMessages[outcome.fallback] :
          desired.some(r=>outcome.statuses[r.id]==='unconfirmed' || outcome.statuses[r.id]==='unsupported') ? reminderMessages.unconfirmed :
            desired.some(r=>outcome.statuses[r.id]==='permission') ? reminderMessages.permission :
              `اندروید زمان‌بندی ${desired.length.toLocaleString('fa-IR')} یادآوری را تأیید کرد.`
        : '',
  };
}
