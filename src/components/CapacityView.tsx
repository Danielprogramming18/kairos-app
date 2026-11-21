import React,{useState} from 'react';
import type {Task,FocusSession} from '../types';
import {usePlanning} from '../app/PlanningContext';
import {createEntityId} from '../domain/models';
import {CommitmentReview} from './CommitmentReview';
import {Field,PlanningShell} from './PlanningShared';
import {domainEntityToTask,usePlatform} from '../app/PlatformContext';
import {validateScheduleAllocations,withConfirmedScheduleDurations} from '../utils/planningEngine';
import {editableSchedule,replacePendingSchedule,taskRevisionSnapshot} from '../utils/scheduleView';
import {ScheduleBoard} from './ScheduleBoard';
const uid=()=>createEntityId('plan');
const formatDate=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('fa-IR');
export function CapacityView({
  tasks,
  sessions, timerMinutes,
  onReload
}: {
  tasks: Task[];
  sessions: FocusSession[];
  timerMinutes: number;
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
  const [message,setMessage] = useState('');
  const [calculating,setCalculating] = useState(false);
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

    }
  };
  const undo = async () => {
    if (calculating) return;
    setCalculating(true);
    try {
      const [fresh, entities] = await Promise.all([container.planning.getPlanning(), container.tasks.listTasks()]);
      if (!fresh.previousAllocations) return;
      const freshTasks = entities.map(domainEntityToTask);
      const now = new Date();
      const previous = editableSchedule(withConfirmedScheduleDurations(fresh.previousAllocations, now), freshTasks, now.getTime());
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
    <CommitmentReview tasks={tasks} sessions={sessions} timerMinutes={timerMinutes} onReload={onReload} />
    <ScheduleBoard tasks={tasks}/>{state.previousAllocations&&<button disabled={calculating} onClick={()=>void undo()}>بازگرداندن برنامهٔ قبلی</button>}<p role="status">{message}</p>
    <div className="kp-card"><h3>ارزیابی تخمین‌های ثبت‌شده</h3>{state.predictions.length === 0 ? <p>هنوز قابل ارزیابی نیست؛ ابتدا تخمین ثبت کن و پس از اتمام کار زمان واقعی را تأیید کن.</p> : state.predictions.map(p => {
        const t = tasks.find(t => t.id === p.taskId);
        const actual = t?.completed && t.completedAt && Date.parse(t.completedAt) > Date.parse(p.at) && t.planning?.actualConfirmed ? t.planning.actualMinutes : undefined;
        return <p key={p.id}>{t?.title ?? 'کار در دسترس نیست'}: {actual === undefined ? 'منتظر زمان واقعی معتبر پس از پیش‌بینی' : `خطای تخمین ${Math.abs(actual - p.minutes).toFixed(1)} دقیقه؛ کم‌برآوردی ${Math.max(0, actual - p.minutes).toFixed(1)} دقیقه؛ خطای تخمین دستی ${p.manual === null ? 'نامعلوم' : Math.abs(actual - p.manual).toFixed(1)}`}</p>;
      })}</div>
  </PlanningShell>;
}
