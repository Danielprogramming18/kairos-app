import type {FocusSession, Task} from '../types';
import {localDate, type PlanningState} from '../domain/planning';
import {estimateDuration, withConfirmedScheduleDurations} from './planningEngine';

export interface ScenarioDraft {
  id: string;
  title: string;
  minutes: string;
  workType: string;
  due: string;
  projectId: string;
  splittable: boolean;
}
export function hypotheticalTask(draft: ScenarioDraft, timerMinutes: number, now: Date): Task {
  const minutes = draft.minutes.trim() ? Number(draft.minutes) : timerMinutes;
  if (!draft.title.trim()) throw Error('عنوان کار فرضی را وارد کن.');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 100000) throw Error('مدت باید عددی صحیح بین ۱ و ۱۰۰٬۰۰۰ دقیقه باشد.');
  const due = new Date(draft.due);
  if (!Number.isFinite(due.getTime())) throw Error('تاریخ و ساعت موعد را وارد کن.');
  return {id:draft.id, title:draft.title.trim(), duration:minutes, dueAt:due.toISOString(),
    projectId:draft.projectId || null, priority:3, targetDate:localDate(now), completed:false, status:'todo',
    planning:{workType:draft.workType.trim() || undefined, splittable:draft.splittable,
      initialEstimate:draft.minutes.trim() ? minutes : undefined}};
}

export function commitmentInputs(state: PlanningState, tasks: Task[], sessions: FocusSession[], target: Task | undefined,
  hypothetical: boolean, extraWaiting: string[], now: Date) {
  const reserved = new Map(withConfirmedScheduleDurations(state.allocations, now)
    .filter(slot => Date.parse(slot.end) > now.getTime()).map(slot => [slot.taskId, slot.plannedTaskMinutes]));
  const active = tasks.filter(t => !t.completed && !t.deletedAt && t.status !== 'archived');
  const omitted: Task[] = [];
  const included = active.filter(t => {
    if (!t.planning?.waiting || t.id === target?.id ||
        (target?.projectId && t.projectId === target.projectId) || extraWaiting.includes(t.id)) return true;
    omitted.push(t);
    return false;
  });
  const estimate = target ? estimateDuration(target, tasks, sessions, state.minimumSamples, now.getTime()) : null;
  const rows = (hypothetical && target ? [...included, target] : included).map(t => {
    const isTarget = t.id === target?.id;
    const approved = reserved.get(t.id);
    const locked = isTarget && state.allocations.some(a => a.taskId === t.id && a.locked && Date.parse(a.end) > now.getTime());
    let minutes = t.duration;
    let basis = t.planning?.initialEstimate ? 'manual' : t.planning?.durationSource ?? 'timer';
    if (approved !== undefined && (hypothetical || locked)) { minutes = approved; basis = 'approved'; }
    else if (t.planning?.remainingMinutes !== undefined) { minutes = t.planning.remainingMinutes; basis = 'remaining'; }
    else if (isTarget && estimate?.source === 'history' && !(hypothetical && t.planning?.initialEstimate)) {
      minutes = estimate.minutes!; basis = 'history';
    }
    return {task:t, minutes, basis};
  });
  const inputs = rows.map(({task, minutes, basis}) => ({...task, duration:minutes,
    planning:basis === 'approved' ? {...task.planning,remainingMinutes:minutes} : task.planning}));
  const excludedIds = new Set(omitted.map(t=>t.id));
  const calendar = {...state, reservedOutsideScope:state.allocations.filter(a=>excludedIds.has(a.taskId) && Date.parse(a.end)>now.getTime())};
  return {calendar, inputs, omitted, rows, estimate, assumptions:rows.filter(row => row.basis === 'timer')};
}

export const basisLabels: Record<string,string> = {
  manual:'ورودی دستی', remaining:'مدت باقی‌ماندهٔ دستی', history:'سابقهٔ کار مشابه',
  timer:'پیش‌فرض تایمر', approved:'مدت برنامهٔ تأییدشده',
};
