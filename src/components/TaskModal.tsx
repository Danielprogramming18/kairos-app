import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, Sparkles, X } from 'lucide-react';
import type { FocusSession, Task } from '../types';
import { TaskPlanningFields } from './PlanningViews';
import { getTodayKey } from '../utils/persianDate';
import { parseNaturalTaskInput } from '../utils/nlpTaskParser';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';
import { restoreTaskEditorDraft, taskEditorDraft, validateTaskEditor, type TaskEditorDraft, type TaskEditorSave } from '../utils/taskEditor';
import './taskEditor.css';

interface TaskModalProps {
  isOpen: boolean; taskToEdit: Task | null; defaultDateKey?: string; defaultProjectId?: string; sessions?: FocusSession[];
  onClose: () => void; onSave: (taskData: TaskEditorSave) => Promise<boolean> | boolean | void;
}
const DRAFT_KEY = 'kairos_unsaved_task_draft_v1';

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, taskToEdit, defaultDateKey, defaultProjectId = '', sessions = [], onClose, onSave }) => {
  const draftKey = defaultProjectId ? DRAFT_KEY + ':' + defaultProjectId : DRAFT_KEY;
  const today = getTodayKey();
  const [draft, setDraft] = useState<TaskEditorDraft>(() => taskEditorDraft(null, defaultDateKey || today));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [priorityVisible, setPriorityVisible] = useState(false);
  const [expanded, setExpanded] = useState({ project: false, time: false, advanced: false });
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const baseline = useRef('');
  const closeEditor = () => { setExpanded({ project: false, time: false, advanced: false }); onClose(); };
  const field = <K extends keyof TaskEditorDraft>(key: K, value: TaskEditorDraft[K]) => setDraft(current => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!isOpen) { setLoaded(false); setExpanded({ project: false, time: false, advanced: false }); return; }
    let next = taskEditorDraft(taskToEdit, defaultDateKey || getTodayKey());
    if (!taskToEdit) {
      next.projectId = defaultProjectId;
      try { const saved = localStorage.getItem(draftKey); next = saved ? restoreTaskEditorDraft(JSON.parse(saved), defaultDateKey || getTodayKey()) || next : next; } catch { /* Keep the usable empty form. */ }
    }
    setDraft(next); baseline.current = JSON.stringify(next); setLoaded(true); setSaving(false); setErrors({});
    setPriorityVisible(Boolean(taskToEdit && taskToEdit.priority !== 1));
    setExpanded({ project: false, time: false, advanced: false });
  }, [isOpen, taskToEdit?.id, defaultDateKey, defaultProjectId, draftKey]);

  useEffect(() => {
    if (!isOpen) return;
    const visual = window.visualViewport;
    const update = () => setViewport(visual ? { height: visual.height, top: visual.offsetTop } : null);
    update(); visual?.addEventListener('resize', update); visual?.addEventListener('scroll', update);
    return () => { visual?.removeEventListener('resize', update); visual?.removeEventListener('scroll', update); };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !loaded) return;
    const dirty = JSON.stringify(draft) !== baseline.current;
    if (!taskToEdit) {
      try { if (dirty || draft.title || draft.description) localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Saving the task still remains available. */ }
    }
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isOpen, loaded, draft, taskToEdit, draftKey]);

  const nlp = useMemo(() => draft.title.trim() ? parseNaturalTaskInput(draft.title) : null, [draft.title]);
  const applyNlp = () => {
    if (!nlp) return;
    setDraft(current => ({ ...current, title: nlp.title, ...(nlp.extractedDateDetected ? { targetDate: nlp.targetDate } : {}), ...(nlp.extractedDurationDetected ? { duration: String(nlp.duration), durationExplicit: true } : {}), ...(nlp.extractedPriorityDetected ? { priority: String(nlp.priority) } : {}), ...(nlp.extractedReminderDetected && nlp.reminderTime ? { reminderTime: nlp.reminderTime } : {}) }));
    if (nlp.extractedPriorityDetected) setPriorityVisible(true);
  };
  const modalRef = useModalFocusTrap<HTMLDivElement>(isOpen, () => { if (!saving) closeEditor(); }, '#task-modal-title-input');
  const errorText = (name: string) => errors[name] && <p id={`task-error-${name}`} className="kte-error" role="alert">{errors[name]}</p>;
  const planningProps = { taskId: taskToEdit?.id, completedAt: taskToEdit?.completedAt, planning: draft.planning, onChange: (value: TaskEditorDraft['planning']) => field('planning', value), projectId: draft.projectId, onProject: (value: string) => field('projectId', value), dueAt: draft.dueAt, onDue: (value: string) => setDraft(current => ({ ...current, dueAt: value, dueEdited: true })), sessions };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving || !loaded) return;
    const result = validateTaskEditor(draft, getTodayKey(), taskToEdit);
    setErrors(result.errors);
    if (!result.data) {
      if (result.errors.duration || result.errors.due || result.errors.planning) setExpanded(current => ({ ...current, time: true }));
      if (result.errors.reminder) setExpanded(current => ({ ...current, advanced: true }));
      if (result.errors.priority) setPriorityVisible(true);
      if (result.errors.title) document.getElementById('task-modal-title-input')?.focus();
      return;
    }
    setSaving(true);
    try {
      const saved = await onSave(result.data);
      if (saved === false) { setErrors({ save: 'ذخیره انجام نشد؛ پیام خطا را بررسی کن و دوباره تلاش کن.' }); return; }
      if (!taskToEdit) { try { localStorage.removeItem(draftKey); } catch { /* The canonical task has already saved. */ } }
      closeEditor();
    } catch (error) { setErrors({ save: (error as Error).message || 'ذخیره انجام نشد.' }); }
    finally { setSaving(false); }
  };

  if (!isOpen) return null;
  return <div className="kte-backdrop kairos-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-modal-title" style={viewport ? { height: viewport.height, top: viewport.top, bottom: 'auto' } : undefined} onClick={event => { if (event.target === event.currentTarget && !saving) closeEditor(); }}>
    <div ref={modalRef} tabIndex={-1} className="kte-panel kairos-modal-panel" style={viewport ? { maxHeight: Math.max(180, viewport.height - 24) } : undefined}>
      <header className="kte-header"><h3 id="task-modal-title"><CheckSquare className="w-5 h-5 text-indigo-500" />{taskToEdit ? 'ویرایش کار' : 'ثبت کار جدید'}</h3><button type="button" onClick={closeEditor} disabled={saving} aria-label="بستن پنجره"><X className="w-5 h-5" /></button></header>
      <form id="task-editor-form" noValidate onSubmit={submit} className="kte-scroll">
        <fieldset disabled={saving || !loaded}>
          <label className="kte-field" htmlFor="task-modal-title-input"><span>عنوان کار *</span><input id="task-modal-title-input" type="text" required value={draft.title} onChange={event => field('title', event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'task-error-title' : undefined} placeholder="چه کاری می‌خواهی انجام بدهی؟" /></label>{errorText('title')}
          {nlp?.hasExtractedTokens && <div className="kte-nlp" data-testid="nlp-extraction-preview"><p><Sparkles className="w-4 h-4" /> از متن، {nlp.extractedDateDetected ? 'تاریخ، ' : ''}{nlp.extractedDurationDetected ? 'مدت، ' : ''}{nlp.extractedPriorityDetected ? 'اولویت، ' : ''}{nlp.extractedReminderDetected ? 'یادآور، ' : ''}پیشنهاد شده است؛ پیش از ثبت بررسی کن.</p><button type="button" onClick={applyNlp}>اعمال مقادیر استخراج‌شده</button></div>}
          <label className="kte-field" htmlFor="task-editor-date"><span>تاریخ انجام (اختیاری؛ پیش‌فرض امروز)</span><input id="task-editor-date" type="date" value={draft.targetDate} onChange={event => field('targetDate', event.target.value)} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? 'task-error-date' : undefined} /></label>{errorText('date')}
          <label className="kte-check"><input type="checkbox" checked={priorityVisible} onChange={event => setPriorityVisible(event.target.checked)} /> اولویت مشخص کنم</label>
          {priorityVisible && <><label className="kte-field" htmlFor="task-editor-priority"><span>شمارهٔ اولویت</span><input id="task-editor-priority" inputMode="numeric" value={draft.priority} onChange={event => field('priority', event.target.value)} aria-invalid={Boolean(errors.priority)} aria-describedby={errors.priority ? 'task-error-priority' : undefined} /></label>{errorText('priority')}</>}
          <details open={expanded.project} onToggle={event => { const open = event.currentTarget.open; setExpanded(current => ({ ...current, project: open })); }}><summary>پروژه و مرحله{draft.projectId ? ' · انتخاب شده' : ''}</summary><TaskPlanningFields {...planningProps} section="project" /></details>
          <details open={expanded.time} onToggle={event => { const open = event.currentTarget.open; setExpanded(current => ({ ...current, time: open })); }}><summary>زمان‌بندی و تخمین</summary><label className="kte-field" htmlFor="task-editor-duration"><span>مدت کار / تایمر (دقیقه)</span><input id="task-editor-duration" inputMode="numeric" value={draft.duration} onChange={event => { const value = event.target.value; setDraft(current => ({ ...current, duration: value, durationExplicit: true })); }} aria-invalid={Boolean(errors.duration)} aria-describedby="task-duration-hint" /></label><p id="task-duration-hint" className="kte-hint">برای ثبت سریع، تنظیم این بخش لازم نیست. مقدار اولیهٔ تایمر ۴۵ دقیقه است.</p>{errorText('duration')}<TaskPlanningFields {...planningProps} section="time" />{errorText('due')}{errorText('planning')}</details>
          <details open={expanded.advanced} onToggle={event => { const open = event.currentTarget.open; setExpanded(current => ({ ...current, advanced: open })); }}><summary>جزئیات پیشرفته</summary><label className="kte-field" htmlFor="task-editor-description"><span>توضیحات و جزئیات (اختیاری)</span><textarea id="task-editor-description" rows={3} value={draft.description} onChange={event => field('description', event.target.value)} /></label><label className="kte-field" htmlFor="task-editor-reminder"><span>ساعت یادآور داخل برنامه</span><input id="task-editor-reminder" type="time" value={draft.reminderTime} onChange={event => field('reminderTime', event.target.value)} aria-invalid={Boolean(errors.reminder)} /></label>{errorText('reminder')}<TaskPlanningFields {...planningProps} section="advanced" /></details>
        </fieldset>
      </form>
      <footer className="kte-footer">{errorText('save')}<div><button type="button" disabled={saving} onClick={closeEditor}>انصراف</button><button className="kte-save" type="submit" form="task-editor-form" disabled={saving || !loaded}>{saving ? 'در حال ذخیره…' : 'ذخیرهٔ کار'}</button></div></footer>
    </div>
  </div>;
};
