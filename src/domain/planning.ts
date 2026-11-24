import type { Task } from '../types';
import {validateReminder, type ReminderRule, type EventKind, type RepeatFrequency} from './reminders';
export interface TaskPlanning {
  reminder?: ReminderRule;
  stageId?: string;
  resume?: string;
  templateId?: string;
  templateItemId?: string;
  durationSource?: 'history' | 'timer';
  workType?: string;
  units?: number;
  unitName?: string;
  initialEstimate?: number;
  remainingMinutes?: number;
  actualMinutes?: number;
  actualConfirmed?: boolean;
  timerCoverageConfirmed?: boolean;
  timerCoverageFingerprint?: string;
  splittable?: boolean;
  minimumChunk?: number;
  waiting?: boolean;
  coachDisabled?: boolean;
}
export interface Project {
  id: string;
  title: string;
  description: string;
  archived: boolean;
  stages: {
    id: string;
    title: string;
  }[];
  nextTaskId?: string;
}
export interface TaskTemplate {
  id: string;
  title: string;
  tasks: (Pick<Task, 'title' | 'description' | 'duration' | 'priority' | 'category' | 'subtasks'> & { id?: string; workType?: string; units?: number; unitName?: string })[];
}
export interface PlanningEvent {
  kind?: EventKind;
  repeat?: RepeatFrequency;
  reminder?: ReminderRule;
  id: string;
  title: string;
  date: string;
  time?: string;
  projectId?: string;
}
export interface Metric {
  id: string;
  title: string;
  unit: string;
  description: string;
  aggregate: 'sum' | 'mean' | 'last';
  direction: 'up' | 'down' | 'neutral';
  projectId?: string;
  min?: number;
  max?: number;
  entries: {
    id: string;
    date: string;
    value: number;
    note: string;
  }[];
}
export interface TimeWindow {
  id: string;
  date?: string;
  weekday?: number;
  start: string;
  end: string;
}
export interface Allocation {
  taskId: string;
  start: string;
  end: string;
  locked?: boolean;
  /** Total task minutes approved for this schedule, shared by all of its fragments. */
  plannedTaskMinutes?: number;
  durationBasis?: 'manual' | 'history' | 'timer' | 'remaining' | 'approved';
}
export interface LayoutPreference {
  order: string[];
  hidden: string[];
  pinned: string[];
  main?: string[];
}
export type Barrier = 'unclear' | 'large' | 'waiting' | 'time' | 'importance' | 'other';
export interface CoachFeedback {
  id: string;
  taskId: string;
  barrier: Barrier;
  action: string;
  answer: 'helped' | 'not_helped' | 'untried';
  at: string;
}
export interface PlanningState {
  schemaVersion: 1;
  revision: number;
  projects: Project[];
  templates: TaskTemplate[];
  events: PlanningEvent[];
  metrics: Metric[];
  layout: {
    desktop: LayoutPreference;
    mobile: LayoutPreference;
  };
  availability: TimeWindow[];
  commitments: TimeWindow[];
  excludedDates: string[];
  allocations: Allocation[];
  previousAllocations?: Allocation[];
  breakMinutes: number;
  minimumSamples: number;
  feedback: CoachFeedback[];
  predictions: {
    id: string;
    taskId: string;
    at: string;
    minutes: number;
    manual: number | null;
    sampleIds: string[];
  }[];
}
export const emptyPlanning = (): PlanningState => ({
  schemaVersion: 1,
  revision: 0,
  projects: [],
  templates: [],
  events: [],
  metrics: [],
  layout: {
    desktop: {
      order: [],
      hidden: [],
      pinned: []
    },
    mobile: {
      order: [],
      hidden: [],
      pinned: []
    }
  },
  availability: [],
  commitments: [],
  excludedDates: [],
  allocations: [],
  breakMinutes: 0,
  minimumSamples: 3,
  feedback: [],
  predictions: []
});
export function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[۰-۹]/g, x => String(x.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, x => String(x.charCodeAt(0) - 1632)).replace(/[\u200c\u200f]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
export function parseNumber(text: string): number | null {
  const s = normalizeText(text).replace(/٫/g, '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function validDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00');
  return !isNaN(d.getTime()) && localDate(d) === s;
}
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const validTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (s: unknown) => typeof s === 'string' && s.length <= 12000;
const number = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
const timestamp = (s: unknown) => str(s) && /^\d{4}-\d{2}-\d{2}T/.test(s as string) && Number.isFinite(Date.parse(s as string));
function requireValid(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function collection(v: unknown, name: string): any[] {
  requireValid(Array.isArray(v) && v.length <= 20000, `فهرست ${name} نامعتبر یا بیش از حد بزرگ است.`);
  const ids = new Set<string>();
  for (const item of v) {
    requireValid(obj(item) && str(item.id) && !!item.id && !ids.has(item.id), `شناسهٔ تکراری یا نامعتبر در ${name}`);
    ids.add(item.id);
  }
  return v;
}
export function validateTaskPlanning(value: unknown): TaskPlanning {
  requireValid(obj(value), 'اطلاعات تکمیلی کار نامعتبر است.');
  if (value.reminder !== undefined) validateReminder(value.reminder);
  requireValid(value.durationSource === undefined || ['history','timer'].includes(value.durationSource), 'منشأ مدت کار نامعتبر است.');
  for (const k of ['stageId', 'resume', 'templateId', 'templateItemId', 'workType', 'unitName', 'timerCoverageFingerprint']) if (value[k] !== undefined) requireValid(str(value[k]), `فیلد ${k} نامعتبر است.`);
  for (const k of ['units', 'initialEstimate', 'remainingMinutes', 'actualMinutes', 'minimumChunk']) if (value[k] !== undefined) requireValid(number(value[k]) && value[k] >= 0 && value[k] <= 10000000, `مقدار ${k} نامعتبر است.`);
  for (const k of ['actualConfirmed', 'timerCoverageConfirmed', 'splittable', 'waiting', 'coachDisabled']) if (value[k] !== undefined) requireValid(typeof value[k] === 'boolean', `فیلد ${k} نامعتبر است.`);
  return structuredClone(value) as TaskPlanning;
}
export const MAX_PLANNING_STATE_BYTES = 16 * 1024 * 1024;
export function validatePlanning(value: unknown): PlanningState {
  requireValid(obj(value) && value.schemaVersion === 1, 'نسخهٔ اطلاعات برنامه‌ریزی پشتیبانی نمی‌شود.');
  requireValid(Number.isSafeInteger(value.revision) && value.revision >= 0, 'نسخهٔ ویرایش نامعتبر است.');
  requireValid(new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_PLANNING_STATE_BYTES, 'اطلاعات برنامه‌ریزی از سقف ۱۶ میبی‌بایت بیشتر است.');
  for (const p of collection(value.projects, 'پروژه‌ها')) {
    requireValid(str(p.title) && !!p.title.trim() && str(p.description) && typeof p.archived === 'boolean', 'پروژه نامعتبر است.');
    requireValid(p.nextTaskId === undefined || str(p.nextTaskId), 'قدم بعدی پروژه نامعتبر است.');
    for (const stage of collection(p.stages, 'مراحل')) requireValid(str(stage.title) && !!stage.title.trim(), 'مرحله نامعتبر است.');
  }
  const projectIds = new Set(value.projects.map((p: Project) => p.id));
  for (const e of collection(value.events, 'رویدادها')) {
    requireValid(str(e.title) && !!e.title.trim() && validDate(e.date) && (!e.time || validTime(e.time)) && (!e.projectId || projectIds.has(e.projectId)), 'رویداد نامعتبر است.');
    requireValid(e.kind === undefined || ['event','exam','appointment'].includes(e.kind), 'نوع رویداد نامعتبر است.');
    requireValid(e.repeat === undefined || ['daily','weekly','monthly'].includes(e.repeat), 'الگوی تکرار نامعتبر است.');
    if (e.reminder !== undefined) {
      validateReminder(e.reminder);
      requireValid(!e.repeat || e.reminder.mode !== 'custom', 'یادآوری رویداد تکراری باید بر پایهٔ هر نوبت باشد.');
    }
  }
  for (const m of collection(value.metrics, 'شاخص‌ها')) {
    requireValid(str(m.title) && !!m.title.trim() && str(m.unit) && str(m.description) && ['sum', 'mean', 'last'].includes(m.aggregate) && ['up', 'down', 'neutral'].includes(m.direction) && (!m.projectId || projectIds.has(m.projectId)), 'شاخص نامعتبر است.');
    requireValid((m.min === undefined || number(m.min)) && (m.max === undefined || number(m.max)) && !(m.min !== undefined && m.max !== undefined && m.min > m.max), 'حدود شاخص نامعتبر است.');
    for (const e of collection(m.entries, 'اندازه‌گیری‌ها')) requireValid(validDate(e.date) && number(e.value) && str(e.note), 'اندازه‌گیری نامعتبر است.');
  }
  for (const t of collection(value.templates, 'قالب‌ها')) {
    requireValid(str(t.title) && !!t.title.trim() && Array.isArray(t.tasks) && t.tasks.length <= 1000, 'قالب نامعتبر است.');
    for (const task of t.tasks) {
      requireValid(obj(task) && str(task.title) && !!task.title.trim() && number(task.duration) && task.duration > 0 && number(task.priority) && task.priority > 0 && (task.description === undefined || str(task.description)) && (task.category === undefined || str(task.category)), 'کار قالب نامعتبر است.');
      if (task.subtasks !== undefined) for (const subtask of collection(task.subtasks, 'ریزکارهای قالب')) requireValid(str(subtask.title) && typeof subtask.completed === 'boolean', 'ریزکار قالب نامعتبر است.');
      for (const key of ['id', 'workType', 'unitName']) requireValid(task[key] === undefined || str(task[key]), 'شناسه یا نوع کار قالب نامعتبر است.');
      requireValid(task.units === undefined || number(task.units) && task.units > 0, 'حجم کار قالب نامعتبر است.');
    }
    const itemIds = t.tasks.filter((task: { id?: string }) => task.id !== undefined).map((task: { id: string }) => task.id);
    requireValid(new Set(itemIds).size === itemIds.length, 'شناسهٔ آیتم‌های قالب تکراری است.');
  }
  for (const group of ['availability', 'commitments']) for (const w of collection(value[group], group)) requireValid(validTime(w.start) && validTime(w.end) && w.start < w.end && (w.date ? validDate(w.date) : Number.isInteger(w.weekday) && w.weekday >= 0 && w.weekday <= 6), 'بازهٔ زمانی نامعتبر است.');
  requireValid(Array.isArray(value.excludedDates) && value.excludedDates.every(validDate), 'روزهای استثنا نامعتبرند.');
  for (const key of ['allocations', 'previousAllocations']) if (value[key] !== undefined) {
    requireValid(Array.isArray(value[key]) && value[key].length <= 20000, 'برنامهٔ زمانی نامعتبر است.');
    for (const a of value[key]) {
      requireValid(obj(a) && str(a.taskId) && !!a.taskId && timestamp(a.start) && timestamp(a.end) && Date.parse(a.start) < Date.parse(a.end) && (a.locked === undefined || typeof a.locked === 'boolean'), 'زمان تخصیص‌یافته نامعتبر است.');
      requireValid(a.durationBasis === undefined || ['manual','remaining','timer','history','approved'].includes(a.durationBasis), 'منشأ مدت برنامه نامعتبر است.');
      requireValid(a.plannedTaskMinutes === undefined || number(a.plannedTaskMinutes) && a.plannedTaskMinutes > 0 && a.plannedTaskMinutes <= 10000000, 'مدت مبنای برنامه نامعتبر است.');
    }
  }
  requireValid(obj(value.layout), 'چیدمان نامعتبر است.');
  for (const mode of ['desktop', 'mobile']) {
    requireValid(obj(value.layout[mode]), 'چیدمان دستگاه نامعتبر است.');
    for (const key of ['order', 'hidden', 'pinned']) requireValid(Array.isArray(value.layout[mode][key]) && value.layout[mode][key].length <= 100 && value.layout[mode][key].every(str) && new Set(value.layout[mode][key]).size === value.layout[mode][key].length, 'فهرست چیدمان نامعتبر است.');
    const layout = value.layout[mode];
    if (layout.main !== undefined) {
      requireValid(Array.isArray(layout.main) && layout.main.length <= (mode === 'mobile' ? 4 : 100) && layout.main.every(str) && new Set(layout.main).size === layout.main.length, 'فهرست منوی اصلی نامعتبر است.');
      requireValid(!layout.hidden.some((id: string) => layout.main.includes(id) || layout.pinned.includes(id)) && layout.pinned.every((id: string) => layout.main.includes(id)), 'حالت‌های چیدمان با یکدیگر ناسازگارند.');
    }
    requireValid(!layout.hidden.includes('more') && !layout.hidden.includes('customize'), 'راه دسترسی به بیشتر و شخصی‌سازی باید باز بماند.');
  }
  requireValid(number(value.breakMinutes) && value.breakMinutes >= 0 && value.breakMinutes <= 120 && Number.isInteger(value.minimumSamples) && value.minimumSamples >= 3 && value.minimumSamples <= 50, 'تنظیمات محاسبه نامعتبر است.');
  for (const f of collection(value.feedback, 'بازخورد')) requireValid(str(f.taskId) && ['unclear', 'large', 'waiting', 'time', 'importance', 'other'].includes(f.barrier) && str(f.action) && ['helped', 'not_helped', 'untried'].includes(f.answer) && timestamp(f.at), 'بازخورد نامعتبر است.');
  for (const p of collection(value.predictions, 'تخمین')) requireValid(str(p.taskId) && number(p.minutes) && p.minutes > 0 && (p.manual === null || number(p.manual) && p.manual > 0) && timestamp(p.at) && Array.isArray(p.sampleIds) && p.sampleIds.length <= 20000 && p.sampleIds.every(str), 'سابقهٔ تخمین نامعتبر است.');
  return structuredClone(value) as PlanningState;
}
