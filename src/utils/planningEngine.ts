import type { FocusSession, Task } from '../types';
import { Allocation, localDate, Metric, normalizeText, PlanningEvent, PlanningState, TaskTemplate, TimeWindow } from '../domain/planning';
import { createEntityId } from '../domain/models';
type Interval = {
  start: number;
  end: number;
};
export function mergeIntervals(items: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of items.filter(x => x.end > x.start).sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);else out.push({
      ...x
    });
  }
  return out;
}
export function subtractIntervals(free: Interval[], busy: Interval[]): Interval[] {
  let result = mergeIntervals(free);
  for (const b of mergeIntervals(busy)) result = result.flatMap(f => {
    if (b.end <= f.start || b.start >= f.end) return [f];
    return [{
      start: f.start,
      end: Math.min(f.end, b.start)
    }, {
      start: Math.max(f.start, b.end),
      end: f.end
    }].filter(x => x.end > x.start);
  });
  return result;
}
function onDate(w: TimeWindow, d: Date): Interval | null {
  if (w.date ? w.date !== localDate(d) : w.weekday !== d.getDay()) return null;
  const day = localDate(d);
  return {
    start: new Date(`${day}T${w.start}:00`).getTime(),
    end: new Date(`${day}T${w.end}:00`).getTime()
  };
}
export interface ScheduleResult {
  status: 'ready' | 'needs_data' | 'no_plan';
  messages: string[];
  allocations: Allocation[];
  freeMinutes: number;
  usedMinutes: number;
  attempts: number;
  horizonDays: number;
  fingerprint: string;
  baseTime: string;
  timezone: string;
}
export const currentTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || `UTC-offset:${new Date().getTimezoneOffset()}`;
export function scheduleFingerprint(state: PlanningState, tasks: Task[]): string {
  return JSON.stringify([state.availability, state.commitments, state.excludedDates, state.breakMinutes, state.allocations, tasks.map(t => [t.id, t.revision, t.updatedAt, t.duration, t.priority, t.dueAt, t.completed, t.status, t.deletedAt, [t.planning?.remainingMinutes,t.planning?.splittable,t.planning?.minimumChunk,t.planning?.waiting]]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
}

/** Backfill older confirmed schedules from their saved intervals, without changing task estimates. */
export function withConfirmedScheduleDurations(allocations: Allocation[], now = new Date()): Allocation[] {
  const totals = new Map<string, number>();
  const saved = new Map<string, number>();
  for (const slot of allocations) {
    if (Date.parse(slot.end) <= now.getTime()) continue;
    totals.set(slot.taskId, (totals.get(slot.taskId) ?? 0) + (Date.parse(slot.end) - Date.parse(slot.start)) / 60000);
    if (slot.plannedTaskMinutes !== undefined) saved.set(slot.taskId, slot.plannedTaskMinutes);
  }
  return allocations.map(slot => slot.plannedTaskMinutes !== undefined || Date.parse(slot.end) <= now.getTime()
    ? {...slot} : {...slot, plannedTaskMinutes: saved.get(slot.taskId) ?? totals.get(slot.taskId)});
}

function scheduledTaskMinutes(task: Task, slots: Allocation[]): number {
  return slots.find(slot => slot.plannedTaskMinutes !== undefined)?.plannedTaskMinutes
    ?? task.planning?.remainingMinutes ?? task.duration;
}
export function planCapacity(state: PlanningState, tasks: Task[], now = new Date(), horizonDays = 30): ScheduleResult {
  horizonDays = Number.isFinite(horizonDays) ? Math.max(1, Math.min(90, Math.floor(horizonDays))) : 30;
  const result: ScheduleResult = {
    status: 'needs_data',
    messages: [],
    allocations: [],
    freeMinutes: 0,
    usedMinutes: 0,
    attempts: 0,
    horizonDays,
    fingerprint: scheduleFingerprint(state, tasks),
    baseTime: now.toISOString(),
    timezone: currentTimezone()
  };
  const active = tasks.filter(t => !t.deletedAt && !t.completed && t.status !== 'archived');
  if (!state.availability.length) {
    result.messages.push('ابتدا بازه‌های آزاد را مشخص کن.');
    return result;
  }
  const unknown = active.filter(t => !(Number.isFinite(t.planning?.remainingMinutes ?? t.duration) && (t.planning?.remainingMinutes ?? t.duration) > 0));
  if (unknown.length) {
    result.messages.push(`مدت باقی‌ماندهٔ این کارها را مشخص کن: ${unknown.map(t => t.title).join('، ')}`);
    return result;
  }
  if (active.some(t => t.planning?.waiting)) {
    result.messages.push('زمان انتظار بعضی کارها نامعلوم است؛ ابتدا وضعیت انتظار را در جزئیات کار تعیین تکلیف کن.');
    return result;
  }
  if (active.some(t => t.dueAt && !Number.isFinite(Date.parse(t.dueAt)))) {
    result.messages.push('موعد نامعتبر در اطلاعات کار وجود دارد.');
    return result;
  }
  const free: Interval[] = [],
    busy: Interval[] = [];
  for (let n = 0; n < horizonDays; n++) {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    const key = localDate(d);
    const dated = state.availability.filter(w => w.date === key);
    if (!state.excludedDates.includes(key)) for (const w of dated.length ? dated : state.availability.filter(w => !w.date)) {
      const i = onDate(w, d);
      if (i && i.end > now.getTime()) free.push({
        start: Math.max(i.start, now.getTime()),
        end: i.end
      });
    }
    for (const w of state.commitments) {
      const i = onDate(w, d);
      if (i) busy.push(i);
    }
  }
  const locked = state.allocations.filter(a => a.locked && active.some(t => t.id === a.taskId) && Date.parse(a.end) > now.getTime());
  if (locked.some(slot => slot.plannedTaskMinutes !== undefined &&
    (!Number.isFinite(slot.plannedTaskMinutes) || slot.plannedTaskMinutes <= 0 ||
      locked.some(other => other.taskId === slot.taskId && other.plannedTaskMinutes !== undefined && other.plannedTaskMinutes !== slot.plannedTaskMinutes)))) {
    result.messages.push('مدت مبنای بازه‌های قفل‌شده ناسازگار است؛ قفل‌ها و مدت برنامه را بررسی کن.');
    return result;
  }
  const lockedIntervals = locked.map(a => ({
    start: Date.parse(a.start),
    end: Date.parse(a.end)
  }));
  const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
  const padding = state.breakMinutes * 60000;
  if (lockedIntervals.some(a => !Number.isFinite(a.start) || !Number.isFinite(a.end) || a.end <= a.start)) {
    result.messages.push('زمان بازهٔ قفل‌شده نامعتبر است.');
    return result;
  }
  if (lockedIntervals.some((a, i) => lockedIntervals.some((b, j) => j < i && overlaps(a, b)) || busy.some(b => overlaps(a, b)))) {
    result.messages.push('بازه‌های قفل‌شده با هم یا با تعهد ثابت تداخل دارند.');
    return result;
  }
  if (lockedIntervals.some((a, i) => lockedIntervals.some((b, j) => j < i && (a.end <= b.start ? b.start - a.end : a.start - b.end) < padding))) {
    result.messages.push('فاصلهٔ استراحت میان بازه‌های قفل‌شده کافی نیست.');
    return result;
  }
  if (locked.some(a => {
    const t = active.find(t => t.id === a.taskId)!;
    return !!t.dueAt && Date.parse(a.end) > Date.parse(t.dueAt);
  })) {
    result.messages.push('یک بازهٔ قفل‌شده بعد از موعد کار است.');
    return result;
  }
  const capacity = subtractIntervals(free, busy);
  if (lockedIntervals.some(a => !capacity.some(f => f.start <= Math.max(a.start, now.getTime()) && f.end >= a.end))) {
    result.messages.push('بازهٔ قفل‌شده خارج از زمان آزاد تعریف‌شده است.');
    return result;
  }
  // Reserve the requested gap on both sides of an immovable allocation.
  // Greedy slots consume their trailing gap; a slot before a lock also needs one.
  const available = subtractIntervals(capacity, lockedIntervals.map(a => ({
    start: a.start - padding,
    end: a.end + padding
  })));
  result.freeMinutes = available.reduce((s, x) => s + (x.end - x.start) / 60000, 0);
  for (const t of active) {
    const slots = locked.filter(a => a.taskId === t.id);
    const minutes = slots.reduce((s, a) => s + (Date.parse(a.end) - Math.max(Date.parse(a.start), now.getTime())) / 60000, 0);
    const required = scheduledTaskMinutes(t, slots);
    if (minutes > required + 1e-6) {
      result.messages.push(`زمان قفل‌شدهٔ «${t.title}» از مدت باقی‌مانده بیشتر است؛ یکی را اصلاح کن.`);
      return result;
    }
    if (slots.length && !t.planning?.splittable && (slots.length > 1 || Math.abs(minutes - required) > 1e-6)) {
      result.messages.push(`«${t.title}» تقسیم‌ناپذیر است؛ کل مدت باقی‌مانده باید در یک بازهٔ قفل‌شدهٔ پیوسته جا بگیرد.`);
      return result;
    }
    if (t.planning?.splittable && slots.some(a => (Date.parse(a.end) - Date.parse(a.start)) / 60000 < (t.planning?.minimumChunk ?? 15)) && (slots.length > 1 || required > minutes + 1e-6)) {
      result.messages.push(`بخش قفل‌شدهٔ «${t.title}» از حداقل طول بخش کوتاه‌تر است؛ آن را اصلاح کن.`);
      return result;
    }
  }
  const queue = active.map(t => {
    const lockedMinutes = locked.filter(a => a.taskId === t.id).reduce((s, a) => s + (Date.parse(a.end) - Math.max(Date.parse(a.start), now.getTime())) / 60000, 0);
    return {
      t,
      minutes: Math.max(0, scheduledTaskMinutes(t, locked.filter(a => a.taskId === t.id)) - lockedMinutes)
    };
  }).filter(x => x.minutes > 0);
  const deadline = (t: Task) => t.dueAt ? Date.parse(t.dueAt) : Infinity;
  queue.sort((a, b) => deadline(a.t) - deadline(b.t) || a.t.priority - b.t.priority || a.t.id.localeCompare(b.t.id));
  // Bounded deterministic alternatives: priority order plus up to 20 adjacent swaps.
  const orders = [queue, ...queue.slice(0, 20).map((_, i) => {
    const q = [...queue];
    if (i + 1 < q.length) [q[i], q[i + 1]] = [q[i + 1], q[i]];
    return q;
  })];
  for (const order of orders) {
    result.attempts++;
    let windows = available.map(x => ({
      ...x
    }));
    const allocations = [...locked];
    let failed = false;
    for (const {
      t,
      minutes
    } of order) {
      let remaining = minutes * 60000;
      const taskSlots: Allocation[] = [];
      const min = Math.max(1, t.planning?.minimumChunk ?? 15) * 60000;
      for (const w of windows) {
        const end = Math.min(w.end, deadline(t));
        const room = end - w.start;
        if (room <= 0) continue;
        if (!t.planning?.splittable && room < remaining) continue;
        let take = Math.min(room, remaining);
        if (t.planning?.splittable && remaining > take && remaining - take < min) take = remaining - min;
        // A whole short task may fit in one slot, but every piece of a split
        // task must meet its minimum, including the last piece after a lock.
        const alreadySplit = taskSlots.length > 0 || locked.some(a => a.taskId === t.id);
        if (take <= 0 || t.planning?.splittable && take < min && (remaining > take || alreadySplit)) continue;
        const start = w.start,
          endOfSlot = start + take;
        taskSlots.push({
          taskId: t.id,
          start: new Date(start).toISOString(),
          end: new Date(endOfSlot).toISOString()
        });
        // A break can straddle two availability windows. Reserve it in every
        // remaining window, including earlier windows used by a later task.
        for (const other of windows) if (other !== w) {
          if (other.end <= start) other.end = Math.min(other.end, start - padding);else if (other.start >= endOfSlot) other.start = Math.max(other.start, endOfSlot + padding);
        }
        w.start = endOfSlot + padding;
        remaining -= take;
        if (remaining <= 0) break;
      }
      if (remaining > 0) {
        failed = true;
        break;
      }
      allocations.push(...taskSlots);
    }
    if (!failed) {
      result.status = 'ready';
      const durations = new Map(active.map(t => [t.id, scheduledTaskMinutes(t, locked.filter(a => a.taskId === t.id))]));
      result.allocations = allocations.map(a => ({...a, plannedTaskMinutes: durations.get(a.taskId)}))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      result.usedMinutes = result.allocations.reduce((s, a) => s + (Date.parse(a.end) - Math.max(Date.parse(a.start), now.getTime())) / 60000, 0);
      result.messages = ['این پیشنهاد بر اساس وقت آزاد و مدت‌های ثبت‌شده است؛ تا تأیید شما اعمال نمی‌شود.'];
      return result;
    }
  }
  result.status = 'no_plan';
  result.messages = [`در افق ${horizonDays} روز و ${result.attempts} ترتیب بررسی‌شده، برنامه‌ای سازگار پیدا نشد؛ این به معنی اثبات ناممکن‌بودن نیست.`];
  return result;
}
export interface ScheduleValidation {
  valid: boolean;
  messages: string[];
}
export interface ScheduleValidationOptions {
  horizonDays?: number;
  requireAllTasks?: boolean;
  allowPast?: boolean;
  preserveLocked?: boolean;
  ignoreInactive?: boolean;
}

function capacityFor(state: PlanningState, now: Date, horizonDays: number): Interval[] {
  const free: Interval[] = [], busy: Interval[] = [];
  for (let day = 0; day < Math.max(1, Math.min(90, horizonDays)); day++) {
    const date = new Date(now); date.setDate(date.getDate() + day);
    const key = localDate(date);
    const dated = state.availability.filter(w => w.date === key);
    if (!state.excludedDates.includes(key)) for (const w of dated.length ? dated : state.availability.filter(w => !w.date)) {
      const interval = onDate(w, date);
      if (interval) free.push(interval);
    }
    for (const w of state.commitments) {
      const interval = onDate(w, date);
      if (interval) busy.push(interval);
    }
  }
  return subtractIntervals(free, busy);
}

/** Validate the proposal itself, rather than comparing two clock-dependent solver outputs. */
export function validateScheduleAllocations(state: PlanningState, tasks: Task[], allocations: Allocation[], now = new Date(), options: ScheduleValidationOptions = {}): ScheduleValidation {
  const messages: string[] = [];
  const active = new Map(tasks.filter(t => !t.deletedAt && !t.completed && t.status !== 'archived').map(t => [t.id, t]));
  const horizonDays = options.horizonDays ?? 90;
  const capacity = capacityFor(state, now, horizonDays);
  const relevant = allocations.filter(a => (!options.allowPast || !Number.isFinite(Date.parse(a.end)) || Date.parse(a.end) > now.getTime()) && (!options.ignoreInactive || active.has(a.taskId)));
  const intervals = relevant.map(a => ({ a, start: Date.parse(a.start), end: Date.parse(a.end) })).sort((a,b) => a.start-b.start);
  const grouped = new Map<string, typeof intervals>();
  for (const row of intervals) { const rows=grouped.get(row.a.taskId) ?? [];rows.push(row);grouped.set(row.a.taskId,rows); }
  const fitsCapacity = (start:number,end:number) => {
    let low=0,high=capacity.length-1,last=-1;
    while(low<=high){const mid=(low+high)>>>1;if(capacity[mid].start<=start){last=mid;low=mid+1;}else high=mid-1;}
    return last>=0&&capacity[last].end>=end;
  };
  for (const { a, start, end } of intervals) {
    const task = active.get(a.taskId);
    if (!task) { messages.push('کار حذف، بایگانی یا تکمیل شده است؛ برنامه را تازه کن.'); continue; }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) { messages.push('یک بازهٔ زمانی نامعتبر است.'); continue; }
    if (!a.locked && start < now.getTime()) messages.push('شروع یک بازه گذشته است و باید تعدیل شود.');
    if (a.locked && end <= now.getTime() && !options.allowPast) messages.push('بازهٔ قفل‌شده به گذشته تعلق دارد.');
    if (!fitsCapacity(start,end)) messages.push(`بازهٔ «${task.title}» خارج از وقت آزاد یا در تعهد ثابت است.`);
    if (task.dueAt && (!Number.isFinite(Date.parse(task.dueAt)) || end > Date.parse(task.dueAt))) messages.push(`بازهٔ «${task.title}» بعد از موعد آن قرار می‌گیرد.`);
    if (task.planning?.waiting) messages.push(`وضعیت انتظار «${task.title}» هنوز مشخص نشده است.`);
  }
  for (let i = 1; i < intervals.length; i++) {
    const gap = intervals[i].start - intervals[i-1].end;
    if (gap < 0) messages.push('دو بازه با هم تعارض دارند.');
    else if (gap < state.breakMinutes * 60000) messages.push('فاصلهٔ استراحت بین دو بازه کافی نیست.');
  }
  const lockedKeys = new Set(allocations.filter(a=>a.locked).map(a=>`${a.taskId}:${Date.parse(a.start)}:${Date.parse(a.end)}`));
  if (options.preserveLocked !== false) for (const lock of state.allocations.filter(a => a.locked && Date.parse(a.end) > now.getTime() && active.has(a.taskId))) {
    if (!lockedKeys.has(`${lock.taskId}:${Date.parse(lock.start)}:${Date.parse(lock.end)}`)) messages.push('بازهٔ قفل‌شده نباید جابه‌جا یا حذف شود.');
  }
  for (const task of active.values()) {
    const slots = grouped.get(task.id) ?? [];
    const expected = scheduledTaskMinutes(task, slots.map(row => row.a));
    if (slots.some(row => row.a.plannedTaskMinutes !== undefined &&
      (!Number.isFinite(row.a.plannedTaskMinutes) || row.a.plannedTaskMinutes <= 0 || row.a.plannedTaskMinutes !== expected))) {
      messages.push(`مدت مبنای بازه‌های «${task.title}» ناسازگار است؛ برنامه را دوباره محاسبه کن.`);
    }
    if (options.requireAllTasks) {
      const locked = state.allocations.filter(a => a.taskId === task.id && a.locked && Date.parse(a.end) > now.getTime());
      if (Math.abs(expected - scheduledTaskMinutes(task, locked)) > 1e-6) messages.push(`مبنای مدت «${task.title}» تغییر کرده است؛ پیش‌نمایش تازه لازم است.`);
    }
    const assigned = slots.reduce((sum,x) => sum + (x.end-x.start)/60000, 0);
    if (slots.length && (!Number.isFinite(expected) || expected <= 0 || assigned > expected + 1e-6)) messages.push(`مدت تخصیص‌یافته به «${task.title}» با مدت ثبت‌شده سازگار نیست.`);
    if (options.requireAllTasks && Math.abs(assigned-expected) > 1e-6) messages.push(`تمام مدت «${task.title}» در برنامه جا نگرفته است.`);
    if (!task.planning?.splittable && slots.length > 1) messages.push(`«${task.title}» تقسیم‌ناپذیر است.`);
    if (task.planning?.splittable && slots.length > 1 && slots.some(x => (x.end-x.start)/60000 < (task.planning?.minimumChunk ?? 15))) messages.push(`یک بخش «${task.title}» از حداقل جلسه کوتاه‌تر است.`);
  }
  return { valid: messages.length === 0, messages: [...new Set(messages)] };
}

export interface ScheduleConfirmation {
  status: 'accepted' | 'refresh';
  result: ScheduleResult;
  adjusted: boolean;
  reason: string;
}

function scheduleChangeReason(previous: string, current: string, tasks: Task[]): string {
  // Fingerprints are local preview snapshots. Older snapshots may use another shape.
  let before: unknown[], after: unknown[];
  try { before = JSON.parse(previous); after = JSON.parse(current); }
  catch { return 'اطلاعات پیش‌نمایش تغییر کرده است.'; }
  if (!Array.isArray(before) || !Array.isArray(after)) return 'اطلاعات پیش‌نمایش تغییر کرده است.';
  const capacityFields = ['وقت آزاد', 'تعهد ثابت', 'روزهای استثنا', 'فاصلهٔ استراحت', 'بازه‌های تأییدشده یا قفل آن‌ها'];
  for (const [index, field] of capacityFields.entries()) {
    if (JSON.stringify(before[index]) !== JSON.stringify(after[index])) return field + ' تغییر کرده است.';
  }
  if (!Array.isArray(before[5]) || !Array.isArray(after[5])) return 'کارهای برنامه تغییر کرده‌اند.';
  const previousTasks = new Map(before[5].filter(Array.isArray).map(row => [row[0], row]));
  for (const row of after[5].filter(Array.isArray)) {
    const old = previousTasks.get(row[0]);
    previousTasks.delete(row[0]);
    if (JSON.stringify(old) === JSON.stringify(row)) continue;
    const title = tasks.find(task => task.id === row[0])?.title ?? 'کار';
    if (!old) return 'کار «' + title + '» اضافه شده است.';
    const field = old[5] !== row[5] ? 'موعد' : old[3] !== row[3] ? 'مدت' :
      old[4] !== row[4] ? 'اولویت' : old[6] !== row[6] || old[7] !== row[7] ? 'وضعیت' : 'اطلاعات';
    return field + ' کار «' + title + '» تغییر کرده است.';
  }
  return previousTasks.size ? 'یک کار از فهرست برنامه حذف شده است.' : 'اطلاعات برنامه تغییر کرده است.';
}
export const CONFIRMATION_GRACE_MS = 5 * 60000;

export function confirmSchedule(state: PlanningState, tasks: Task[], preview: ScheduleResult, now = new Date()): ScheduleConfirmation {
  const refresh = (reason: string, result = planCapacity(state, tasks, now, preview.horizonDays)): ScheduleConfirmation => ({ status: 'refresh', result, adjusted: false, reason });
  const fingerprint = scheduleFingerprint(state, tasks);
  if (preview.fingerprint !== fingerprint) return refresh(scheduleChangeReason(preview.fingerprint, fingerprint, tasks) + ' پیش‌نمایش تازه را بررسی کن.');
  if (preview.timezone !== currentTimezone()) return refresh('منطقهٔ زمانی دستگاه تغییر کرده است؛ ساعت‌های محلی را دوباره بررسی کن.');
  const base = Date.parse(preview.baseTime);
  if (preview.status !== 'ready' || !Number.isFinite(base) || now.getTime() < base) return refresh('زمان مبنای پیش‌نمایش معتبر نیست؛ برنامه دوباره محاسبه شد.');
  const before = validateScheduleAllocations(state, tasks, preview.allocations, new Date(base), { horizonDays: preview.horizonDays, requireAllTasks: true });
  if (!before.valid) return refresh(before.messages[0]);
  const expired = preview.allocations.some(a => !a.locked && Date.parse(a.start) < now.getTime());
  if (!expired) {
    const valid = validateScheduleAllocations(state, tasks, preview.allocations, now, { horizonDays: preview.horizonDays, requireAllTasks: true });
    if (valid.valid) return { status: 'accepted', result: preview, adjusted: false, reason: 'برنامه تأیید شد.' };
    return refresh(valid.messages[0]);
  }
  // A brief delay moves an expired start to the next whole minute. Larger changes
  // still need a fresh preview; this never silently moves work to another day.
  const adjustedNow = new Date(Math.ceil(now.getTime()/60000)*60000);
  const fresh = planCapacity(state, tasks, adjustedNow, preview.horizonDays);
  // baseTime records when this proposal was observed, while allocations carry
  // the separate rounded earliest start.
  fresh.baseTime = now.toISOString();
  if (now.getTime()-base > CONFIRMATION_GRACE_MS || fresh.status !== 'ready') return refresh('وقت شروع قبلی گذشته و تعدیل کوتاه ممکن نیست؛ پیش‌نمایش تازه را بررسی کن.', fresh);
  const old = preview.allocations, next = fresh.allocations;
  const smallChange = old.length === next.length && old.every((a,i) => {
    const b = next[i];
    return a.taskId === b.taskId && !!a.locked === !!b.locked && (a.locked ? a.start === b.start && a.end === b.end :
      localDate(new Date(a.start)) === localDate(new Date(b.start)) && Math.abs(Date.parse(b.start)-Date.parse(a.start)) <= CONFIRMATION_GRACE_MS &&
      Date.parse(b.start) >= Date.parse(a.start) && Math.abs((Date.parse(b.end)-Date.parse(b.start))-(Date.parse(a.end)-Date.parse(a.start))) < 1);
  });
  const valid = validateScheduleAllocations(state, tasks, next, now, { horizonDays: preview.horizonDays, requireAllTasks: true });
  if (!smallChange || !valid.valid) return refresh(valid.messages[0] || 'گذشت زمان باعث تغییر محسوس برنامه شد؛ پیش‌نمایش تازه را بررسی کن.', fresh);
  return { status: 'accepted', result: fresh, adjusted: true, reason: 'شروع گذشته به ابتدای دقیقهٔ بعد منتقل شد؛ مدت، ترتیب، موعد و بازه‌های قفل‌شده حفظ شدند.' };
}

export function moveScheduleAllocation(state: PlanningState, tasks: Task[], allocationIndex: number, start: string, now = new Date()): ScheduleValidation & { allocations: Allocation[] } {
  const allocations = withConfirmedScheduleDurations(state.allocations, now);
  const slot = allocations[allocationIndex];
  if (!slot || slot.locked) return { valid: false, messages: ['این بازه قفل است یا دیگر وجود ندارد.'], allocations };
  const task = tasks.find(t=>t.id===slot.taskId);
  if(!task||task.deletedAt||task.completed||task.status==='archived') return {valid:false,messages:['فقط بازهٔ یک کار فعال را می‌توان جابه‌جا کرد.'],allocations};
  const timestamp = Date.parse(start), duration = Date.parse(slot.end)-Date.parse(slot.start);
  if (!Number.isFinite(timestamp) || !Number.isFinite(duration) || duration <= 0) return { valid: false, messages: ['زمان شروع معتبر وارد کن.'], allocations };
  if (timestamp < now.getTime() || Date.parse(slot.end) <= now.getTime()) {
    return { valid: false, messages: ['زمان تازه باید در آینده باشد. بازهٔ پایان‌یافته به روز دیگری منتقل نمی‌شود.'], allocations };
  }
  allocations[allocationIndex] = { ...slot, start: new Date(timestamp).toISOString(), end: new Date(timestamp+duration).toISOString() };
  const validation = validateScheduleAllocations(state, tasks, allocations, now, { allowPast: true, ignoreInactive: true });
  return { ...validation, allocations };
}

export const median = (xs: number[]): number => {
  const a = [...xs].sort((a, b) => a - b);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};

export function focusSessionFingerprint(taskId: string, sessions: FocusSession[]): string {
  const rows = sessions.filter(s => s.taskId === taskId && (s.phase ?? 'work') === 'work').map(s => [s.id, s.revision, s.updatedAt, s.deletedAt, s.startedAt, s.endedAt, s.durationMinutes, s.durationSeconds]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const text = JSON.stringify(rows);
  let hash = 0xcbf29ce484222325n;
  for (let i=0;i<text.length;i++) hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
  return `sessions-v1:${text.length}:${hash.toString(16)}`;
}

export function analyzeTimerCoverage(taskId: string, sessions: FocusSession[], asOf = Date.now(), completedAt?: string | null) {
  const fingerprint = focusSessionFingerprint(taskId, sessions);
  const rows = sessions.filter(s => s.taskId === taskId && !s.deletedAt && (s.phase ?? 'work') === 'work');
  const unique = [...new Map(rows.map(s => [s.id, s])).values()];
  const reasons: string[] = [];
  const representations = new Map<string,string>();
  for (const s of sessions.filter(s => s.taskId === taskId && (s.phase ?? 'work') === 'work')) {
    const representation = JSON.stringify(s);
    if (representations.has(s.id) && representations.get(s.id) !== representation) reasons.push('برای یک جلسه دو نسخهٔ ناسازگار موجود است؛ سابقه را تازه کن.');
    representations.set(s.id,representation);
  }
  const completion = completedAt ? Date.parse(completedAt) : asOf;
  for (const s of unique) {
    const start = Date.parse(s.startedAt ?? ''), end = Date.parse(s.endedAt ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end > Math.min(asOf, completion) || !Number.isFinite(s.durationMinutes) || s.durationMinutes <= 0 || s.durationMinutes > 480 || s.durationMinutes > (end-start)/60000 + 1) reasons.push('یک جلسه ناقص، آینده یا دارای زمان ناممکن است.');
    if ([s.createdAt,s.updatedAt].some(x => x && (!Number.isFinite(Date.parse(x)) || Date.parse(x)>asOf))) reasons.push('نسخهٔ فعلی یک جلسه در زمان تخمین موجود نبوده است.');
  }
  const all = [...new Map(sessions.filter(s => !s.deletedAt && (s.phase ?? 'work') === 'work').map(s => [s.id,s])).values()];
  const overlapping = new Set<string>();
  const timed = all.map(s => ({s,start:Date.parse(s.startedAt ?? ''),end:Date.parse(s.endedAt ?? '')})).filter(x => Number.isFinite(x.start) && Number.isFinite(x.end) && x.start < x.end).sort((a,b) => a.start-b.start);
  let furthest: typeof timed[number] | undefined;
  for (const row of timed) {
    if (furthest && row.start < furthest.end) { overlapping.add(row.s.id); overlapping.add(furthest.s.id); }
    if (!furthest || row.end > furthest.end) furthest = row;
  }
  if (unique.some(s => overlapping.has(s.id))) reasons.push('یک جلسه با جلسهٔ دیگری هم‌پوشانی دارد.');
  if (!unique.length) reasons.push('جلسهٔ معتبر ثبت نشده است.');
  return { fingerprint, valid: reasons.length === 0, reasons: [...new Set(reasons)], minutes: unique.reduce((sum,s) => sum + (Number.isFinite(s.durationMinutes) && s.durationMinutes>0 ? s.durationMinutes : 0),0), sessionIds: unique.map(s=>s.id) };
}

function comparableWorkReason(target: Task, sample: Task): string | null {
  const type = normalizeText(target.planning?.workType ?? '');
  const otherType = normalizeText(sample.planning?.workType ?? '');
  if (type && otherType) return type === otherType ? `نوع کار مشترک: ${target.planning!.workType}` : null;
  if (target.planning?.templateId && target.planning.templateItemId && sample.planning?.templateId === target.planning.templateId && sample.planning.templateItemId === target.planning.templateItemId) return 'همان آیتم مشخص از قالب';
  return null;
}

export function estimateDuration(target: Task, tasks: Task[], sessions: FocusSession[], minimum = 3, asOf = Date.now()) {
  const samples: {
      id: string;
      minutes: number;
      confirmed: boolean;
      reason: string;
    }[] = [],
    excluded: {
      id: string;
      reason: string;
    }[] = [];
  const availableAt = (created?: string, updated?: string) => [created, updated].every(s => !s || Number.isFinite(Date.parse(s)) && Date.parse(s) <= asOf);
  const unavailableTaskIds = new Set(sessions.filter(s => s.taskId && (s.phase ?? 'work') === 'work' && !availableAt(s.createdAt, s.updatedAt)).map(s => s.taskId));
  const duplicateRepresentations = new Map<string,string>();
  const conflictingTaskIds = new Set<string>();
  for (const s of sessions) {
    const representation = JSON.stringify(s);
    if (duplicateRepresentations.has(s.id) && duplicateRepresentations.get(s.id) !== representation && s.taskId) conflictingTaskIds.add(s.taskId);
    duplicateRepresentations.set(s.id,representation);
  }
  const seen = new Set<string>();
  const unique = sessions.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return !s.deletedAt && (s.phase ?? 'work') === 'work' && availableAt(s.createdAt, s.updatedAt);
  });
  const sessionsByTask = new Map<string, FocusSession[]>();
  for (const s of unique) if (s.taskId) {
    const rows = sessionsByTask.get(s.taskId) ?? [];
    rows.push(s);
    sessionsByTask.set(s.taskId, rows);
  }
  // Detect overlap globally, including a timer attached to a different task.
  // A sweep with the furthest-ending active interval marks both sides without
  // a quadratic comparison of the entire focus history.
  const overlapping = new Set<string>();
  const timed = unique.map(s => ({
    s,
    start: Date.parse(s.startedAt ?? ''),
    end: Date.parse(s.endedAt ?? '')
  })).filter(x => Number.isFinite(x.start) && Number.isFinite(x.end) && x.start < x.end && x.end <= asOf).sort((a, b) => a.start - b.start || a.end - b.end);
  let furthest: typeof timed[number] | undefined;
  for (const row of timed) {
    if (furthest && row.start < furthest.end) {
      overlapping.add(row.s.id);
      overlapping.add(furthest.s.id);
    }
    if (!furthest || row.end > furthest.end) furthest = row;
  }
  for (const t of tasks) {
    if (t.id === target.id || !t.completed || t.deletedAt) continue;
    const similarity = comparableWorkReason(target,t);
    if (!similarity) {
      excluded.push({ id:t.id, reason:'نوع مشخص کار یا هویت آیتم قالب قابل مقایسه نیست؛ دستهٔ عمومی کافی نیست' });
      continue;
    }
    if (!t.completedAt || !Number.isFinite(Date.parse(t.completedAt)) || Date.parse(t.completedAt) > asOf || !availableAt(t.createdAt, t.updatedAt)) {
      excluded.push({
        id: t.id,
        reason: 'تکمیل معتبر یا اطلاعات این کار در زمان تخمین موجود نبوده است'
      });
      continue;
    }
    if (target.planning?.units !== undefined || t.planning?.units !== undefined) {
      if (!(Number.isFinite(target.planning?.units) && target.planning?.units! > 0) || !(Number.isFinite(t.planning?.units) && t.planning?.units! > 0) || !normalizeText(target.planning?.unitName ?? '') || normalizeText(target.planning!.unitName!) !== normalizeText(t.planning?.unitName ?? '')) {
        excluded.push({
          id: t.id,
          reason: 'حجم یا واحد کار قابل مقایسه نیست'
        });
        continue;
      }
    }
    let minutes = t.planning?.actualConfirmed ? t.planning.actualMinutes : undefined;
    if (minutes === undefined) {
      if (conflictingTaskIds.has(t.id)) {
        excluded.push({ id:t.id, reason:'دو نسخهٔ ناسازگار از یک جلسه ثبت شده است' });
        continue;
      }
      if (!t.planning?.timerCoverageConfirmed || t.planning.timerCoverageFingerprint !== focusSessionFingerprint(t.id,sessions)) {
        excluded.push({ id:t.id, reason:'پوشش کامل زمان انجام کار توسط تایمر تأیید نشده یا جلسه‌ها تغییر کرده‌اند' });
        continue;
      }
      if (unavailableTaskIds.has(t.id)) {
        excluded.push({
          id: t.id,
          reason: 'نسخهٔ فعلی جلسه در زمان تخمین موجود نبوده است'
        });
        continue;
      }
      const ss = sessionsByTask.get(t.id) ?? [];
      const invalid = ss.some(s => !Number.isFinite(Date.parse(s.startedAt ?? '')) || !Number.isFinite(Date.parse(s.endedAt ?? '')) || Date.parse(s.endedAt!) > Math.min(asOf, Date.parse(t.completedAt!)) || Date.parse(s.startedAt!) >= Date.parse(s.endedAt!) || !Number.isFinite(s.durationMinutes) || !(s.durationMinutes > 0) || s.durationMinutes > 480 || s.durationMinutes > (Date.parse(s.endedAt!) - Date.parse(s.startedAt!)) / 60000 + 1);
      const overlap = ss.some(s => overlapping.has(s.id));
      if (invalid || overlap || !ss.length) {
        excluded.push({
          id: t.id,
          reason: 'زمان واقعی ناقص، مشکوک یا هم‌پوشان'
        });
        continue;
      }
      minutes = ss.reduce((s, x) => s + x.durationMinutes, 0);
    }
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || !(minutes > 0)) {
      excluded.push({
        id: t.id,
        reason: 'زمان واقعی مثبت ثبت نشده'
      });
      continue;
    }
    if (target.planning?.units && t.planning?.units) minutes = minutes / t.planning.units * target.planning.units;
    if (!Number.isFinite(minutes)) {
      excluded.push({
        id: t.id,
        reason: 'نسبت حجم کار نامعتبر است'
      });
      continue;
    }
    samples.push({
      id: t.id,
      minutes,
      confirmed: !!t.planning?.actualConfirmed,
      reason: `${similarity}؛ ${t.planning?.actualConfirmed && t.planning.actualMinutes !== undefined ? 'کل زمان واقعی تأییدشده' : 'پوشش کامل تایمر تأییدشده'}`
    });
  }
  let valid = samples;
  if (samples.length >= 5) {
    const m = median(samples.map(s => s.minutes));
    const mad = median(samples.map(s => Math.abs(s.minutes - m)));
    valid = samples.filter(s => {
      const unusual = !s.confirmed && (mad > 0 ? Math.abs(s.minutes - m) > 3 * 1.4826 * mad : s.minutes > m * 3 || s.minutes < m / 3);
      if (unusual) excluded.push({
        id: s.id,
        reason: 'مدت غیرعادی؛ نیازمند تأیید یا اصلاح'
      });
      return !unusual;
    });
  }
  const enough = valid.length >= Math.max(3, Number.isFinite(minimum) ? minimum : 3);
  const manual = Number.isFinite(target.duration) && target.duration > 0 ? target.duration : null;
  return {
    source: enough ? 'history' as const : target.planning?.initialEstimate ? 'manual' as const : 'configured' as const,
    minutes: enough ? Math.round(median(valid.map(x => x.minutes))) : manual,
    sampleIds: valid.map(x => x.id),
    sampleReasons: valid.map(x => ({ id:x.id, reason:x.reason })),
    basisReason: enough ? 'میانهٔ کل زمان‌های واقعیِ کارهای مشخص و قابل‌مقایسه' : (target.planning?.initialEstimate ? 'نمونهٔ کافی برای تخمین شخصی نداریم. مدت انتخاب‌شده برای این کار استفاده می‌شود.' : 'نمونهٔ کافی و برآورد دستی مشخصی ثبت نشده است. عدد نمایش‌داده‌شده مدت تنظیم‌شدهٔ کار یا پیش‌فرض تایمر است.'),
    excluded,
    count: valid.length,
    range: valid.length ? [Math.min(...valid.map(x => x.minutes)), Math.max(...valid.map(x => x.minutes))] : null
  };
}
export function eventCountdown(event: PlanningEvent, now = new Date()): string {
  if (event.time) {
    const diff = new Date(`${event.date}T${event.time}:00`).getTime() - now.getTime();
    if (diff < 0) return 'گذشته';
    const mins = Math.ceil(diff / 60000);
    return mins < 60 ? `${mins} دقیقه مانده` : `${Math.floor(mins / 60)} ساعت و ${mins % 60} دقیقه مانده`;
  }
  const [y, m, d] = event.date.split('-').map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  return days === 0 ? 'امروز' : days > 0 ? `${days} روز مانده` : `${-days} روز گذشته`;
}
export function metricSummary(metric: Metric, from = '', to = '9999-12-31'): number | null {
  // Stable date sorting preserves recording order for multiple values on a day;
  // random entity IDs carry no chronological meaning.
  const rows = metric.entries.filter(e => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return null;
  if (metric.aggregate === 'last') return rows.at(-1)!.value;
  const sum = rows.reduce((s, e) => s + e.value, 0);
  return metric.aggregate === 'mean' ? sum / rows.length : sum;
}
export function instantiateTemplate(template: TaskTemplate, date: string, projectId?: string): Task[] {
  return template.tasks.map((t,index) => ({
    id: createEntityId('task'),
    title: t.title,
    description: t.description,
    duration: t.duration,
    priority: t.priority,
    category: t.category || 'work',
    targetDate: date,
    completed: false,
    status: 'todo',
    projectId: projectId || null,
    subtasks: t.subtasks?.map(s => ({
      id: createEntityId('sub'),
      title: s.title,
      completed: false
    })),
    planning: {
      templateId: template.id,
      templateItemId: t.id || `${template.id}:item:${index}`,
      workType: t.workType,
      units: t.units,
      unitName: t.unitName,
      initialEstimate: t.duration
    }
  }));
}

export function copyTask(source: Task, date: string, projectId = source.projectId): Task {
  const copy = instantiateTemplate({ id:'copy',title:source.title,tasks:[source] },date,projectId ?? undefined)[0];
  copy.sourceId = source.id;
  copy.planning = {
    workType: source.planning?.workType,
    templateId: source.planning?.templateId,
    templateItemId: source.planning?.templateItemId,
    units: source.planning?.units,
    unitName: source.planning?.unitName,
    initialEstimate: source.planning?.initialEstimate,
    splittable: source.planning?.splittable,
    minimumChunk: source.planning?.minimumChunk,
    ...(projectId === source.projectId ? {stageId:source.planning?.stageId} : {})
  };
  return copy;
}
