import {localDate, validDate, validTime} from './planning';

export type ReminderRule =
  | {mode: 'before'; minutes: number}
  | {mode: 'day'; days: number; time: string}
  | {mode: 'custom'; date: string; time: string};
export type EventKind = 'event' | 'exam' | 'appointment';
export type RepeatFrequency = 'daily' | 'weekly' | 'monthly';
export type ReminderTarget = {kind: 'task' | 'projectTask' | EventKind; itemId: string};

export interface ReminderTiming {
  date: string;
  time?: string;
  dueAtMs?: number;
  repeat?: RepeatFrequency;
}
export interface NativeReminder {
  id: string;
  item: ReminderTarget;
  triggerAtMs: number;
  title: string;
  text: string;
  open: ReminderTarget;
  repeat?: {frequency: RepeatFrequency; anchorDate: string; localTime?: string; rule: ReminderRule; timeZone: string};
}

export const reminderId = (collection: 'task' | 'event', id: string) => `kairos:${collection}:${id}`;
export const eventNames: Record<EventKind, string> = {event: 'رویداد', exam: 'امتحان', appointment: 'قرار'};

export function validateReminder(value: unknown): asserts value is ReminderRule {
  const r = value as ReminderRule | undefined;
  if (r && ((r.mode === 'before' && Number.isInteger(r.minutes) && r.minutes >= 0 && r.minutes <= 525600) ||
    (r.mode === 'day' && Number.isInteger(r.days) && r.days >= 0 && r.days <= 365 && validTime(r.time)) ||
    (r.mode === 'custom' && validDate(r.date) && validTime(r.time)))) return;
  throw Error('زمان یادآوری را کامل و معتبر وارد کن.');
}

function localTime(date: string, time?: string): number | undefined {
  if (!validDate(date) || !validTime(time)) return;
  const value = new Date(`${date}T${time}:00`);
  const local = `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  // A local time skipped by a daylight-saving transition does not exist.
  if (localDate(value) === date && local === time) return value.getTime();
}

export function resolveReminder(rule: ReminderRule, timing: ReminderTiming, now: number): number | undefined {
  try { validateReminder(rule); } catch { return; }
  if (rule.mode === 'custom') return timing.repeat ? undefined : localTime(rule.date, rule.time);
  if (!validDate(timing.date)) return;

  const anchor = new Date(timing.date + 'T12:00:00');
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  // Start near today even for a long-running series. Leave room for DST and offsets.
  const days = Math.max(0, Math.floor((+today - +anchor) / 86400000) - 2);
  const months = Math.max(0, (today.getFullYear()-anchor.getFullYear())*12 + today.getMonth()-anchor.getMonth()-1);
  const step = timing.repeat === 'weekly' ? 7 : 1;
  const start = timing.repeat === 'monthly' ? months : Math.floor(days / step);
  const count = timing.repeat ? (timing.repeat === 'monthly' ? 16 : Math.ceil(385 / step)) : 1;
  for (let i = 0; i < count; i++) {
    const occurrence = new Date(anchor);
    if (timing.repeat === 'monthly') {
      occurrence.setMonth(anchor.getMonth() + start + i);
      if (occurrence.getDate() !== anchor.getDate()) continue;
    } else if (timing.repeat) {
      occurrence.setDate(anchor.getDate() + (start + i) * step);
    }
    let trigger: number | undefined;
    if (rule.mode === 'day') {
      occurrence.setDate(occurrence.getDate() - rule.days);
      trigger = localTime(localDate(occurrence), rule.time);
    } else {
      const due = timing.repeat ? localTime(localDate(occurrence), timing.time) :
        timing.dueAtMs ?? localTime(timing.date, timing.time);
      if (due !== undefined) trigger = due - rule.minutes * 60000;
    }
    if (trigger !== undefined && (!timing.repeat || trigger > now)) return trigger;
  }
}

export const formatReminderTime = (ms: number) => new Date(ms).toLocaleString('fa-IR', {
  dateStyle: 'medium', timeStyle: 'short',
});

export function reminderProblem(rule: ReminderRule | undefined, timing: ReminderTiming, now: number): string | undefined {
  if (!rule) return;
  try { validateReminder(rule); } catch (error) { return (error as Error).message; }
  const trigger = resolveReminder(rule, timing, now);
  if (trigger === undefined) return rule.mode === 'before'
    ? 'برای این یادآوری، تاریخ و ساعت موعد را مشخص کن یا زمان دیگری انتخاب کن.'
    : 'این تاریخ و ساعت در منطقهٔ زمانی گوشی قابل استفاده نیست. زمان دیگری انتخاب کن.';
  if (trigger <= now) return 'زمان یادآوری گذشته است. زمان دیگری انتخاب کن یا یادآوری را خاموش کن.';
}

export function taskReminderTiming(date: string, dueAt?: string | null): ReminderTiming {
  const ms = dueAt ? Date.parse(dueAt) : NaN;
  return Number.isFinite(ms) ? {date:localDate(new Date(ms)), dueAtMs:ms} : {date};
}

export function nativeReminder(id: string, item: ReminderTarget, title: string, rule: ReminderRule,
  timing: ReminderTiming, now: number): NativeReminder | undefined {
  const trigger = resolveReminder(rule, timing, now);
  if (trigger === undefined || trigger <= now) return;
  const shortTitle = [...title].slice(0, 100).join('');
  const eventTime = timing.dueAtMs ?? localTime(timing.date,timing.time);
  const kind = item.kind === 'task' || item.kind === 'projectTask' ? 'کار' : eventNames[item.kind];
  const text = timing.repeat ? `یادآوری ${kind} تکرارشونده. برای دیدن جزئیات لمس کن.` :
    eventTime !== undefined
      ? `موعد ${kind} ${formatReminderTime(eventTime)} است.`
      : `زمان یادآوری ${kind} رسید. برای دیدن جزئیات لمس کن.`;
  return {id, item, triggerAtMs: trigger, title:shortTitle, text, open:item,
    ...(timing.repeat ? {repeat:{frequency:timing.repeat, anchorDate:timing.date, localTime:timing.time,
      rule, timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}} : {})};
}
