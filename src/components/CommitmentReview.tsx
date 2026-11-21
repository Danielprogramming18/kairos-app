import React, {useEffect, useRef, useState} from 'react';
import type {Task, FocusSession} from '../types';
import {createEntityId} from '../domain/models';
import type {Allocation, PlanningState} from '../domain/planning';
import {usePlanning} from '../app/PlanningContext';
import {domainEntityToTask, domainEntityToFocusSession, taskToDomainEntity, usePlatform} from '../app/PlatformContext';
import {commitmentInputs, hypotheticalTask, basisLabels, type ScenarioDraft} from '../utils/commitmentReview';
import {runCapacityCalculation, runCapacityConfirmation} from '../utils/capacityClient';
import {estimateDuration, scheduleFingerprint, withConfirmedScheduleDurations, type ScheduleResult} from '../utils/planningEngine';
import {editableSchedule, replacePendingSchedule, taskRevisionSnapshot} from '../utils/scheduleView';
import {Field} from './PlanningShared';

const newDraft = (): ScenarioDraft => ({id:createEntityId('task'),title:'',minutes:'',workType:'',due:'',projectId:'',splittable:false});
type Snapshot = {state:PlanningState; tasks:Task[]; sessions:FocusSession[]};
type Scope = ReturnType<typeof commitmentInputs>;
type Review = {result:ScheduleResult; baseline?:ScheduleResult; scope:Scope; source:Snapshot; target?:Task};
const displayTime = (s:string) => new Date(s).toLocaleString('fa-IR');
const basisKey = (scope:Scope) => JSON.stringify(scope.rows.map(({task,basis,minutes})=>[task.id,basis,minutes]).sort());
const revisionKey = (tasks:Task[]) => JSON.stringify(Object.entries(taskRevisionSnapshot(tasks)).sort());
function periods(slots:Allocation[], id:string) {
  return slots.filter(a=>a.taskId===id).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))
    .map(a=>displayTime(a.start)+' تا '+displayTime(a.end)).join('، ') || 'بدون بازه';
}

