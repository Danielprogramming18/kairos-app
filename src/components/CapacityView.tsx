import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {Task,FocusSession} from '../types';
import {usePlanning} from '../app/PlanningContext';
import {createEntityId} from '../domain/models';
import {Allocation,localDate} from '../domain/planning';
import {estimateDuration,ScheduleResult,scheduleFingerprint} from '../utils/planningEngine';
import {Field,PlanningShell} from './PlanningShared';
import {domainEntityToTask,domainEntityToFocusSession,usePlatform} from '../app/PlatformContext';
import {runCapacityCalculation,runCapacityConfirmation} from '../utils/capacityClient';
import {validateScheduleAllocations} from '../utils/planningEngine';
import {editableSchedule,replacePendingSchedule,taskRevisionSnapshot} from '../utils/scheduleView';
import {ScheduleBoard} from './ScheduleBoard';
const uid=()=>createEntityId('plan');
const formatDate=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('fa-IR');
export function CapacityView({
  tasks,
  sessions,
  onReload
}: {
  tasks: Task[];
  sessions: FocusSession[];
  onReload?:()=>Promise<void>;
}) {
  const {
    state,
    change, refresh
  } = usePlanning();
  const {container}=usePlatform();
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
  const controllerRef=useRef<AbortController|null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controllerRef.current?.abort(); };
  }, []);
  const calculate=()=>{controllerRef.current?.abort();const controller=new AbortController();controllerRef.current=controller;return runCapacityCalculation(state,computeTasks,{now:new Date(),horizon,signal:controller.signal});};
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
  const estimate = useMemo(() => task ? estimateDuration(task, tasks, sessions, state.minimumSamples) : null, [task, tasks, sessions, state.minimumSamples]);
  const computeTasks = tasks.map(t => t.id === chosen && estimate?.minutes && t.planning?.remainingMinutes === undefined ? {
    ...t,
    duration: estimate.minutes
  } : t);
  const inputFingerprint = scheduleFingerprint(state, computeTasks);
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
  const readCapacityInputs = async () => {
    const [fresh, entities, history] = await Promise.all([
      container.planning.getPlanning(), container.tasks.listTasks(), container.focus.listFocusSessions(),
    ]);
    const freshTasks = entities.map(domainEntityToTask);
    const target = freshTasks.find(t => t.id === chosen);
    const prediction = target ? estimateDuration(target, freshTasks, history.map(domainEntityToFocusSession), fresh.minimumSamples) : null;
    const inputs = freshTasks.map(t => t.id === chosen && prediction?.minutes && t.planning?.remainingMinutes === undefined
      ? {...t, duration: prediction.minutes} : t);
    return {fresh, freshTasks, inputs};
  };
  const apply = async () => {
    if(!preview||preview.status!=='ready'||calculating)return;
    setCalculating(true);setMessage('');
    let attemptedSave = false;
    try {
      const {fresh, freshTasks, inputs} = await readCapacityInputs();
      if (!mounted.current) return;
      const controller=new AbortController();controllerRef.current?.abort();controllerRef.current=controller;
      const confirmationTime = new Date();
      const confirmation=await runCapacityConfirmation(fresh,inputs,preview,confirmationTime,controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if(confirmation.status==='refresh') {setPreview(confirmation.result);setMessage(confirmation.reason);await refresh();await onReload?.();return;}
      attemptedSave = true;
      await container.planning.savePlanning({...fresh,revision:fresh.revision+1,previousAllocations:structuredClone(fresh.allocations),allocations:replacePendingSchedule(fresh.allocations, confirmation.result.allocations, freshTasks, confirmationTime.getTime())},{expectedRevision:fresh.revision,expectedTaskRevisions:taskRevisionSnapshot(freshTasks)});
      attemptedSave = false;
      await refresh();setPreview(null);setMessage(confirmation.adjusted?confirmation.reason+' برنامه ذخیره شد.':'برنامهٔ تأییدشده ذخیره شد.');
    } catch(error) {
      if (!mounted.current) return;
      setMessage((error as Error).message);
      // A transaction can reject a write after Worker validation, e.g. a second tab editing a task.
      if (attemptedSave) {
        try {
          const {fresh, inputs} = await readCapacityInputs();
          if (mounted.current && scheduleFingerprint(fresh, inputs) !== preview.fingerprint) {
            const updated = await runCapacityConfirmation(fresh, inputs, preview, new Date(), controllerRef.current?.signal);
            if (mounted.current) { setPreview(updated.result); setMessage(updated.reason); }
          }
        } catch { /* Keep the original storage error if the new snapshot is also unavailable. */ }
      }
      await refresh(); await onReload?.();
    }
    finally {setCalculating(false);}
  };
  const undo = async () => {
    if (calculating) return;
    setCalculating(true);
    try {
      const [fresh, entities] = await Promise.all([container.planning.getPlanning(), container.tasks.listTasks()]);
      if (!mounted.current || !fresh.previousAllocations) return;
      const freshTasks = entities.map(domainEntityToTask);
      const now = new Date();
      const previous = editableSchedule(fresh.previousAllocations, freshTasks, now.getTime());
      const validation = validateScheduleAllocations(fresh, freshTasks, previous, now, {preserveLocked: true});
      if (!validation.valid) throw Error('برنامهٔ قبلی اکنون قابل اجرا نیست. ' + validation.messages.join(' '));
      await container.planning.savePlanning({
        ...fresh, revision: fresh.revision + 1, previousAllocations: undefined,
        allocations: replacePendingSchedule(fresh.allocations, previous, freshTasks, now.getTime()),
      }, {expectedRevision: fresh.revision, expectedTaskRevisions: taskRevisionSnapshot(freshTasks)});
      await refresh();
      setMessage('بازه‌های قابل اجرای برنامهٔ قبلی بازگردانده شدند. سابقهٔ روزهای گذشته حفظ شد.');
    } catch (error) {setMessage((error as Error).message);}
    finally {setCalculating(false);}
  };
  const renderSlots = (slots: Allocation[]) => <div className="kp-table"><table>
    <thead><tr><th>کار</th><th>شروع</th><th>پایان</th></tr></thead>
    <tbody>{slots.map(a => <tr key={a.taskId + a.start}>
      <td>{tasks.find(t => t.id === a.taskId)?.title ?? 'کار حذف‌شده'}</td>
      <td>{new Date(a.start).toLocaleString('fa-IR')}</td><td>{new Date(a.end).toLocaleString('fa-IR')}</td>
    </tr>)}</tbody>
  </table></div>;
  const editable = preview ? editableSchedule(state.allocations, tasks, Date.parse(preview.baseTime)) : [];
  return <PlanningShell title="قبل از قول‌دادن" disabled={calculating}><p>وقت آزاد، تعهد ثابت و مدت باقی‌مانده را وارد کن. ساعت یادآوری، زمان شروع قطعی کار فرض نمی‌شود.</p><form className="kp-card" onSubmit={addWindow}><div className="kp-grid"><Field label="نوع بازه"><select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="availability">وقت آزاد</option><option value="commitments">تعهد ثابت</option></select></Field><Field label="روز هفته"><select disabled={!!date} value={weekday} onChange={e => setWeekday(e.target.value)}>{['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'].map((d, i) => <option key={i} value={i}>{d}</option>)}</select></Field><Field label="تاریخ خاص (جایگزین برنامهٔ هفتگی وقت آزاد)"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field><Field label="شروع"><input required type="time" value={start} onChange={e => setStart(e.target.value)} /></Field><Field label="پایان"><input required type="time" value={end} onChange={e => setEnd(e.target.value)} /></Field></div><button>افزودن بازه</button></form>
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
        })} /></Field>{estimate && <><p>{estimate.basisReason}</p><p>{estimate.source === 'history' ? 'میانهٔ سابقهٔ قابل‌مقایسه' : estimate.source === 'manual' ? 'مدت انتخاب‌شدهٔ کار' : 'مدت تنظیم‌شده / پیش‌فرض'}: {estimate.minutes ?? 'نامعلوم'} دقیقه · {estimate.count} نمونه</p>{estimate.range && <p>دامنهٔ تاریخی نمونه‌ها: {estimate.range[0].toFixed(1)} تا {estimate.range[1].toFixed(1)} دقیقه؛ این بازهٔ اطمینان آماری نیست.</p>}<details><summary>نمونه‌ها و دلیل استفاده یا کنارگذاشتن</summary>{estimate.sampleReasons.slice(0,200).map(e=><p key={e.id}>{tasks.find(t=>t.id===e.id)?.title}: {e.reason}</p>)}{estimate.excluded.slice(0,200).map(e => <p key={e.id}>{tasks.find(t => t.id === e.id)?.title}: {e.reason}</p>)}{estimate.excluded.length>200&&<small>دلیل ۲۰۰ نمونهٔ اول نمایش داده شد؛ {estimate.excluded.length.toLocaleString('fa-IR')} نمونه کنار گذاشته شده است.</small>}</details><button disabled={estimate.source !== 'history'} onClick={() => void change(s => {
          s.predictions.push({
            id: uid(),
            taskId: chosen,
            at: new Date().toISOString(),
            minutes: estimate.minutes!,
            manual: task?.planning?.initialEstimate ? task.duration : null,
            sampleIds: estimate.sampleIds
          });
        })}>ثبت تخمین برای ارزیابی بعدی</button></>}
    </div><Field label="افق برنامه‌ریزی (روز)"><input type="number" min="1" max="90" value={horizon} onChange={e => {
        setHorizon(Number(e.target.value));
        setPreview(null);
      }} /></Field><button disabled={calculating} onClick={() => void check()}>{calculating ? "در حال محاسبه…" : "بررسی ظرفیت و پیش‌نمایش"}</button>
    {preview && <div className="kp-card"><h3>پیش‌نمایش برنامه</h3><p>زمان مبنا: {new Date(preview.baseTime).toLocaleString('fa-IR')} · {preview.timezone}</p>{preview.messages.map(m => <p key={m}>{m}</p>)}<p>ظرفیت آزاد پس از بازه‌های قفل‌شده: {Math.round(preview.freeMinutes)} دقیقه · بررسی {preview.attempts} ترتیب</p>{stale && <p role="alert">داده‌ها تغییر کرده‌اند؛ دوباره محاسبه کن.</p>}{preview.status === 'ready' && <>{renderSlots(preview.allocations)}<p>{editable.filter(a => !preview.allocations.some(b => a.taskId === b.taskId && a.start === b.start && a.end === b.end)).length} بازهٔ قبلی برداشته یا جابه‌جا می‌شود و {preview.allocations.filter(a => !state.allocations.some(b => a.taskId === b.taskId && a.start === b.start && a.end === b.end)).length} بازهٔ تازه اضافه می‌شود.</p><p>بازه‌های قفل‌شده حفظ می‌شوند؛ سایر کارها با توجه به موعد و اولویت در وقت آزاد جای می‌گیرند.</p>{chosen && <p>پایان پیشنهادی کار انتخابی: {preview.allocations.filter(a => a.taskId === chosen).at(-1)?.end ? new Date(preview.allocations.filter(a => a.taskId === chosen).at(-1)!.end).toLocaleString('fa-IR') : 'بازه‌ای اختصاص نیافت'}</p>}<button disabled={calculating} onClick={() => void apply()}>تأیید و اعمال برنامه</button></>}</div>}
    <ScheduleBoard tasks={tasks}/>{state.previousAllocations&&<button disabled={calculating} onClick={()=>void undo()}>بازگرداندن برنامهٔ قبلی</button>}<p role="status">{message}</p>
    <div className="kp-card"><h3>ارزیابی تخمین‌های ثبت‌شده</h3>{state.predictions.length === 0 ? <p>هنوز قابل ارزیابی نیست؛ ابتدا تخمین ثبت کن و پس از اتمام کار زمان واقعی را تأیید کن.</p> : state.predictions.map(p => {
        const t = tasks.find(t => t.id === p.taskId);
        const actual = t?.completed && t.completedAt && Date.parse(t.completedAt) > Date.parse(p.at) && t.planning?.actualConfirmed ? t.planning.actualMinutes : undefined;
        return <p key={p.id}>{t?.title ?? 'کار در دسترس نیست'}: {actual === undefined ? 'منتظر زمان واقعی معتبر پس از پیش‌بینی' : `خطای تخمین ${Math.abs(actual - p.minutes).toFixed(1)} دقیقه؛ کم‌برآوردی ${Math.max(0, actual - p.minutes).toFixed(1)} دقیقه؛ خطای تخمین دستی ${p.manual === null ? 'نامعلوم' : Math.abs(actual - p.manual).toFixed(1)}`}</p>;
      })}</div>
  </PlanningShell>;
}
