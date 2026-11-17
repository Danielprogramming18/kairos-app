import type { FocusSession, Task } from '../types';
import { Allocation, localDate, Metric, PlanningEvent, PlanningState, TaskTemplate, TimeWindow } from '../domain/planning';
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
}
export function scheduleFingerprint(state: PlanningState, tasks: Task[]): string {
  return JSON.stringify([state.revision, tasks.map(t => [t.id, t.revision, t.updatedAt, t.duration, t.priority, t.dueAt, t.completed, t.status, t.deletedAt, t.planning]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
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
    fingerprint: scheduleFingerprint(state, tasks)
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
    const required = t.planning?.remainingMinutes ?? t.duration;
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
      minutes: Math.max(0, (t.planning?.remainingMinutes ?? t.duration) - lockedMinutes)
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
      result.allocations = allocations.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      result.usedMinutes = result.allocations.reduce((s, a) => s + (Date.parse(a.end) - Math.max(Date.parse(a.start), now.getTime())) / 60000, 0);
      result.messages = ['این پیشنهاد بر اساس وقت آزاد و مدت‌های ثبت‌شده است؛ تا تأیید شما اعمال نمی‌شود.'];
      return result;
    }
  }
  result.status = 'no_plan';
  result.messages = [`در افق ${horizonDays} روز و ${result.attempts} ترتیب بررسی‌شده، برنامه‌ای سازگار پیدا نشد؛ این به معنی اثبات ناممکن‌بودن نیست.`];
  return result;
}
export const median = (xs: number[]): number => {
  const a = [...xs].sort((a, b) => a - b);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
export function estimateDuration(target: Task, tasks: Task[], sessions: FocusSession[], minimum = 3, asOf = Date.now()) {
  const samples: {
      id: string;
      minutes: number;
      confirmed: boolean;
    }[] = [],
    excluded: {
      id: string;
      reason: string;
    }[] = [];
  const availableAt = (created?: string, updated?: string) => [created, updated].every(s => !s || Number.isFinite(Date.parse(s)) && Date.parse(s) <= asOf);
  const unavailableTaskIds = new Set(sessions.filter(s => s.taskId && (s.phase ?? 'work') === 'work' && !availableAt(s.createdAt, s.updatedAt)).map(s => s.taskId));
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
    if (target.planning?.templateId ? t.planning?.templateId !== target.planning.templateId : t.category !== target.category) continue;
    if (!t.completedAt || !Number.isFinite(Date.parse(t.completedAt)) || Date.parse(t.completedAt) > asOf || !availableAt(t.createdAt, t.updatedAt)) {
      excluded.push({
        id: t.id,
        reason: 'تکمیل معتبر یا اطلاعات این کار در زمان تخمین موجود نبوده است'
      });
      continue;
    }
    if (target.planning?.units !== undefined || t.planning?.units !== undefined) {
      if (!(target.planning?.units! > 0) || !(t.planning?.units! > 0) || !target.planning?.unitName || target.planning.unitName !== t.planning?.unitName) {
        excluded.push({
          id: t.id,
          reason: 'حجم یا واحد کار قابل مقایسه نیست'
        });
        continue;
      }
    }
    let minutes = t.planning?.actualConfirmed ? t.planning.actualMinutes : undefined;
    if (minutes === undefined) {
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
      confirmed: !!t.planning?.actualConfirmed
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
    source: enough ? 'history' as const : 'manual' as const,
    minutes: enough ? Math.round(median(valid.map(x => x.minutes))) : manual,
    sampleIds: valid.map(x => x.id),
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
  return template.tasks.map(t => ({
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
      initialEstimate: t.duration
    }
  }));
}
