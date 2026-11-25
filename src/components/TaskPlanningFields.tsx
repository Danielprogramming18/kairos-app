import React, {useEffect,useMemo,useState} from 'react';
import type {FocusSession} from '../types';
import {usePlanning} from '../app/PlanningContext';
import {createEntityId} from '../domain/models';
import {Barrier,TaskPlanning} from '../domain/planning';
import {Field} from './PlanningShared';
import {analyzeTimerCoverage} from '../utils/planningEngine';
const uid=()=>createEntityId('plan');
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
  onDue,
  section,
  sessions = [],
  completedAt
}: {
  taskId?: string;
  section?: 'project' | 'time' | 'advanced';
  sessions?: FocusSession[];
  completedAt?: string | null;
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
  const rootProjectId = project?.parentProjectId ?? project?.id ?? '';
  const subprojects = rootProjectId ? state.projects.filter(p => p.parentProjectId === rootProjectId) : [];
  const selectProject = (id: string) => {
    onProject(id);
    onChange({ ...planning, stageId: undefined });
  };
  const coverage = useMemo(() => {
    const timeVisible = !section || section === 'time';
    return analyzeTimerCoverage(taskId ?? '', timeVisible ? sessions : [], Date.now(), completedAt);
  }, [taskId, sessions, section, completedAt]);
  const coverageConfirmed = !!planning.timerCoverageConfirmed && planning.timerCoverageFingerprint === coverage.fingerprint;
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
  return <div className="kp">
    {(!section || section === 'project') && <>
      <div className="kp-grid">
        <Field label="پروژه">
          <select value={rootProjectId} onChange={event => selectProject(event.target.value)}>
            <option value="">بدون پروژه</option>
            {state.projects.filter(p => !p.parentProjectId).map(p => (
              <option key={p.id} value={p.id}>{p.title}{p.archived ? ' (بایگانی)' : ''}</option>
            ))}
          </select>
        </Field>
        {subprojects.length > 0 && <Field label="زیرپروژه (اختیاری)">
          <select value={project?.parentProjectId ? project.id : ''} onChange={event => selectProject(event.target.value || rootProjectId)}>
            <option value="">بدون زیرپروژه</option>
            {subprojects.map(p => (
              <option key={p.id} value={p.id}>{p.title}{p.archived ? ' (بایگانی)' : ''}</option>
            ))}
          </select>
        </Field>}
        {project && <Field label="مرحله">
          <select value={planning.stageId ?? ''} onChange={event => onChange({ ...planning, stageId: event.target.value || undefined })}>
            <option value="">بدون مرحله</option>
            {project.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
          </select>
        </Field>}
      </div>
      <Field label="از اینجا ادامه بده">
        <textarea value={planning.resume ?? ''} onChange={event => onChange({ ...planning, resume: event.target.value })} />
      </Field>
    </>}
    {(!section || section === 'time') && <><Field label="موعد تحویل (تاریخ و ساعت محلی، اختیاری)"><input type="datetime-local" value={dueAt} onChange={e=>onDue(e.target.value)}/></Field><Field label="نوع مشخص کار"><input placeholder="مثلاً طراحی رابط وب؛ اختیاری" value={planning.workType??''} onChange={e=>onChange({...planning,workType:e.target.value})}/></Field><small>برای تخمین شخصی، نوع مشخص کار یا همان آیتم قالب مقایسه می‌شود؛ دستهٔ عمومی کافی نیست.</small><div className="kp-grid"><Field label="مدت باقی‌مانده (دقیقه)"><input type="number" min="0" step="any" value={planning.remainingMinutes??''} onChange={e=>onChange({...planning,remainingMinutes:e.target.value===''?undefined:Number(e.target.value)})}/></Field><Field label="کل زمان واقعی انجام کار (دقیقه)"><input type="number" min="1" step="any" value={planning.actualMinutes??''} onChange={e=>onChange({...planning,actualMinutes:e.target.value===''?undefined:Number(e.target.value),actualConfirmed:false})}/></Field><Field label="حجم کار (مثلاً تعداد سؤال)"><input type="number" min="0.001" step="any" value={planning.units??''} onChange={e=>onChange({...planning,units:e.target.value===''?undefined:Number(e.target.value)})}/></Field>{(planning.units!==undefined||planning.unitName)&&<Field label="واحد حجم کار"><input value={planning.unitName??''} onChange={e=>onChange({...planning,unitName:e.target.value})}/></Field>}</div><label className="kp-check"><input type="checkbox" disabled={!(planning.actualMinutes!>0)} checked={!!planning.actualConfirmed} onChange={e=>onChange({...planning,actualConfirmed:e.target.checked})}/> این مقدار، کل زمان واقعی انجام کار است و آن را تأیید می‌کنم.</label>
    {taskId&&<div className="kp-card"><h4>زمان ثبت‌شده با تایمر</h4><p>{coverage.minutes.toLocaleString('fa-IR')} دقیقه در {coverage.sessionIds.length.toLocaleString('fa-IR')} جلسه ثبت شده است.</p><p>این مقدار خودکار کل زمان کار فرض نمی‌شود. پاسخ‌دادن اختیاری است و جلوی تکمیل کار را نمی‌گیرد.</p>{coverage.reasons.map(reason=><p key={reason} role="status">{reason}</p>)}<label className="kp-check"><input type="checkbox" disabled={!coverage.valid||!coverage.sessionIds.length} checked={coverageConfirmed} onChange={e=>onChange({...planning,timerCoverageConfirmed:e.target.checked,timerCoverageFingerprint:e.target.checked?coverage.fingerprint:undefined})}/> همهٔ زمان انجام این کار در همین جلسه‌های تایمر ثبت شده است.</label>{planning.timerCoverageConfirmed&&!coverageConfirmed&&<small>جلسه‌ها تغییر کرده‌اند؛ برای تخمین کل زمان، دوباره پوشش کامل را بررسی کن.</small>}</div>}
    <label className="kp-check"><input type="checkbox" checked={!!planning.splittable} onChange={e=>onChange({...planning,splittable:e.target.checked})}/> کار قابل تقسیم به چند جلسه است</label>{planning.splittable&&<Field label="حداقل طول جلسه (دقیقه)"><input type="number" min="1" value={planning.minimumChunk??15} onChange={e=>onChange({...planning,minimumChunk:Number(e.target.value)})}/></Field>}</>}
    {(!section || section === 'advanced') && <><label className="kp-check"><input type="checkbox" checked={!!planning.waiting} onChange={e=>onChange({...planning,waiting:e.target.checked})}/> منتظر شخص دیگری هستم</label><label className="kp-check"><input type="checkbox" checked={!!planning.coachDisabled} onChange={e=>onChange({...planning,coachDisabled:e.target.checked})}/> کمک‌یار این کار خاموش باشد</label>
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
    </>}
  </div>;
}
