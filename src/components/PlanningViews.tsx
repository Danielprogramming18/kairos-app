import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FocusSession, NavTabId, Task } from '../types';
import { usePlanning } from '../app/PlanningContext';
import { createEntityId } from '../domain/models';
import { Allocation, Barrier, localDate, Metric, normalizeText, parseNumber, PlanningEvent, TaskPlanning, TaskTemplate } from '../domain/planning';
import { estimateDuration, eventCountdown, instantiateTemplate, metricSummary, ScheduleResult, scheduleFingerprint } from '../utils/planningEngine';
import { NAV_LABELS } from './planningNavigation';
import './planning.css';
export function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return <div className="kp-field"><label htmlFor={id}>{label}</label>{React.isValidElement<{
      id?: string;
    }>(children) ? React.cloneElement(children, {
      id
    }) : children}</div>;
}
const uid = () => createEntityId('plan');
const today = () => localDate(new Date());
const formatDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('fa-IR');
const blankEvent = (): PlanningEvent => ({
  id: uid(),
  title: '',
  date: today(),
  time: ''
});
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, []);
  return now;
}
export function PlanningShell({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  const p = usePlanning();
  return <section className="kp" dir="rtl"><h2>{title}</h2>{p.error && <div role="alert" className="kp-error">{p.error}<button onClick={() => void p.refresh()}>تازه‌سازی</button></div>}{!p.ready ? <p>در حال خواندن اطلاعات…</p> : <fieldset disabled={p.busy}>{children}</fieldset>}</section>;
}
const builtins: TaskTemplate[] = [{
  id: 'study',
  title: 'جلسهٔ مطالعه',
  tasks: [{
    title: 'مرور مطالب قبلی',
    duration: 15,
    priority: 1,
    category: 'learning'
  }, {
    title: 'مطالعهٔ بخش جدید',
    duration: 40,
    priority: 2,
    category: 'learning'
  }, {
    title: 'تمرین و جمع‌بندی',
    duration: 20,
    priority: 3,
    category: 'learning'
  }]
}, {
  id: 'personal-project',
  title: 'شروع پروژهٔ شخصی',
  tasks: [{
    title: 'تعریف نتیجهٔ مورد انتظار',
    duration: 20,
    priority: 1,
    category: 'work'
  }, {
    title: 'ساخت اولین نمونه',
    duration: 60,
    priority: 2,
    category: 'work'
  }, {
    title: 'بررسی و اصلاح',
    duration: 30,
    priority: 3,
    category: 'work'
  }]
}];
function StageRow({
  title,
  count,
  canUp,
  canDown,
  onMove,
  onRename,
  onRemove
}: {
  title: string;
  count: number;
  canUp: boolean;
  canDown: boolean;
  onMove: (direction: number) => void;
  onRename: (title: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [name, setName] = useState(title);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setName(title), [title]);
  return <div className="kp-card"><div className="kp-actions"><Field label={`نام مرحله ${title}`}><input value={name} onChange={e => setName(e.target.value)} /></Field><button disabled={!name.trim() || name.trim() === title} onClick={() => void onRename(name.trim())}>ذخیرهٔ نام مرحله</button><button aria-label={`مرحله ${title} بالاتر`} disabled={!canUp} onClick={() => onMove(-1)}>↑</button><button aria-label={`مرحله ${title} پایین‌تر`} disabled={!canDown} onClick={() => onMove(1)}>↓</button><small>{count} کار</small><button disabled={count > 0} onClick={() => setConfirm(true)}>حذف مرحله</button></div>{count > 0 && <small>برای حذف مرحله، ابتدا کارهای آن را در فرم کار به مرحلهٔ دیگری منتقل کن.</small>}{confirm && <div className="kp-actions"><span>مرحلهٔ خالی حذف شود؟</span><button onClick={onRemove}>تأیید حذف مرحله</button><button onClick={() => setConfirm(false)}>انصراف</button></div>}</div>;
}
export function ProjectsView({
  tasks,
  onEdit,
  onAdd,
  onSaveTasks,
  onToggle
}: {
  tasks: Task[];
  onEdit: (id: string) => void;
  onAdd: () => void;
  onSaveTasks: (tasks: Task[]) => Promise<boolean>;
  onToggle: (id: string) => void;
}) {
  const {
    state,
    change
  } = usePlanning();
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [due, setDue] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stageTitle, setStageTitle] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [template, setTemplate] = useState<TaskTemplate | null>(null);
  const [templateDate, setTemplateDate] = useState(today);
  const [templateName, setTemplateName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [removeTemplate, setRemoveTemplate] = useState('');
  const project = state.projects.find(p => p.id === selected);
  useEffect(() => {
    setTitle(project?.title ?? '');
    setDescription(project?.description ?? '');
  }, [selected, project?.title, project?.description]);
  const filtered = tasks.filter(t => (!selected || t.projectId === selected) && normalizeText(t.title + ' ' + (state.projects.find(p => p.id === t.projectId)?.title ?? '')).includes(normalizeText(query)) && (status === 'all' || (status === 'done' ? t.completed : status === 'archived' ? t.status === 'archived' : !t.completed && t.status !== 'archived')) && (!due || t.dueAt && localDate(new Date(t.dueAt)) <= due));
  const activeProjectTasks = tasks.filter(t => t.projectId === selected && t.status !== 'archived');
  const done = activeProjectTasks.filter(t => t.completed).length;
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (project) {
      await change(s => {
        const p = s.projects.find(p => p.id === selected)!;
        p.title = title.trim();
        p.description = description;
      });
      return;
    }
    const id = uid();
    if (await change(s => {
      s.projects.push({
        id,
        title: title.trim(),
        description,
        archived: false,
        stages: []
      });
    })) setSelected(id);
  };
  const copy = async (t: Task) => {
    setSaving(true);
    try {
      const fresh = instantiateTemplate({
        id: t.planning?.templateId ?? 'copy',
        title: t.title,
        tasks: [t]
      }, templateDate, t.projectId ?? undefined)[0];
      if (await onSaveTasks([fresh])) setMessage('کپی کار با وضعیت تازه ساخته شد.');
    } finally {
      setSaving(false);
    }
  };
  const useTemplate = async () => {
    if (!template) return;
    setSaving(true);
    try {
      if (await onSaveTasks(instantiateTemplate(template, templateDate, selected || undefined))) {
        setTemplate(null);
        setMessage('کارهای قالب ساخته شدند.');
      }
    } finally {
      setSaving(false);
    }
  };
  return <PlanningShell title="پروژه‌ها و جست‌وجو"><p>کارها را به هدف، مرحله و قدم بعدی وصل کن.</p>
    <div className="kp-grid"><Field label="پروژه"><select value={selected} onChange={e => setSelected(e.target.value)}><option value="">همهٔ کارها / پروژهٔ جدید</option>{state.projects.filter(p => includeArchived || !p.archived || p.id === selected).map(p => <option key={p.id} value={p.id}>{p.title}{p.archived ? ' (بایگانی)' : ''}</option>)}</select></Field><label><input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} /> نمایش بایگانی</label></div>
    <form className="kp-card" onSubmit={create}><div className="kp-grid"><Field label="نام پروژه"><input required value={title} onChange={e => setTitle(e.target.value)} /></Field><Field label="توضیح"><input value={description} onChange={e => setDescription(e.target.value)} /></Field></div>{project ? <div className="kp-actions"><button type="button" disabled={!title.trim()} onClick={() => void change(s => {
          const p = s.projects.find(p => p.id === selected)!;
          p.title = title.trim();
          p.description = description;
        })}>ذخیرهٔ پروژه</button><button type="button" onClick={() => void change(s => {
          s.projects.find(p => p.id === selected)!.archived = !project.archived;
        })}>{project.archived ? 'بازگرداندن پروژه' : 'بایگانی پروژه'}</button><small>بایگانی، کارهای پروژه را حذف نمی‌کند.</small></div> : <button>ساخت پروژه</button>}</form>
    {project && <div className="kp-card"><h3>پیشرفت کارهای پروژه</h3>{activeProjectTasks.length ? <><progress value={done} max={activeProjectTasks.length} /><p>{done} از {activeProjectTasks.length} کار — {Math.round(done / activeProjectTasks.length * 100)}٪</p></> : <p>پروژه هنوز کاری ندارد.</p>}
      <Field label="قدم بعدی"><select value={project.nextTaskId ?? ''} onChange={e => void change(s => {
          s.projects.find(p => p.id === selected)!.nextTaskId = e.target.value;
        })}><option value="">انتخاب نشده</option>{activeProjectTasks.filter(t => !t.completed).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
      <form className="kp-actions" onSubmit={async e => {
        e.preventDefault();
        if (stageTitle.trim() && (await change(s => {
          s.projects.find(p => p.id === selected)!.stages.push({
            id: uid(),
            title: stageTitle.trim()
          });
        }))) setStageTitle('');
      }}><Field label="مرحلهٔ جدید"><input value={stageTitle} onChange={e => setStageTitle(e.target.value)} required /></Field><button>افزودن مرحله</button></form>
      {project.stages.map((stage, i) => <StageRow key={stage.id} title={stage.title} count={tasks.filter(t => t.projectId === selected && t.planning?.stageId === stage.id).length} canUp={i > 0} canDown={i < project.stages.length - 1} onMove={direction => void change(s => {
        const a = s.projects.find(p => p.id === selected)!.stages;
        [a[i], a[i + direction]] = [a[i + direction], a[i]];
      })} onRename={name => change(s => {
        s.projects.find(p => p.id === selected)!.stages.find(x => x.id === stage.id)!.title = name;
      })} onRemove={() => void change(s => {
        if (tasks.some(t => t.projectId === selected && t.planning?.stageId === stage.id)) throw Error('این مرحله هنوز کار دارد؛ ابتدا کارهای آن را منتقل کن.');
        s.projects.find(p => p.id === selected)!.stages = s.projects.find(p => p.id === selected)!.stages.filter(x => x.id !== stage.id);
      })} />)} 
    </div>}
    <div className="kp-grid"><Field label="جست‌وجوی کار یا پروژه"><input type="search" value={query} onChange={e => setQuery(e.target.value)} /></Field><Field label="وضعیت"><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">همه</option><option value="open">انجام‌نشده</option><option value="done">انجام‌شده</option><option value="archived">بایگانی</option></select></Field><Field label="موعد تا تاریخ (میلادی)"><input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field></div>
    <button onClick={onAdd}>کار جدید</button>{!filtered.length && <p>کاری با این فیلتر پیدا نشد.</p>}
    {filtered.map(t => <article className="kp-card" key={t.id}><div className="kp-actions"><input aria-label={`انجام ${t.title}`} type="checkbox" checked={t.completed} onChange={() => onToggle(t.id)} /><button className="kp-link" onClick={() => onEdit(t.id)}>{t.title}</button><small>{state.projects.find(p => p.id === t.projectId)?.title}</small><button disabled={saving || !templateDate} onClick={() => void copy(t)}>کپی برای تاریخ انتخابی</button></div>{t.planning?.resume && <p>از اینجا ادامه بده: {t.planning.resume}</p>}<small>{t.planning?.waiting ? 'در انتظار · ' : ''}{t.duration} دقیقه</small></article>)}
    <div className="kp-card"><h3>قالب‌ها و کپی کار</h3><Field label="تاریخ کارهای جدید (میلادی)"><input required type="date" value={templateDate} onChange={e => setTemplateDate(e.target.value)} /></Field><div className="kp-actions">{[...builtins, ...state.templates].map(t => <button key={t.id} onClick={() => setTemplate(structuredClone(t))}>{t.title}</button>)}</div>
      <form className="kp-actions" onSubmit={async e => {
        e.preventDefault();
        if (templateName.trim() && filtered.length && (await change(s => {
          s.templates.push({
            id: uid(),
            title: templateName.trim(),
            tasks: filtered.map(t => ({
              title: t.title,
              description: t.description,
              duration: t.duration,
              priority: t.priority,
              category: t.category,
              subtasks: t.subtasks?.map(x => ({
                ...x,
                completed: false
              }))
            }))
          });
        }))) setTemplateName('');
      }}><Field label="نام قالب از کارهای فهرست فعلی"><input required value={templateName} onChange={e => setTemplateName(e.target.value)} /></Field><button disabled={!filtered.length}>ذخیرهٔ قالب</button></form>
      {template && <div className="kp-card"><h4>پیش‌نمایش قابل ویرایش</h4><Field label="عنوان قالب"><input value={template.title} onChange={e => setTemplate({
            ...template,
            title: e.target.value
          })} /></Field>{template.tasks.map((t, i) => <div className="kp-grid" key={i}><Field label={`کار ${i + 1}`}><input value={t.title} onChange={e => setTemplate({
              ...template,
              tasks: template.tasks.map((x, j) => i === j ? {
                ...x,
                title: e.target.value
              } : x)
            })} /></Field><Field label="مدت (دقیقه)"><input type="number" min="1" value={t.duration} onChange={e => setTemplate({
              ...template,
              tasks: template.tasks.map((x, j) => i === j ? {
                ...x,
                duration: Number(e.target.value)
              } : x)
            })} /></Field></div>)}<p>وضعیت انجام، زمان واقعی و سابقهٔ قبلی کپی نمی‌شود.</p>{state.templates.some(t => t.id === template.id) && <div className="kp-actions"><button disabled={!template.title.trim() || template.tasks.some(t => !t.title.trim() || !(t.duration > 0))} onClick={async () => {
            if (await change(s => {
              s.templates = s.templates.map(t => t.id === template.id ? structuredClone(template) : t);
            })) setMessage("قالب ویرایش شد.");
          }}>ذخیرهٔ تغییرات قالب</button><button onClick={() => setRemoveTemplate(template.id)}>حذف قالب</button>{removeTemplate === template.id && <><span>فقط قالب حذف شود؟ کارهای ساخته‌شده حفظ می‌شوند.</span><button onClick={async () => {
              if (await change(s => {
                s.templates = s.templates.filter(t => t.id !== template.id);
              })) {
                setTemplate(null);
                setRemoveTemplate("");
              }
            }}>تأیید حذف قالب</button><button onClick={() => setRemoveTemplate("")}>انصراف</button></>}</div>}<div className="kp-actions"><button disabled={saving || !templateDate || !template.title.trim() || template.tasks.some(t => !t.title.trim() || !(t.duration > 0))} onClick={() => void useTemplate()}>تأیید ساخت {template.tasks.length} کار</button><button onClick={() => setTemplate(null)}>انصراف</button></div></div>}
    </div><p role="status">{message}</p></PlanningShell>;
}
export function EventsView() {
  const {
    state,
    change
  } = usePlanning();
  const [draft, setDraft] = useState(blankEvent);
  const [remove, setRemove] = useState('');
  const now = useClock();
  return <PlanningShell title="رویدادها و امتحان‌ها"><p>شمارش معکوس داخل برنامه؛ تاریخ ورودی میلادی است و در فهرست شمسی نمایش داده می‌شود.</p><form className="kp-card" onSubmit={async e => {
      e.preventDefault();
      if (await change(s => {
        s.events = s.events.filter(x => x.id !== draft.id);
        s.events.push({
          ...draft,
          title: draft.title.trim()
        });
      })) setDraft(blankEvent());
    }}><div className="kp-grid"><Field label="عنوان رویداد"><input required value={draft.title} onChange={e => setDraft({
            ...draft,
            title: e.target.value
          })} /></Field><Field label="تاریخ"><input required type="date" value={draft.date} onChange={e => setDraft({
            ...draft,
            date: e.target.value
          })} /></Field><Field label="ساعت اختیاری"><input type="time" value={draft.time ?? ''} onChange={e => setDraft({
            ...draft,
            time: e.target.value
          })} /></Field><Field label="پروژهٔ مرتبط"><select value={draft.projectId ?? ''} onChange={e => setDraft({
            ...draft,
            projectId: e.target.value || undefined
          })}><option value="">بدون پروژه</option>{state.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field></div><div className="kp-actions"><button>ذخیرهٔ رویداد</button><button type="button" onClick={() => setDraft(blankEvent())}>فرم جدید</button></div></form>
    {!state.events.length && <p>اولین امتحان یا قرار خودت را ثبت کن.</p>}{[...state.events].sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))).map(e => <article className="kp-card" key={e.id}><h3>{e.title}</h3><p>{formatDate(e.date)} {e.time} — <strong>{eventCountdown(e, now)}</strong></p><div className="kp-actions"><button onClick={() => setDraft({
          ...e
        })}>ویرایش</button><button onClick={() => setRemove(e.id)}>حذف</button>{remove === e.id && <><span>این رویداد حذف شود؟</span><button onClick={async () => {
            if (await change(s => {
              s.events = s.events.filter(x => x.id !== e.id);
            })) setRemove('');
          }}>تأیید حذف رویداد</button><button onClick={() => setRemove('')}>انصراف</button></>}</div></article>)}</PlanningShell>;
}
const newMetric = (): Metric => ({
  id: uid(),
  title: '',
  unit: '',
  description: '',
  aggregate: 'sum',
  direction: 'neutral',
  entries: []
});
export function TrackingView() {
  const {
    state,
    change
  } = usePlanning();
  const [draft, setDraft] = useState(newMetric);
  const [selected, setSelected] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [entryId, setEntryId] = useState('');
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [remove, setRemove] = useState('');
  const [editorOpen, setEditorOpen] = useState(!state.metrics.length);
  const metric = state.metrics.find(m => m.id === selected);
  const rows = metric?.entries.filter(e => (!from || e.date >= from) && (!to || e.date <= to)).sort((a, b) => a.date.localeCompare(b.date)) ?? [];
  const old = state.metrics.find(m => m.id === draft.id);
  const count = old?.entries.length ?? 0;
  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseNumber(value);
    if (n === null || !metric) {
      setError('یک عدد معتبر وارد کن.');
      return;
    }
    if (metric.min !== undefined && n < metric.min || metric.max !== undefined && n > metric.max) {
      setError('مقدار خارج از حدود تعریف‌شده است؛ مقدار یا حدود شاخص را اصلاح کن.');
      return;
    }
    if (await change(s => {
      const m = s.metrics.find(m => m.id === selected)!;
      m.entries = m.entries.filter(x => x.id !== entryId);
      m.entries.push({
        id: entryId || uid(),
        date,
        value: n,
        note
      });
    })) {
      setEntryId('');
      setValue('');
      setNote('');
      setError('');
    }
  };
  const min = rows.length ? Math.min(...rows.map(x => x.value)) : 0,
    max = rows.length ? Math.max(...rows.map(x => x.value)) : 1;
  const stamps = rows.map(x => new Date(x.date + 'T12:00:00').getTime());
  const start = stamps[0] ?? 0,
    end = stamps.at(-1) ?? 1;
  return <PlanningShell title="پیگیری‌ها"><p>شاخص دلخواه بساز و فقط داده‌های واقعی خودت را ثبت کن.</p><details className="kp-card" open={editorOpen} onToggle={e => setEditorOpen(e.currentTarget.open)}><summary>ساخت یا ویرایش شاخص</summary><form onSubmit={async e => {
        e.preventDefault();
        if (await change(s => {
          const existing = s.metrics.find(x => x.id === draft.id);
          if (existing?.entries.length && existing.unit !== draft.unit) throw Error('برای واحد جدید، شاخص جدید بساز؛ اعداد قبلی خودکار تبدیل نمی‌شوند.');
          s.metrics = s.metrics.filter(x => x.id !== draft.id);
          s.metrics.push({
            ...draft,
            entries: existing?.entries ?? [],
            title: draft.title.trim()
          });
        })) {
          setSelected(draft.id);
          setDraft(newMetric());
          setEditorOpen(false);
        }
      }}><div className="kp-grid"><Field label="نام شاخص"><input required value={draft.title} onChange={e => setDraft({
              ...draft,
              title: e.target.value
            })} /></Field><Field label="واحد"><input required disabled={count > 0} value={draft.unit} onChange={e => setDraft({
              ...draft,
              unit: e.target.value
            })} /></Field><Field label="توضیح"><input value={draft.description} onChange={e => setDraft({
              ...draft,
              description: e.target.value
            })} /></Field><Field label="خلاصه‌سازی"><select value={draft.aggregate} onChange={e => setDraft({
              ...draft,
              aggregate: e.target.value as Metric['aggregate']
            })}><option value="sum">جمع</option><option value="mean">میانگین</option><option value="last">آخرین مقدار</option></select></Field><Field label="جهت مطلوب"><select value={draft.direction} onChange={e => setDraft({
              ...draft,
              direction: e.target.value as Metric['direction']
            })}><option value="neutral">بدون جهت مطلوب</option><option value="up">افزایش</option><option value="down">کاهش</option></select></Field><Field label="پروژه"><select value={draft.projectId ?? ''} onChange={e => setDraft({
              ...draft,
              projectId: e.target.value || undefined
            })}><option value="">بدون پروژه</option>{state.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>{(['min', 'max'] as const).map(k => <Field key={k} label={k === 'min' ? 'حداقل اختیاری' : 'حداکثر اختیاری'}><input type="number" step="any" value={draft[k] ?? ''} onChange={e => setDraft({
              ...draft,
              [k]: e.target.value === '' ? undefined : Number(e.target.value)
            })} /></Field>)}</div>{count > 0 && <p>برای تغییر واحد، شاخص تازه بساز؛ واحد اندازه‌گیری قبلی حفظ می‌شود.</p>}<div className="kp-actions"><button>ذخیرهٔ شاخص</button><button type="button" onClick={() => setDraft(newMetric())}>فرم جدید</button></div></form></details>
    <Field label="شاخص"><select value={selected} onChange={e => {
        setSelected(e.target.value);
        setEntryId('');
        setValue('');
        setNote('');
      }}><option value="">انتخاب شاخص</option>{state.metrics.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></Field>
    {metric && <><button onClick={() => {
        setDraft(structuredClone(metric));
        setEditorOpen(true);
      }}>ویرایش مشخصات شاخص</button><form className="kp-card" onSubmit={record}><div className="kp-grid"><Field label={`مقدار (${metric.unit})`}><input required inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /></Field><Field label="تاریخ میلادی"><input required type="date" value={date} onChange={e => setDate(e.target.value)} /></Field><Field label="یادداشت اختیاری"><input value={note} onChange={e => setNote(e.target.value)} /></Field></div><button>{entryId ? 'ذخیرهٔ ویرایش' : 'ثبت مقدار'}</button>{error && <p role="alert">{error}</p>}</form><div className="kp-grid"><Field label="از تاریخ"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="تا تاریخ"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field></div><p>{metric.aggregate === 'sum' ? 'جمع' : metric.aggregate === 'mean' ? 'میانگین' : 'آخرین مقدار'}: {metricSummary(metric, from, to || '9999-12-31')?.toLocaleString('fa-IR') ?? 'داده‌ای ثبت نشده'} {metric.unit}</p>
      {rows.length > 0 && <figure className="kp-card"><svg viewBox="0 0 600 200" role="img" aria-label={`نمودار مقادیر ${metric.title}؛ جزئیات در جدول زیر`}><line x1="35" y1="165" x2="580" y2="165" stroke="currentColor" opacity=".4" />{rows.map((r, i) => <circle key={r.id} cx={end === start ? 300 : 35 + (stamps[i] - start) / (end - start) * 545} cy={max === min ? 90 : 155 - (r.value - min) / (max - min) * 125} r="5" fill="var(--accent-primary, #6366f1)"><title>{formatDate(r.date)}: {r.value} {metric.unit}</title></circle>)}</svg><figcaption>هر نقطه یک ثبت است؛ فاصلهٔ افقی متناسب با تاریخ است. روز بدون داده صفر حساب نمی‌شود.</figcaption></figure>}
      <div className="kp-table"><table><thead><tr><th>تاریخ</th><th>مقدار</th><th>یادداشت</th><th>عملیات</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{formatDate(r.date)}</td><td>{r.value} {metric.unit}</td><td>{r.note}</td><td><button onClick={() => {
                  setEntryId(r.id);
                  setValue(String(r.value));
                  setDate(r.date);
                  setNote(r.note);
                }}>ویرایش ثبت</button><button onClick={() => setRemove(r.id)}>حذف ثبت</button>{remove === r.id && <><button onClick={async () => {
                    if (await change(s => {
                      const m = s.metrics.find(m => m.id === selected)!;
                      m.entries = m.entries.filter(x => x.id !== r.id);
                    })) {
                      setRemove('');
                      setEntryId('');
                      setValue('');
                    }
                  }}>تأیید حذف ثبت</button><button onClick={() => setRemove('')}>انصراف</button></>}</td></tr>)}</tbody></table></div></>}
  </PlanningShell>;
}
export const barrierLabels: Record<Barrier, string> = {
  unclear: 'نمی‌دانم از کجا شروع کنم',
  large: 'کار خیلی بزرگ است',
  waiting: 'منتظر کسی هستم',
  time: 'وقت کافی ندارم',
  importance: 'اهمیت کار تغییر کرده',
  other: 'مورد دیگر'
};
// Beta(2,2) is an engineering prior, not a claim of scientific effectiveness.
const COACH_RANKING = {
  priorSuccess: 2,
  priorFailure: 2,
  minimumResponses: 3,
  maximumRecords: 100
};
const barrierReasons: Record<Barrier, string> = {
  unclear: 'روشن‌کردن قدم بعدی، ابهام شروع را کمتر می‌کند.',
  large: 'کوچک‌کردن محدوده، شروع را قابل مدیریت‌تر می‌کند.',
  waiting: 'جداکردن وابستگی‌ها کمک می‌کند بخش مستقل و زمان پیگیری معلوم باشد.',
  time: 'اصلاح برآورد و ظرفیت، تصمیم دربارهٔ تعهد را روشن‌تر می‌کند.',
  importance: 'بازبینی اهمیت کمک می‌کند وقتت را به کارهای فعلی اختصاص بدهی.',
  other: 'ثبت دلیل با انتخاب خودت، اطلاعات لازم برای ادامه را نگه می‌دارد.'
};
const coachActions: Record<Barrier, {
  id: string;
  title: string;
}[]> = {
  unclear: [{
    id: 'first-step',
    title: 'در یادداشت ادامهٔ کار، اولین حرکت قابل انجام را در یک جمله بنویس.'
  }, {
    id: 'define-done',
    title: 'بنویس بعد از انجام این کار دقیقاً چه نتیجه‌ای باید داشته باشی.'
  }, {
    id: 'short-trial',
    title: 'یک شروع آزمایشی پنج‌دقیقه‌ای انتخاب کن؛ ادامه‌دادن اختیاری است.'
  }],
  large: [{
    id: 'small-part',
    title: 'کوچک‌ترین بخش مستقل کار را به یک زیرکار تبدیل کن.'
  }, {
    id: 'short-session',
    title: 'کار را به چند جلسه با حداقل طول مشخص تقسیم کن.'
  }, {
    id: 'reduce-scope',
    title: 'یک نتیجهٔ کوچک‌تر انتخاب کن و بقیه را برای بعد نگه دار.'
  }],
  waiting: [{
    id: 'record-wait',
    title: 'وضعیت انتظار را ثبت کن و یک زمان مشخص برای پیگیری در نظر بگیر.'
  }, {
    id: 'independent-step',
    title: 'اگر بخش مستقلی وجود دارد، همان بخش را به یک کار جدا تبدیل کن.'
  }],
  time: [{
    id: 'check-capacity',
    title: 'مدت باقی‌مانده را اصلاح کن و در «قبل از قول‌دادن» ظرفیت را بررسی کن.'
  }, {
    id: 'smaller-commitment',
    title: 'یک بخش کوچک‌تر برای جلسهٔ بعد انتخاب کن و موعد را واقع‌بینانه بازبینی کن.'
  }],
  importance: [{
    id: 'revisit-priority',
    title: 'اولویت کار را با توجه به هدف فعلی بازبینی کن.'
  }, {
    id: 'archive-defer',
    title: 'اگر فعلاً لازم نیست، از فهرست کارها آن را بایگانی کن.'
  }],
  other: [{
    id: 'note-reason',
    title: 'دلیل را در یادداشت ادامهٔ کار ثبت کن؛ برنامه از روی آن تشخیص یا قضاوت نمی‌کند.'
  }, {
    id: 'choose-next',
    title: 'یک قدم بعدی با انتخاب خودت بنویس یا فعلاً پیشنهاد را رد کن.'
  }]
};
export function TaskPlanningFields({
  taskId,
  projectId,
  onProject,
  planning,
  onChange,
  dueAt,
  onDue
}: {
  taskId?: string;
  projectId: string;
  onProject: (id: string) => void;
  planning: TaskPlanning;
  onChange: (p: TaskPlanning) => void;
  dueAt: string;
  onDue: (v: string) => void;
}) {
  const {
    state,
    change
  } = usePlanning();
  const [barrier, setBarrier] = useState<Barrier>('unclear');
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [actionId, setActionId] = useState('');
  const project = state.projects.find(p => p.id === projectId);
  const ranked = useMemo(() => coachActions[barrier].map((action, index) => {
    const records = state.feedback.filter(f => f.barrier === barrier && f.action === action.id && f.answer !== 'untried').sort((a, b) => b.at.localeCompare(a.at));
    const seen = new Set<string>();
    const unique = records.filter(f => {
      if (seen.has(f.taskId)) return false;
      seen.add(f.taskId);
      return true;
    }).slice(0, COACH_RANKING.maximumRecords);
    const count = unique.length;
    const helped = unique.filter(f => f.answer === 'helped').length;
    return {
      ...action,
      index,
      count,
      helped,
      score: count >= COACH_RANKING.minimumResponses ? (COACH_RANKING.priorSuccess + helped) / (COACH_RANKING.priorSuccess + COACH_RANKING.priorFailure + count) : 0.5
    };
  }).sort((a, b) => b.score - a.score || a.index - b.index), [barrier, state.feedback]);
  const action = ranked.find(a => a.id === actionId) ?? ranked[0];
  useEffect(() => {
    setFeedback('');
    setOpen(false);
    setActionId('');
  }, [taskId]);
  const saveFeedback = async (answer: 'helped' | 'not_helped' | 'untried') => {
    if (!taskId) return;
    const previous = state.feedback.find(f => f.taskId === taskId && f.barrier === barrier && f.action === action.id);
    if (previous?.answer === answer) {
      setFeedback('این بازخورد قبلاً ثبت شده است.');
      return;
    }
    if (await change(s => {
      s.feedback = s.feedback.filter(f => !(f.taskId === taskId && f.barrier === barrier && f.action === action.id));
      s.feedback.push({
        id: previous?.id ?? uid(),
        taskId,
        barrier,
        action: action.id,
        answer,
        at: new Date().toISOString()
      });
    })) setFeedback('بازخورد ذخیره شد.');
  };
  return <div className="kp kp-card"><h4>پروژه و ادامهٔ کار</h4><div className="kp-grid"><Field label="پروژه"><select value={projectId} onChange={e => {
          onProject(e.target.value);
          onChange({
            ...planning,
            stageId: undefined
          });
        }}><option value="">بدون پروژه</option>{state.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field><Field label="مرحله"><select value={planning.stageId ?? ''} onChange={e => onChange({
          ...planning,
          stageId: e.target.value || undefined
        })}><option value="">بدون مرحله</option>{project?.stages.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field></div><Field label="از اینجا ادامه بده"><textarea value={planning.resume ?? ''} onChange={e => onChange({
        ...planning,
        resume: e.target.value
      })} /></Field><Field label="موعد تحویل (تاریخ و ساعت محلی، اختیاری)"><input type="datetime-local" value={dueAt} onChange={e => onDue(e.target.value)} /></Field><div className="kp-grid">{(['remainingMinutes', 'actualMinutes', 'units'] as const).map(k => <Field key={k} label={k === 'remainingMinutes' ? 'مدت باقی‌مانده (دقیقه)' : k === 'actualMinutes' ? 'زمان واقعی انجام (دقیقه)' : 'حجم کار (مثلاً تعداد سؤال)'}><input type="number" min="0" step="any" value={planning[k] ?? ''} onChange={e => onChange({
          ...planning,
          [k]: e.target.value === '' ? undefined : Number(e.target.value),
          ...(k === 'actualMinutes' ? {
            actualConfirmed: false
          } : {})
        })} /></Field>)}<Field label="واحد حجم کار"><input value={planning.unitName ?? ''} onChange={e => onChange({
          ...planning,
          unitName: e.target.value
        })} /></Field></div><label><input type="checkbox" checked={!!planning.actualConfirmed} onChange={e => onChange({
        ...planning,
        actualConfirmed: e.target.checked
      })} /> زمان واقعی ثبت‌شده را بررسی و تأیید کرده‌ام</label><label><input type="checkbox" checked={!!planning.splittable} onChange={e => onChange({
        ...planning,
        splittable: e.target.checked
      })} /> کار قابل تقسیم به چند جلسه است</label>{planning.splittable && <Field label="حداقل طول جلسه (دقیقه)"><input type="number" min="1" value={planning.minimumChunk ?? 15} onChange={e => onChange({
        ...planning,
        minimumChunk: Number(e.target.value)
      })} /></Field>}<label><input type="checkbox" checked={!!planning.waiting} onChange={e => onChange({
        ...planning,
        waiting: e.target.checked
      })} /> منتظر شخص دیگری هستم</label><label><input type="checkbox" checked={!!planning.coachDisabled} onChange={e => onChange({
        ...planning,
        coachDisabled: e.target.checked
      })} /> کمک‌یار این کار خاموش باشد</label>
    {!planning.coachDisabled && <><button type="button" onClick={() => setOpen(!open)}>چی جلوی شروعش را گرفت؟</button>{open && <div className="kp-card"><Field label="مانع از نظر خودت"><select value={barrier} onChange={e => {
            setBarrier(e.target.value as Barrier);
            setActionId('');
            setFeedback('');
          }}>{Object.entries(barrierLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="راهکار پیشنهادی؛ می‌توانی گزینهٔ دیگری انتخاب کنی"><select value={action.id} onChange={e => {
            setActionId(e.target.value);
            setFeedback('');
          }}>{ranked.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></Field><p>{action.title}</p><p>{barrierReasons[barrier]}</p><small>ترتیب راهکارها از بازخوردهای همین مانع و حداکثر ۱۰۰ کار یکتا استفاده می‌کند. تا سه بازخورد معتبر، ترتیب پایه حفظ می‌شود؛ پاسخ «هنوز امتحان نکردم» در رتبه‌بندی حساب نمی‌شود.</small><p>{action.count} بازخورد معتبر برای این راهکار؛ {action.helped} پاسخ «کمک کرد». این پیشنهاد تضمین نتیجه نیست.</p><div className="kp-actions">{barrier === 'waiting' && <button type="button" onClick={() => onChange({
            ...planning,
            waiting: true
          })}>ثبت انتظار در فرم</button>}<button type="button" onClick={() => setOpen(false)}>بعداً / رد پیشنهاد</button></div>{taskId ? <><p>بازخورد اختیاری دربارهٔ این راهکار:</p><div className="kp-actions">{([['helped', 'کمک کرد'], ['not_helped', 'کمک نکرد'], ['untried', 'هنوز امتحان نکردم']] as const).map(([answer, label]) => <button type="button" disabled={state.feedback.some(f => f.taskId === taskId && f.barrier === barrier && f.action === action.id && f.answer === answer)} key={answer} onClick={() => void saveFeedback(answer)}>{label}</button>)}</div><small role="status">{feedback}</small></> : <p>بعد از ذخیرهٔ کار می‌توانی بازخورد این راهکار را ثبت کنی.</p>}</div>}</>}
  </div>;
}
export function CapacityView({
  tasks,
  sessions
}: {
  tasks: Task[];
  sessions: FocusSession[];
}) {
  const {
    state,
    change
  } = usePlanning();
  const [kind, setKind] = useState<'availability' | 'commitments'>('availability');
  const [weekday, setWeekday] = useState('6');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');
  const [exclude, setExclude] = useState('');
  const [preview, setPreview] = useState<ScheduleResult | null>(null);
  const [chosen, setChosen] = useState('');
  const [message, setMessage] = useState('');
  const [horizon, setHorizon] = useState(30);
  const [calculating, setCalculating] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);
  const calculate = () => new Promise<ScheduleResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../utils/capacityWorker.ts', import.meta.url), {
        type: 'module'
      });
    } catch {
      reject(Error('این میزبان اجرای محاسبه در پس‌زمینه را پشتیبانی نمی‌کند.'));
      return;
    }
    workerRef.current = worker;
    const timeout = setTimeout(() => {
      cleanup();
      reject(Error('محاسبه بیش از حد طول کشید؛ افق را کوتاه‌تر کن یا دوباره تلاش کن.'));
    }, 20000);
    const cleanup = () => {
      clearTimeout(timeout);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    worker.onmessage = event => {
      cleanup();
      event.data.error ? reject(Error(event.data.error)) : resolve(event.data.result);
    };
    worker.onerror = () => {
      cleanup();
      reject(Error('اجرای محاسبه در پس‌زمینه انجام نشد.'));
    };
    worker.postMessage({
      state,
      tasks: computeTasks,
      now: new Date().toISOString(),
      horizon
    });
  });
  const check = async () => {
    if (calculating) return;
    setCalculating(true);
    setMessage('در حال بررسی ظرفیت…');
    try {
      setPreview(await calculate());
      setMessage('');
    } catch (error) {
      setPreview(null);
      setMessage((error as Error).message);
    } finally {
      setCalculating(false);
    }
  };
  const task = tasks.find(t => t.id === chosen);
  const estimate = task ? estimateDuration(task, tasks, sessions, state.minimumSamples) : null;
  const computeTasks = tasks.map(t => t.id === chosen && estimate?.minutes && t.planning?.remainingMinutes === undefined ? {
    ...t,
    duration: estimate.minutes
  } : t);
  const inputFingerprint = scheduleFingerprint(state, computeTasks);
  const latestFingerprint = useRef(inputFingerprint);
  latestFingerprint.current = inputFingerprint;
  const stale = !!preview && preview.fingerprint !== inputFingerprint;
  const addWindow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (start >= end) {
      setMessage('پایان باید بعد از شروع باشد؛ بازهٔ عبوری از نیمه‌شب را به دو روز تقسیم کن.');
      return;
    }
    if (await change(s => {
      s[kind].push({
        id: uid(),
        ...(date ? {
          date
        } : {
          weekday: Number(weekday)
        }),
        start,
        end
      });
    })) {
      setMessage('بازه ذخیره شد.');
      setPreview(null);
    }
  };
  const apply = async () => {
    if (!preview || preview.status !== 'ready' || stale || calculating) return;
    setCalculating(true);
    try {
      const fresh = await calculate();
      if (fresh.status !== 'ready' || JSON.stringify(fresh.allocations) !== JSON.stringify(preview.allocations)) {
        setPreview(fresh);
        setMessage('زمان یا اطلاعات تغییر کرد؛ پیش‌نمایش تازه را دوباره بررسی کن.');
        return;
      }
      if (latestFingerprint.current !== preview.fingerprint) {
        setMessage('داده‌ها حین محاسبه تغییر کردند؛ دوباره بررسی کن.');
        return;
      }
      if (await change(s => {
        s.previousAllocations = structuredClone(s.allocations);
        s.allocations = structuredClone(preview.allocations);
      })) {
        setPreview(null);
        setMessage('برنامهٔ پیشنهادی ذخیره شد.');
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setCalculating(false);
    }
  };
  const renderSlots = (slots: Allocation[], editable = false) => <div className="kp-table"><table><thead><tr><th>کار</th><th>شروع</th><th>پایان</th>{editable && <th>حفظ بازه</th>}</tr></thead><tbody>{slots.map((a, i) => <tr key={a.taskId + a.start}><td>{tasks.find(t => t.id === a.taskId)?.title ?? 'کار حذف‌شده'}</td><td>{new Date(a.start).toLocaleString('fa-IR')}</td><td>{new Date(a.end).toLocaleString('fa-IR')}</td>{editable && <td><input aria-label={`قفل بازه ${i + 1}`} type="checkbox" checked={!!a.locked} onChange={e => void change(s => {
              s.allocations[i].locked = e.target.checked;
            })} /></td>}</tr>)}</tbody></table></div>;
  return <PlanningShell title="قبل از قول‌دادن"><p>وقت آزاد، تعهد ثابت و مدت باقی‌مانده را وارد کن. ساعت یادآوری، زمان شروع قطعی کار فرض نمی‌شود.</p><form className="kp-card" onSubmit={addWindow}><div className="kp-grid"><Field label="نوع بازه"><select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="availability">وقت آزاد</option><option value="commitments">تعهد ثابت</option></select></Field><Field label="روز هفته"><select disabled={!!date} value={weekday} onChange={e => setWeekday(e.target.value)}>{['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'].map((d, i) => <option key={i} value={i}>{d}</option>)}</select></Field><Field label="تاریخ خاص (جایگزین برنامهٔ هفتگی وقت آزاد)"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field><Field label="شروع"><input required type="time" value={start} onChange={e => setStart(e.target.value)} /></Field><Field label="پایان"><input required type="time" value={end} onChange={e => setEnd(e.target.value)} /></Field></div><button>افزودن بازه</button></form>
    {(['availability', 'commitments'] as const).map(k => <div key={k} className="kp-card"><h3>{k === 'availability' ? 'وقت‌های آزاد' : 'تعهدات ثابت'}</h3>{state[k].map(w => <div className="kp-actions" key={w.id}><span>{w.date ? formatDate(w.date) : ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'][w.weekday!]} · {w.start} تا {w.end}</span><button onClick={() => void change(s => {
          s[k] = s[k].filter(x => x.id !== w.id);
        })}>برداشتن بازه</button></div>)}</div>)}
    <div className="kp-card"><Field label="روز بدون وقت آزاد"><input type="date" value={exclude} onChange={e => setExclude(e.target.value)} /></Field><button disabled={!exclude} onClick={() => void change(s => {
        s.excludedDates = [...new Set([...s.excludedDates, exclude])];
      })}>ثبت روز استثنا</button>{state.excludedDates.map(d => <button key={d} onClick={() => void change(s => {
        s.excludedDates = s.excludedDates.filter(x => x !== d);
      })}>{formatDate(d)} ×</button>)}<Field label="استراحت بین کارها (دقیقه)"><input type="number" min="0" max="120" value={state.breakMinutes} onChange={e => void change(s => {
          s.breakMinutes = Number(e.target.value);
        })} /></Field></div>
    <div className="kp-card"><h3>برای چه زمانی قول تحویل بدهم؟</h3><Field label="کار برای تخمین"><select value={chosen} onChange={e => {
          setChosen(e.target.value);
          setPreview(null);
        }}><option value="">انتخاب کار</option>{tasks.filter(t => !t.completed && t.status !== 'archived').map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field><Field label="حداقل نمونهٔ مرتبط"><input type="number" min="3" max="50" value={state.minimumSamples} onChange={e => void change(s => {
          s.minimumSamples = Number(e.target.value);
        })} /></Field>{estimate && <><p>{estimate.source === 'history' ? 'میانهٔ سابقهٔ مرتبط' : 'سابقهٔ کافی نداریم؛ تخمین دستی کاربر'}: {estimate.minutes ?? 'نامعلوم'} دقیقه · {estimate.count} نمونه</p>{estimate.range && <p>دامنهٔ تاریخی نمونه‌ها: {estimate.range[0].toFixed(1)} تا {estimate.range[1].toFixed(1)} دقیقه؛ این بازهٔ اطمینان آماری نیست.</p>}{estimate.excluded.map(e => <p key={e.id}>{tasks.find(t => t.id === e.id)?.title}: {e.reason}</p>)}<button disabled={estimate.source !== 'history'} onClick={() => void change(s => {
          s.predictions.push({
            id: uid(),
            taskId: chosen,
            at: new Date().toISOString(),
            minutes: estimate.minutes!,
            manual: task?.planning?.initialEstimate ?? task?.duration ?? null,
            sampleIds: estimate.sampleIds
          });
        })}>ثبت تخمین برای ارزیابی بعدی</button></>}
    </div><Field label="افق برنامه‌ریزی (روز)"><input type="number" min="1" max="90" value={horizon} onChange={e => {
        setHorizon(Number(e.target.value));
        setPreview(null);
      }} /></Field><button disabled={calculating} onClick={() => void check()}>{calculating ? "در حال محاسبه…" : "بررسی ظرفیت و پیش‌نمایش"}</button>
    {preview && <div className="kp-card"><h3>نتیجهٔ بررسی</h3>{preview.messages.map(m => <p key={m}>{m}</p>)}<p>ظرفیت آزاد قابل استفاده: {Math.round(preview.freeMinutes)} دقیقه · بررسی {preview.attempts} ترتیب</p>{stale && <p role="alert">داده‌ها تغییر کرده‌اند؛ دوباره محاسبه کن.</p>}{preview.status === 'ready' && <>{renderSlots(preview.allocations)}<p>{state.allocations.filter(a => !preview.allocations.some(b => a.taskId === b.taskId && a.start === b.start && a.end === b.end)).length} بازهٔ قبلی برداشته یا جابه‌جا می‌شود و {preview.allocations.filter(a => !state.allocations.some(b => a.taskId === b.taskId && a.start === b.start && a.end === b.end)).length} بازهٔ تازه اضافه می‌شود.</p><p>بازه‌های قفل‌شده حفظ می‌شوند؛ سایر کارها با توجه به موعد و اولویت در وقت آزاد جای می‌گیرند.</p>{chosen && <p>پایان پیشنهادی کار انتخابی: {preview.allocations.filter(a => a.taskId === chosen).at(-1)?.end ? new Date(preview.allocations.filter(a => a.taskId === chosen).at(-1)!.end).toLocaleString('fa-IR') : 'بازه‌ای اختصاص نیافت'}</p>}<button disabled={stale || calculating} onClick={() => void apply()}>تأیید و اعمال برنامه</button></>}</div>}
    {!!state.allocations.length && <div className="kp-card"><h3>برنامهٔ تأییدشده</h3>{renderSlots(state.allocations, true)}{state.previousAllocations && <button onClick={() => void change(s => {
        s.allocations = s.previousAllocations!;
        s.previousAllocations = undefined;
      })}>بازگرداندن برنامهٔ قبلی</button>}</div>}<p role="status">{message}</p>
    <div className="kp-card"><h3>ارزیابی تخمین‌های ثبت‌شده</h3>{state.predictions.length === 0 ? <p>هنوز قابل ارزیابی نیست؛ ابتدا تخمین ثبت کن و پس از اتمام کار زمان واقعی را تأیید کن.</p> : state.predictions.map(p => {
        const t = tasks.find(t => t.id === p.taskId);
        const actual = t?.completed && t.completedAt && Date.parse(t.completedAt) > Date.parse(p.at) && t.planning?.actualConfirmed ? t.planning.actualMinutes : undefined;
        return <p key={p.id}>{t?.title ?? 'کار در دسترس نیست'}: {actual === undefined ? 'منتظر زمان واقعی معتبر پس از پیش‌بینی' : `خطای تخمین ${Math.abs(actual - p.minutes).toFixed(1)} دقیقه؛ کم‌برآوردی ${Math.max(0, actual - p.minutes).toFixed(1)} دقیقه؛ خطای تخمین دستی ${p.manual === null ? 'نامعلوم' : Math.abs(actual - p.manual).toFixed(1)}`}</p>;
      })}</div>
  </PlanningShell>;
}
export function CustomizeView({
  onNavigate
}: {
  onNavigate: (tab: NavTabId) => void;
}) {
  const {
    state,
    change
  } = usePlanning();
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [clear, setClear] = useState(false);
  const layout = state.layout[mode];
  const ids = [...new Set([...layout.order, ...Object.keys(NAV_LABELS)])].filter(id => id in NAV_LABELS);
  return <PlanningShell title="همهٔ ابزارها و چیدمان"><Field label="چیدمان دستگاه"><select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="desktop">ویندوز و صفحهٔ بزرگ</option><option value="mobile">موبایل</option></select></Field><p>مخفی‌کردن فقط منو را تغییر می‌دهد. همهٔ ابزارها از این صفحه همیشه باز می‌شوند.</p>{ids.map((id, i) => <div className="kp-card kp-actions" key={id}><button onClick={() => onNavigate(id as NavTabId)}>{NAV_LABELS[id]}</button><button aria-label={`${NAV_LABELS[id]} بالاتر`} disabled={i === 0} onClick={() => void change(s => {
        const order = [...ids];
        [order[i - 1], order[i]] = [order[i], order[i - 1]];
        s.layout[mode].order = order;
      })}>↑</button><button aria-label={`${NAV_LABELS[id]} پایین‌تر`} disabled={i === ids.length - 1} onClick={() => void change(s => {
        const order = [...ids];
        [order[i], order[i + 1]] = [order[i + 1], order[i]];
        s.layout[mode].order = order;
      })}>↓</button>{id !== 'customize' && <><label><input type="checkbox" checked={layout.pinned.includes(id)} onChange={e => void change(s => {
            s.layout[mode].pinned = e.target.checked ? [...layout.pinned, id] : layout.pinned.filter(x => x !== id);
            s.layout[mode].hidden = layout.hidden.filter(x => x !== id);
          })} /> سنجاق</label><label><input type="checkbox" checked={layout.hidden.includes(id)} onChange={e => void change(s => {
            s.layout[mode].hidden = e.target.checked ? [...layout.hidden, id] : layout.hidden.filter(x => x !== id);
            s.layout[mode].pinned = layout.pinned.filter(x => x !== id);
          })} /> مخفی</label></>}</div>)}<button onClick={() => void change(s => {
      s.layout[mode] = {
        order: [],
        hidden: [],
        pinned: []
      };
    })}>بازگرداندن چیدمان اولیه</button><div className="kp-card"><h3>بازخورد کمک‌یار</h3><p>بازخوردها فقط روی همین دستگاه و در پشتیبان شما نگهداری می‌شوند.</p>{Object.entries(barrierLabels).map(([key, label]) => {
        const f = state.feedback.filter(f => f.barrier === key && f.answer !== 'untried');
        return <p key={key}>{label}: {f.filter(x => x.answer === 'helped').length} پاسخ «کمک کرد» از {f.length} بازخورد معتبر</p>;
      })}<button onClick={() => setClear(true)}>پاک‌کردن سابقهٔ شخصی‌سازی</button>{clear && <><button onClick={async () => {
          if (await change(s => {
            s.feedback = [];
          })) setClear(false);
        }}>تأیید پاک‌کردن سابقه</button><button onClick={() => setClear(false)}>انصراف</button></>}</div></PlanningShell>;
}
