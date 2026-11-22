import type {Allocation} from '../domain/planning';
import type {Task} from '../types';

export function editableSchedule(allocations: Allocation[], tasks: Task[], asOf: number) {
  const active = new Set(tasks.filter(t => !t.completed && !t.deletedAt && t.status !== 'archived').map(t => t.id));
  return allocations.filter(slot => active.has(slot.taskId) && Date.parse(slot.end) > asOf);
}

/** Only pending assignments are replaced. Closed tasks and elapsed slots remain in the calendar. */
export function replacePendingSchedule(current: Allocation[], proposal: Allocation[], tasks: Task[], asOf: number) {
  const editable = new Set(editableSchedule(current, tasks, asOf));
  return [...current.filter(slot => !editable.has(slot)), ...proposal].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

const formatters=new Map<string,Intl.DateTimeFormat>();
export function dateInTimezone(timestamp:string,timezone=Intl.DateTimeFormat().resolvedOptions().timeZone) {
  if(!formatters.has(timezone))formatters.set(timezone,new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}));
  const parts=formatters.get(timezone)!.formatToParts(new Date(timestamp));
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value).join('-');
}
export function scheduleRows(allocations:Allocation[],tasks:Task[],date?:string,timezone?:string) {
  const byId=new Map(tasks.filter(t=>!t.deletedAt).map(t=>[t.id,t]));
  return allocations.flatMap((allocation,index)=>{
    const task=byId.get(allocation.taskId),start=Date.parse(allocation.start),end=Date.parse(allocation.end);
    if(!task||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
    if(date&&(dateInTimezone(allocation.start,timezone)>date||dateInTimezone(new Date(end-1).toISOString(),timezone)<date))return [];
    return [{allocation,index,task}];
  }).sort((a,b)=>Date.parse(a.allocation.start)-Date.parse(b.allocation.start));
}
export function taskRevisionSnapshot(tasks:Task[]) {
  return Object.fromEntries(tasks.filter(t=>!t.deletedAt).map(t=>[t.id,t.revision??1]));
}
export function scheduleCountByDate(allocations:Allocation[],tasks:Task[],dates:string[]) {
  const counts:Record<string,number>={};
  for(const {allocation} of scheduleRows(allocations,tasks)) {
    const from=dateInTimezone(allocation.start),to=dateInTimezone(new Date(Date.parse(allocation.end)-1).toISOString());
    for(const date of dates)if(date>=from&&date<=to)counts[date]=(counts[date]??0)+1;
  }
  return counts;
}