export function CommitmentReview({tasks,sessions,timerMinutes,onReload}:{
  tasks:Task[];sessions:FocusSession[];timerMinutes:number;onReload?:()=>Promise<void>;
}) {
  const {state,change,refresh} = usePlanning();
  const {container} = usePlatform();
  const [scenario,setScenario] = useState(false);
  const [draft,setDraft] = useState(newDraft);
  const [chosen,setChosen] = useState('');
  const [extra,setExtra] = useState<string[]>([]);
  const [horizon,setHorizon] = useState(30);
  const [review,setReview] = useState<Review|null>(null);
  const [assumed,setAssumed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const ongoing = useRef<AbortController|null>(null);
  useEffect(()=>()=>ongoing.current?.abort(),[]);
  const clear = () => {setReview(null); setAssumed(false); setMessage('');};
  const updateDraft = (patch:Partial<ScenarioDraft>) => {setDraft({...draft,...patch}); clear();};
  const selected = tasks.find(t=>t.id===chosen);
  const estimate = !scenario && selected ? estimateDuration(selected,tasks,sessions,state.minimumSamples) : null;
  async function read():Promise<Snapshot> {
    const [fresh,entities,history] = await Promise.all([container.planning.getPlanning(),container.tasks.listTasks(),container.focus.listFocusSessions()]);
    return {state:fresh,tasks:entities.map(domainEntityToTask),sessions:history.map(domainEntityToFocusSession)};
  }
  function prepare(source:Snapshot, now:Date) {
    const target = scenario ? hypotheticalTask(draft,timerMinutes,now) : source.tasks.find(t=>t.id===chosen);
    if (!scenario && chosen && (!target || target.completed || target.deletedAt || target.status==='archived')) throw Error('کار انتخابی دیگر فعال نیست. کار دیگری انتخاب کن.');
    if (scenario && target?.projectId && !source.state.projects.some(p=>p.id===target.projectId && !p.archived)) throw Error('پروژهٔ انتخابی دیگر فعال نیست.');
    return {target,scope:commitmentInputs(source.state,source.tasks,source.sessions,target,scenario,extra,now)};
  }
  async function calculate(source:Snapshot, now:Date, signal:AbortSignal, proposed?:ScheduleResult) {
    const {target,scope} = prepare(source,now);
    const options = {now,horizon,signal};
    const result = proposed ?? await runCapacityCalculation(scope.calendar,scope.inputs,options);
    const baseline = scenario ? await runCapacityCalculation(scope.calendar,scope.inputs.filter(t=>t.id!==target!.id),options) : undefined;
    if (!signal.aborted) {setReview({result,baseline,source,scope,target}); setAssumed(false);}
  }
  async function operate(action:(signal:AbortSignal)=>Promise<void>) {
    if (ongoing.current) return;
    const ctl = new AbortController(); ongoing.current=ctl;
    setBusy(true);setMessage('');
    try { await action(ctl.signal); }
    catch (e) {if (!ctl.signal.aborted) setMessage((e as Error).message);}
    finally {ongoing.current=null;if (!ctl.signal.aborted) setBusy(false);}
  }
  function check() {
    void operate(async signal=>{clear();await calculate(await read(),new Date(),signal);});
  }
  function save(withSchedule:boolean) {
    if (!review) return;
    void operate(async signal=>{
      const source=await read(), now=new Date();
      if (signal.aborted) return;
      const {scope,target}=prepare(source,now);
      const changed = revisionKey(source.tasks)!==revisionKey(review.source.tasks) ||
        basisKey(scope)!==basisKey(review.scope) || scheduleFingerprint(scope.calendar,scope.inputs)!==review.result.fingerprint;
      if (changed) {
        await calculate(source,now,signal);
        setMessage('کارها، مبنای مدت یا ظرفیت تغییر کرده‌اند. پیش‌نمایش تازه را بررسی و دوباره تأیید کن.');
        await refresh();await onReload?.();return;
      }
      const row = scope.rows.find(r=>r.task.id===target?.id);
      const newTask = scenario && target && row ? taskToDomainEntity({...target,duration:row.minutes,
        planning:{...target.planning,durationSource:row.basis==='history'?'history':row.basis==='timer'?'timer':undefined}}) : undefined;
      if (!withSchedule && newTask) {
        await container.tasks.upsertTask(newTask,{expectedRevision:0});
      } else {
        if (review.result.status!=='ready' || (scope.assumptions.length && !assumed)) return;
        const confirmed=await runCapacityConfirmation(scope.calendar,scope.inputs,review.result,now,signal);
        if (signal.aborted) return;
        if (confirmed.status==='refresh' || (scenario && confirmed.adjusted)) {
          await calculate(source,now,signal,confirmed.result);setMessage(confirmed.reason+' پیش‌نمایش تازه را تأیید کن.');return;
        }
        const origins = new Map(scope.rows.map(r=>[r.task.id,r.previousBasis ?? r.basis]));
        const approved = confirmed.result.allocations.map(a=>({...a,
          durationBasis:origins.get(a.taskId) as Allocation['durationBasis']}));
        try {
          await container.planning.savePlanning({...source.state,revision:source.state.revision+1,
            allocations:replacePendingSchedule(source.state.allocations,approved,scope.inputs,now.getTime()),
            previousAllocations:withConfirmedScheduleDurations(source.state.allocations,now)},
            {expectedRevision:source.state.revision,expectedTaskRevisions:taskRevisionSnapshot(source.tasks),createTask:newTask});
        } catch (e) {
          await calculate(await read(),new Date(),signal);
          throw Error((e as Error).message+' پیش‌نمایش به‌روز شد؛ ذخیره را بررسی کن.');
        }
      }
      clear();if (scenario) {setDraft(newDraft());setScenario(false);setChosen(newTask!.id);}
      setMessage(withSchedule?'برنامهٔ تأییدشده ذخیره شد.':'کار ثبت شد. زمان‌بندی قبلی حفظ شد.');
      await refresh();await onReload?.();
    });
  }
  const result=review?.result;
  const waiting=tasks.filter(t=>t.planning?.waiting && !t.deletedAt && !t.completed && t.status!=='archived');
  const currentSlots=review ? editableSchedule(review.source.state.allocations,review.source.tasks,Date.parse(review.result.baseTime)) : [];
  return <fieldset disabled={busy} className="kp-card">
    <h3>برای چه زمانی قول تحویل بدهم؟</h3>
    <div className="kp-actions">{[false,true].map(mode=><button key={String(mode)} aria-pressed={scenario===mode} onClick={()=>{setScenario(mode);clear();}}>{mode?'اگر این کار را قبول کنم؟':'بررسی کارهای ثبت‌شده'}</button>)}</div>
    {scenario ? <>
      <Field label="عنوان کار فرضی"><input maxLength={500} value={draft.title} onChange={e=>updateDraft({title:e.target.value})}/></Field>
      <Field label="مدت دستی (دقیقه)"><input type="number" min="1" max="100000" value={draft.minutes} onChange={e=>updateDraft({minutes:e.target.value})}/></Field>
      <Field label="نوع کار برای یافتن سابقهٔ مشابه"><input value={draft.workType} onChange={e=>updateDraft({workType:e.target.value})}/></Field>
      <p>با خالی گذاشتن مدت، سابقهٔ همین نوع کار بررسی می‌شود. پیش‌فرض فعلی تایمر {timerMinutes} دقیقه است.</p>
      <Field label="موعد کار فرضی"><input type="datetime-local" value={draft.due} onChange={e=>updateDraft({due:e.target.value})}/></Field>
      <Field label="پروژهٔ کار فرضی"><select value={draft.projectId} onChange={e=>updateDraft({projectId:e.target.value})}><option value="">بدون پروژه</option>{state.projects.filter(p=>!p.archived).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
      <label><input type="checkbox" checked={draft.splittable} onChange={e=>updateDraft({splittable:e.target.checked})}/> قابل تقسیم به چند جلسه (حداقل هر بخش ۱۵ دقیقه)</label>
    </> : <>
      <Field label="کار برای تخمین"><select value={chosen} onChange={e=>{setChosen(e.target.value);clear();}}><option value="">انتخاب کار</option>{tasks.filter(t=>!t.deletedAt && !t.completed && t.status!=='archived').map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
      {estimate && <><p>{estimate.basisReason} · {estimate.minutes} دقیقه · {estimate.count} نمونه</p>
        {estimate.range && <p>دامنهٔ تاریخی نمونه‌ها: {estimate.range.join(' تا ')} دقیقه</p>}
        <details><summary>نمونه‌ها و دلیل استفاده یا کنارگذاشتن</summary>{[...estimate.sampleReasons,...estimate.excluded].slice(0,200).map(r=><p key={r.id}>{tasks.find(t=>t.id===r.id)?.title} · {r.reason}</p>)}</details>
        <button disabled={estimate.source!=='history'} onClick={()=>void change(s=>{s.predictions.push({id:createEntityId('plan'),taskId:chosen,at:new Date().toISOString(),minutes:estimate.minutes!,manual:selected?.planning?.initialEstimate?selected.duration:null,sampleIds:estimate.sampleIds});})}>ثبت تخمین برای ارزیابی بعدی</button></>}
    </>}
    {!scenario && <Field label="حداقل نمونهٔ مرتبط"><input type="number" min="3" max="50" value={state.minimumSamples} onChange={e=>void change(s=>{s.minimumSamples=Number(e.target.value);})}/></Field>}
    <Field label="افق برنامه‌ریزی (روز)"><input type="number" min="1" max="90" value={horizon} onChange={e=>{setHorizon(Math.min(90,Math.max(1,Number(e.target.value))));clear();}}/></Field>
    {!!waiting.length && <details><summary>دامنهٔ کارهای در انتظار</summary><p>کار انتخابی و کارهای همان پروژه خودکار لحاظ می‌شوند. زمان‌های قبلاً رزروشده حتی برای کار خارج از دامنه اشغال می‌مانند. سایر کارهای در انتظار را می‌توانی به بررسی اضافه کنی.</p>{waiting.map(t=>{
      const required=(!scenario && t.id===chosen) || !!t.projectId && t.projectId===(scenario?draft.projectId:selected?.projectId);
      return <label key={t.id}><input type="checkbox" disabled={required} checked={required || extra.includes(t.id)}
        onChange={e=>{setExtra(e.target.checked?[...extra,t.id]:extra.filter(id=>id!==t.id));clear();}}/> {t.title}{required?' (تعهد همین بررسی)':''} </label>;
    })}</details>}
    <div className="kp-actions"><button onClick={check}>{busy?'در حال بررسی…':'بررسی ظرفیت و پیش‌نمایش'}</button>{(review||scenario) && <button onClick={()=>{clear();setScenario(false);setDraft(newDraft());}}>لغو پیش‌نمایش</button>}</div>
    {review && result && <section aria-label="نتیجهٔ بررسی"><h3>پیش‌نمایش برنامه</h3>
      <p>زمان مبنا: {displayTime(result.baseTime)} · {result.timezone}</p>
      <h4>تعهدهای لحاظ‌شده</h4>{review.scope.rows.map(r=><p key={r.task.id}>{r.task.title} · {r.minutes} دقیقه · {basisLabels[r.basis]}{r.previousBasis && r.previousBasis!=='approved' && ' ('+basisLabels[r.previousBasis]+')'}{r.task.planning?.waiting?' · در انتظار':''}</p>)}
      {review.source.state.commitments.map(w=><p key={w.id}>تعهد ثابت · {w.date ?? ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'][w.weekday!]} · {w.start} تا {w.end}</p>)}
      {currentSlots.filter(a=>a.locked).map(a=><p key={a.taskId+a.start}>بازهٔ قفل‌شده · {review.source.tasks.find(t=>t.id===a.taskId)?.title} · {displayTime(a.start)} تا {displayTime(a.end)}</p>)}
      {review.scope.omitted.map(t=><p key={t.id}>فعلاً لحاظ نشده: {t.title} · در انتظار و خارج از دامنهٔ این بررسی{review.scope.calendar.reservedOutsideScope.some(a=>a.taskId===t.id) && (' · زمان رزروشده حفظ شد: '+periods(currentSlots,t.id))}</p>)}
      {review.scope.assumptions.length>0 && <p>سناریوی فرضی با پیش‌فرض تایمر برای {review.scope.assumptions.map(r=>r.task.title).join('، ')}</p>}
      {review.baseline && <p>بدون کار فرضی: {review.baseline.status==='ready'?'تعهدهای فعلی جا می‌شوند.':review.baseline.messages.join(' ')}</p>}
      {result.messages.map(m=><p key={m}>{m}</p>)}
      {result.status==='no_plan' && <p>با ظرفیت، موعدها، قفل‌ها و طول جلسه‌های انتخاب‌شده، همهٔ تعهدها تا موعد جا نشدند.</p>}
      {review.baseline && <div><h4>اثر روی کارهای قبلی</h4>{review.scope.rows.filter(r=>r.task.id!==review.target?.id).map(({task})=>{
        const before=periods(review.baseline!.allocations,task.id), after=periods(result.allocations,task.id);
        return <p key={task.id}>{task.title} · ثبت‌شده: {periods(currentSlots,task.id)} · بدون کار فرضی: {before} ·
          {result.status!=='ready'?' با این تعهد، برنامهٔ قابل تأییدی پیدا نشد.':before===after?' زمان پیشنهادی تغییری نمی‌کند.':' با قبول کار: '+after}</p>;
      })}</div>}
      {result.status==='ready' && <>
        <p>ظرفیت آزاد پس از تعهدهای ثابت و قفل‌ها: {Math.round(result.freeMinutes)} دقیقه</p>
        {review.target && result.allocations.some(a=>a.taskId===review.target!.id) && <p>پایان پیشنهادی: {displayTime(result.allocations.filter(a=>a.taskId===review.target!.id).at(-1)!.end)}</p>}
        {review.scope.rows.map(({task})=><div key={task.id}><strong>{task.title}</strong>
          <p>بازهٔ پیشنهادی: {periods(result.allocations,task.id)}</p></div>)}
        {!!review.scope.assumptions.length && <label><input type="checkbox" checked={assumed} onChange={e=>setAssumed(e.target.checked)}/> این مدت‌های فرضی را برای زمان‌بندی تعهد تأیید می‌کنم.</label>}
        <button disabled={!!review.scope.assumptions.length && !assumed} onClick={()=>save(true)}>{scenario?'ثبت کار و اعمال همین برنامه':'تأیید و اعمال برنامه'}</button>
      </>}
      {scenario && <button onClick={()=>save(false)}>فقط ثبت کار بدون زمان‌بندی</button>}
    </section>}
    <p role="status">{message}</p>
  </fieldset>;
}
