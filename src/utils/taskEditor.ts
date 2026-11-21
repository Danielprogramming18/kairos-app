import type { Task } from '../types';
import { parseNumber, validDate, validateTaskPlanning, type TaskPlanning } from '../domain/planning';

export interface TaskEditorDraft {
  title: string; description: string; priority: string; duration: string; targetDate: string; reminderTime: string;
  planning: TaskPlanning; projectId: string; dueAt: string; dueAtOriginal?: string | null; dueEdited: boolean; durationExplicit: boolean;
}
export interface TaskEditorSave {
  id?: string; title: string; description?: string; priority: number; duration: number; targetDate: string;
  reminderTime?: string; planning?: TaskPlanning; projectId?: string | null; dueAt?: string | null; category?: string;
}
function localDateTime(iso?: string | null) {
  const value = iso ? new Date(iso) : null;
  if (!value || !Number.isFinite(value.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}${value.getSeconds() ? ':' + pad(value.getSeconds()) : ''}`;
}
export function taskEditorDraft(task: Task | null, defaultDate: string): TaskEditorDraft {
  return {
    title: task?.title ?? '', description: task?.description ?? '', priority: String(task?.priority ?? 1), duration: String(task?.duration ?? 45),
    targetDate: task?.targetDate ?? defaultDate, reminderTime: task?.reminderTime ?? '', planning: structuredClone(task?.planning ?? {}),
    projectId: task?.projectId ?? '', dueAt: localDateTime(task?.dueAt), dueAtOriginal: task?.dueAt ?? null, dueEdited: false, durationExplicit: false,
  };
}

export function restoreTaskEditorDraft(raw: unknown, defaultDate: string): TaskEditorDraft | null {
  if (!raw || typeof raw !== 'object' || typeof (raw as Record<string, unknown>).title !== 'string') return null;
  const saved = raw as Partial<TaskEditorDraft>;
  const initial = taskEditorDraft(null, defaultDate);
  const draft = { ...initial };
  for (const key of ['title', 'description', 'targetDate', 'reminderTime', 'projectId', 'dueAt'] as const) {
    if (typeof saved[key] === 'string') draft[key] = saved[key];
  }
  if (typeof saved.priority === 'string' || typeof saved.priority === 'number') draft.priority = String(saved.priority);
  if (typeof saved.duration === 'string' || typeof saved.duration === 'number') draft.duration = String(saved.duration);
  try { draft.planning = saved.planning ? validateTaskPlanning(saved.planning) : {}; } catch { return null; }
  draft.durationExplicit = saved.durationExplicit === true;
  draft.dueAtOriginal = typeof saved.dueAtOriginal === 'string' ? saved.dueAtOriginal : null;
  draft.dueEdited = saved.dueEdited === true || Boolean(draft.dueAt && saved.dueAtOriginal === undefined);
  return draft;
}

/** The collapsed state of UI groups never participates in the saved payload. */
export function validateTaskEditor(draft: TaskEditorDraft, today: string, existing?: Task | null): { errors: Record<string, string>; data?: TaskEditorSave } {
  const errors: Record<string, string> = {};
  if (!draft.title.trim()) errors.title = 'عنوان کار را بنویس.';
  const date = draft.targetDate || today;
  if (!validDate(date)) errors.date = 'یک تاریخ معتبر انتخاب کن.';
  const priority = draft.priority.trim() ? parseNumber(draft.priority) : 1;
  if (priority === null || !Number.isInteger(priority) || priority < 1 || priority > 20) errors.priority = 'اولویت باید عددی از ۱ تا ۲۰ باشد.';
  const duration = draft.duration.trim() ? parseNumber(draft.duration) : 45;
  if (duration === null || !Number.isInteger(duration) || duration < 1 || duration > 600) errors.duration = 'مدت را از ۱ تا ۶۰۰ دقیقه وارد کن.';
  if (draft.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.reminderTime)) errors.reminder = 'ساعت یادآور معتبر نیست.';
  let dueAt = draft.dueAtOriginal ?? null;
  if (draft.dueEdited || (draft.dueAt && !draft.dueAtOriginal)) {
    if (draft.dueAt && !Number.isFinite(new Date(draft.dueAt).getTime())) errors.due = 'موعد معتبر نیست.';
    else dueAt = draft.dueAt ? new Date(draft.dueAt).toISOString() : null;
  }
  let planning: TaskPlanning = {};
  try { planning = validateTaskPlanning(draft.planning); } catch (error) { errors.planning = (error as Error).message; }
  if (Object.keys(errors).length) return { errors };
  if (draft.durationExplicit && planning.initialEstimate === undefined) planning.initialEstimate = duration!;
  return { errors, data: { id: existing?.id, title: draft.title.trim(), description: draft.description.trim() || undefined, priority: priority!, duration: duration!, targetDate: date, reminderTime: draft.reminderTime || undefined, projectId: draft.projectId || null, dueAt, planning, category: existing?.category || 'work' } };
}
