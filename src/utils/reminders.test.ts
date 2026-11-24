import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeReminder, resolveReminder, reminderProblem, reminderId, taskReminderTiming} from '../domain/reminders';
import {syncReminders} from '../application/reminderSync';
import type {ReminderHost} from '../application/repositories';
import {emptyPlanning,validatePlanning} from '../domain/planning';
import {taskEditorDraft,validateTaskEditor} from './taskEditor';

const at = (time:string) => new Date(time).getTime();
const due = '2031-02-20T08:00';
const now = at('2031-02-19T12:00');
const timing = {date:'2031-02-20',time:'08:00'};
const before = {mode:'before',minutes:15} as const;
const id = reminderId('task','a');
const task = nativeReminder(id,{kind:'projectTask',itemId:'a'},'تمرین شبکه',before,timing,now)!;

test('deadline offsets, the morning of an exam and custom local times use phone time',()=>{
  assert.equal(task.triggerAtMs,at('2031-02-20T07:45'));
  assert.equal(resolveReminder({mode:'day',days:1,time:'08:00'},timing,now),at('2031-02-19T08:00'));
  assert.equal(resolveReminder({mode:'custom',date:'2031-02-20',time:'07:30'},timing,now),at('2031-02-20T07:30'));
  assert.equal(resolveReminder(before, taskReminderTiming(timing.date,new Date(due).toISOString()), now),task.triggerAtMs);
  assert.match(reminderProblem(before,timing,at(due))!,/گذشته/);
  assert.match(reminderProblem(before,{date:timing.date},now)!,/موعد/);
});

test('weekly recurrence finds the next local occurrence and monthly skips missing dates',()=>{
  const weekly={...timing,repeat:'weekly' as const};
  const reminder=nativeReminder(reminderId('event','e'),{kind:'exam',itemId:'e'},'امتحان شبکه',
    {mode:'day',days:1,time:'08:00'},weekly,now)!;
  assert.equal(reminder.triggerAtMs,at('2031-02-26T08:00'));
  assert.equal(reminder.repeat?.frequency,'weekly');
  assert.equal(reminder.repeat?.anchorDate,timing.date);
  assert.equal(resolveReminder(before,{date:'2031-01-31',time:'08:00',repeat:'monthly'},at('2031-02-01T08:00')),at('2031-03-31T07:45'));
});

test('a task retains valid reminder settings and can change or turn them off',()=>{
  const draft=taskEditorDraft(null,'2099-02-20');
  draft.title='Task';
  draft.planning.reminder=before;
  assert.match(validateTaskEditor(draft,'2099-02-20').errors.nativeReminder,/موعد/);
  draft.dueAt='2099-02-20T08:00';draft.dueEdited=true;
  assert.deepEqual(validateTaskEditor(draft,'2099-02-20').data?.planning?.reminder,before);
  delete draft.planning.reminder;
  assert.equal(validateTaskEditor(draft,'2099-02-20').data?.planning?.reminder,undefined);
  const old=emptyPlanning();old.events.push({id:'legacy',title:'Legacy',date:'2099-02-20'});
  assert.deepEqual(validatePlanning(old),old);
});

test('sync replaces by stable id, cancels removed items and leaves other notifications alone',async()=>{
  const saved=new Map([[reminderId('event','deleted'),0],['other-app:alarm',1]]);
  const host:ReminderHost={
    permission:async()=> 'granted', requestPermission:async()=> 'granted',
    list:async()=>({ids:[...saved.keys()]}),
    schedule:async r=>{saved.set(r.id,r.triggerAtMs);return {status:'scheduled',id:r.id};},
    cancel:async id=>{saved.delete(id);return {status:'cancelled',id};},
    openTarget:async()=>null, acknowledge:async()=>null,
  };
  assert.equal((await syncReminders(host,[task])).statuses[id],'scheduled');
  await syncReminders(host,[{...task,triggerAtMs:task.triggerAtMs+60000}]);
  assert.deepEqual([...saved], [['other-app:alarm',1],[id,task.triggerAtMs+60000]]);
  await syncReminders(host,[]);
  assert.deepEqual([...saved.keys()],['other-app:alarm']);
  assert.equal((await syncReminders(undefined,[task])).fallback,'unsupported');
  assert.equal((await syncReminders({...host,permission:async()=> 'denied'},[task])).fallback,'permission');
  assert.equal((await syncReminders({...host,schedule:async()=> null as never},[task])).statuses[id],'unconfirmed');
});
