import { emptyPlanning, type PlanningState } from '../domain/planning';
import type { Task } from '../types';
import { confirmSchedule, planCapacity, type ScheduleConfirmation, type ScheduleResult } from './planningEngine';

interface WorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(value: unknown): void;
  terminate(): void;
}
export interface CapacityOptions {
  now?: Date;
  horizon?: number;
  signal?: AbortSignal;
  workerFactory?: () => WorkerPort;
  timeoutMs?: number;
}

function scheduleInputs(state: import('./planningEngine').ReviewCalendar, tasks: Task[]) {
  // Metrics, notes and coaching histories do not participate in scheduling and
  // need not be copied to a Worker or serialized on the interface thread.
  const schedule = {...emptyPlanning(), reservedOutsideScope:state.reservedOutsideScope,revision:state.revision,availability:state.availability,commitments:state.commitments,excludedDates:state.excludedDates,allocations:state.allocations,breakMinutes:state.breakMinutes};
  const relevant = tasks.map(t => ({id:t.id,title:t.title,duration:t.duration,priority:t.priority,targetDate:t.targetDate,dueAt:t.dueAt,completed:t.completed,status:t.status,deletedAt:t.deletedAt,revision:t.revision,updatedAt:t.updatedAt,planning:{remainingMinutes:t.planning?.remainingMinutes,splittable:t.planning?.splittable,minimumChunk:t.planning?.minimumChunk,waiting:t.planning?.waiting}}));
  return {state:schedule,tasks:relevant};
}

export function canRunCapacityWithoutWorker(state: PlanningState, tasks: Task[], horizon: number): boolean {
  const count = tasks.length;
  const windows = state.availability.length + state.commitments.length;
  const days = Math.max(1,Math.min(90,Math.floor(horizon)));
  if (count > 30 || windows > 40 || state.allocations.length > 200 || !Number.isFinite(days)) return false;
  const operations = (1+Math.min(count,20))*Math.max(1,count)*Math.max(1,windows*days)*Math.max(4,count);
  // The fallback is deliberately small. A large file: WebView cannot run an
  // unbounded synchronous solver just because module Workers are unavailable.
  const input=scheduleInputs(state,tasks);
  return operations <= 1_000_000 && new TextEncoder().encode(JSON.stringify(input)).byteLength <= 256*1024;
}

const aborted = () => new DOMException('محاسبه لغو شد.','AbortError');
async function boundedFallback<T>(state: PlanningState, tasks: Task[], horizon: number, calculate: () => T, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw aborted();
  if (!canRunCapacityWithoutWorker(state,tasks,horizon)) throw Error('این میزبان Worker ندارد و این برنامه برای محاسبهٔ سبک بزرگ است؛ افق یا تعداد کارها را کم کن، یا نسخهٔ مرورگر/ویندوز دارای Worker را باز کن.');
  // Yield before bounded work so status and input events can paint normally.
  await new Promise<void>(resolve => setTimeout(resolve,0));
  if (signal?.aborted) throw aborted();
  const result = calculate();
  await new Promise<void>(resolve => setTimeout(resolve,0));
  if (signal?.aborted) throw aborted();
  return result;
}

async function run<T>(state: PlanningState, tasks: Task[], options: CapacityOptions, preview?: ScheduleResult): Promise<T> {
  ({state,tasks}=scheduleInputs(state,tasks));
  const now = options.now ?? new Date(), horizon = options.horizon ?? preview?.horizonDays ?? 30;
  const fallback = () => boundedFallback(state,tasks,horizon,() => (preview ? confirmSchedule(state,tasks,preview,now) : planCapacity(state,tasks,now,horizon)) as T,options.signal);
  if (options.signal?.aborted) return Promise.reject(aborted());
  let worker: WorkerPort;
  try {
    if (options.workerFactory) worker = options.workerFactory();
    else {
      if (typeof Worker === 'undefined') return fallback();
      // The same bundled Worker can start from a Blob on an opaque file: origin.
      const {default: CapacityWorker} = await import('./capacityWorker?worker&inline');
      worker = new CapacityWorker();
    }
  } catch { return fallback(); }
  return new Promise<T>((resolve,reject) => {
    let settled = false;
    const cleanup = () => { clearTimeout(timer);worker.terminate();options.signal?.removeEventListener('abort',cancel); };
    const cancel = () => { if(settled)return;settled=true;cleanup();reject(aborted()); };
    const fallbackOnce = () => { if(settled)return;settled=true;cleanup();void fallback().then(resolve,reject); };
    const timer = setTimeout(fallbackOnce,options.timeoutMs ?? 20000);
    options.signal?.addEventListener('abort',cancel,{once:true});
    if(options.signal?.aborted){cancel();return;}
    worker.onmessage = event => {
      if(settled)return;settled=true;cleanup();
      if(event.data.error) reject(Error(event.data.error));
      else if(preview ? event.data.confirmation : event.data.result) resolve(preview ? event.data.confirmation : event.data.result);
      else reject(Error('پاسخ محاسبهٔ برنامه معتبر نیست.'));
    };
    worker.onerror = fallbackOnce;
    try { worker.postMessage({state,tasks,now:now.toISOString(),horizon,action:preview?'confirm':'calculate',preview}); }
    catch { fallbackOnce(); }
  });
}

export function runCapacityCalculation(state: PlanningState, tasks: Task[], options: CapacityOptions = {}): Promise<ScheduleResult> {
  return run<ScheduleResult>(state,tasks,options);
}
export function runCapacityConfirmation(state: PlanningState, tasks: Task[], preview: ScheduleResult, now = new Date(), signal?: AbortSignal): Promise<ScheduleConfirmation> {
  return run<ScheduleConfirmation>(state,tasks,{now,horizon:preview.horizonDays,signal},preview);
}
