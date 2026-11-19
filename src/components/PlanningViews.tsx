import React,{useState} from 'react';
import {usePlanning} from '../app/PlanningContext';
import {createEntityId} from '../domain/models';
import {localDate,Metric,parseNumber,PlanningEvent} from '../domain/planning';
import {eventCountdown,metricSummary} from '../utils/planningEngine';
import {Field,PlanningShell,useClock} from './PlanningShared';
import './planning.css';
export {Field,PlanningShell} from './PlanningShared';
export {ProjectsView} from './ProjectsView';
export {TaskPlanningFields} from './TaskPlanningFields';
export {CapacityView} from './CapacityView';
const uid=()=>createEntityId('plan');
const today=()=>localDate(new Date());
const formatDate=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('fa-IR');
const blankEvent=():PlanningEvent=>({id:uid(),title:'',date:today(),time:''});
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
