import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlanning, normalizeText, parseNumber, validatePlanning, validateTaskPlanning, localDate } from '../domain/planning';
import { eventCountdown, estimateDuration, instantiateTemplate, metricSummary, planCapacity, scheduleFingerprint } from './planningEngine';
import type { FocusSession, Task } from '../types';
const now = new Date('2026-11-16T08:00:00');
const task=(id:string,extra:Partial<Task>={}):Task=>({id,title:id,duration:45,priority:1,category:'work',targetDate:'2026-11-16',completed:false,...extra});
test('Persian search and decimal parsing preserve intent',()=>{assert.equal(normalizeText('كاري ۱۲۳'),'کاری 123');assert.equal(parseNumber('۷۲٫۵'),72.5);assert.equal(parseNumber(''),null);});
test('fragmented availability cannot fit a continuous task, split task can',()=>{const s=emptyPlanning();s.availability=[{id:'a',date:localDate(now),start:'09:00',end:'09:20'},{id:'b',date:localDate(now),start:'10:00',end:'10:25'}];assert.equal(planCapacity(s,[task('a')],now).status,'no_plan');const result=planCapacity(s,[task('a',{planning:{splittable:true,minimumChunk:15}})],now);assert.equal(result.status,'ready');assert.equal(result.allocations.length,2);});
test('merges free intervals and subtracts commitments without double counting',()=>{const s=emptyPlanning();s.availability=[{id:'a',weekday:now.getDay(),start:'09:00',end:'11:00'},{id:'b',weekday:now.getDay(),start:'10:00',end:'12:00'}];s.commitments=[{id:'c',weekday:now.getDay(),start:'10:00',end:'11:00'}];const r=planCapacity(s,[task('a',{duration:60})],now,1);assert.equal(r.freeMinutes,120);assert.equal(r.status,'ready');assert.deepEqual(r,planCapacity(s,[task('a',{duration:60})],now,1));});
test('requires information, does not invent durations, and respects expired deadlines',()=>{const s=emptyPlanning();assert.equal(planCapacity(s,[task('a')],now).status,'needs_data');s.availability=[{id:'a',date:localDate(now),start:'09:00',end:'12:00'}];assert.equal(planCapacity(s,[task('a',{duration:NaN})],now).status,'needs_data');assert.equal(planCapacity(s,[task('a',{dueAt:new Date('2026-11-15T12:00:00').toISOString()})],now).status,'no_plan');});
test('does not schedule elapsed time and rejects conflicting locked intervals',()=>{const s=emptyPlanning();s.availability=[{id:'a',date:localDate(now),start:'07:00',end:'10:00'}];const r=planCapacity(s,[task('a')],now,1);assert.equal(r.freeMinutes,120);assert.ok(Date.parse(r.allocations[0].start)>=now.getTime());s.allocations=[{taskId:'a',start:'2026-11-16T09:00:00',end:'2026-11-16T09:45:00',locked:true},{taskId:'b',start:'2026-11-16T09:30:00',end:'2026-11-16T09:50:00',locked:true}];assert.equal(planCapacity(s,[task('a'),task('b')],now).status,'needs_data');});
test('date-only events use calendar days, and metric gaps are not zeros',()=>{assert.equal(eventCountdown({id:'e',title:'امتحان',date:'2026-11-17'},new Date('2026-11-16T23:59:00')),'1 روز مانده');assert.equal(metricSummary({id:'m',title:'وزن',description:'',unit:'kg',aggregate:'mean',direction:'neutral',entries:[{id:'1',date:'2026-11-01',value:70,note:''},{id:'2',date:'2026-11-03',value:72,note:''}]}),71);});
test('templates reset IDs, completion and activity history',()=>{const source=task('old',{completed:true,planning:{actualMinutes:100},subtasks:[{id:'sub',title:'جزء',completed:true}]});const [copy]=instantiateTemplate({id:'tpl',title:'قالب',tasks:[source]},'2026-11-20');assert.notEqual(copy.id,source.id);assert.equal(copy.completed,false);assert.equal(copy.planning?.actualMinutes,undefined);assert.notEqual(copy.subtasks![0].id,'sub');assert.equal(copy.subtasks![0].completed,false);});
test('estimator uses only completed past samples and explicit comparable volumes',()=>{const past=[30,45,60].map((m,i)=>task(String(i),{completed:true,completedAt:'2026-11-10T12:00:00Z',planning:{actualMinutes:m,actualConfirmed:true}}));const future=task('future',{completed:true,completedAt:'2030-01-01T00:00:00Z',planning:{actualMinutes:1000,actualConfirmed:true}});const estimate=estimateDuration(task('target'),[...past,future],[],3,now.getTime());assert.equal(estimate.minutes,45);assert.equal(estimate.source,'history');assert.equal(estimate.count,3);assert.equal(estimateDuration(task('target',{planning:{units:20,unitName:'سؤال'}}),past,[],3,now.getTime()).source,'manual');});
test('planning validation rejects unknown schema, duplicate IDs and malformed task metadata',()=>{assert.throws(()=>validatePlanning({...emptyPlanning(),schemaVersion:2}));assert.throws(()=>validatePlanning({...emptyPlanning(),events:[{id:'x',title:'a',date:'2026-02-30'}]}));assert.throws(()=>validateTaskPlanning({remainingMinutes:-5}));assert.deepEqual(validatePlanning(emptyPlanning()),emptyPlanning());});

const minutesBetween=(start:string,end:string)=>(Date.parse(end)-Date.parse(start))/60000;
test('every split piece meets the minimum, while a whole shorter task remains valid',()=>{
  const s=emptyPlanning();s.availability=[{id:'a',date:localDate(now),start:'09:00',end:'09:20'},{id:'b',date:localDate(now),start:'10:00',end:'10:20'}];
  const r=planCapacity(s,[task('a',{duration:30,planning:{splittable:true,minimumChunk:15}})],now,1);
  assert.equal(r.status,'ready');assert.deepEqual(r.allocations.map(a=>minutesBetween(a.start,a.end)),[15,15]);
  assert.equal(planCapacity(s,[task('a',{duration:10,planning:{splittable:true,minimumChunk:15}})],now,1).status,'ready');
  s.allocations=[{taskId:'a',start:'2026-11-16T09:00:00',end:'2026-11-16T09:20:00',locked:true}];
  assert.equal(planCapacity(s,[task('a',{duration:30,planning:{splittable:true,minimumChunk:15}})],now,1).status,'no_plan');
});
test('locked time cannot split a continuous task or exceed its remaining duration',()=>{
  const s=emptyPlanning();s.availability=[{id:'a',date:localDate(now),start:'09:00',end:'12:00'}];
  s.allocations=[{taskId:'a',start:'2026-11-16T10:00:00',end:'2026-11-16T10:30:00',locked:true}];
  assert.equal(planCapacity(s,[task('a',{duration:60})],now,1).status,'needs_data');
  assert.equal(planCapacity(s,[task('a',{duration:20,planning:{splittable:true}})],now,1).status,'needs_data');
  const valid=planCapacity(s,[task('a',{duration:30})],now,1);assert.equal(valid.status,'ready');assert.deepEqual(valid.allocations,s.allocations);
});
test('requested break applies before and after locked allocations',()=>{
  const s=emptyPlanning();s.availability=[{id:'a',date:localDate(now),start:'09:00',end:'12:00'}];s.breakMinutes=10;
  s.allocations=[{taskId:'lock',start:'2026-11-16T10:00:00',end:'2026-11-16T10:30:00',locked:true}];
  const r=planCapacity(s,[task('lock',{duration:30}),task('a',{duration:50}),task('b',{duration:30})],now,1);
  assert.equal(r.status,'ready');for(let i=1;i<r.allocations.length;i++)assert.ok(minutesBetween(r.allocations[i-1].end,r.allocations[i].start)>=10);
  s.allocations.push({taskId:'second',start:'2026-11-16T10:35:00',end:'2026-11-16T11:00:00',locked:true});
  assert.equal(planCapacity(s,[task('lock',{duration:30}),task('second',{duration:25})],now,1).status,'needs_data');
});
test('breaks remain valid across separate free windows and reversed placement order',()=>{
  const s=emptyPlanning();s.availability=[{id:'a',date:localDate(now),start:'09:00',end:'09:30'},{id:'b',date:localDate(now),start:'09:35',end:'11:00'}];s.breakMinutes=10;
  const r=planCapacity(s,[task('long',{duration:60,priority:1}),task('short',{duration:30,priority:2})],now,1);
  assert.equal(r.status,'ready');assert.equal(r.allocations.length,2);
  assert.ok(minutesBetween(r.allocations[0].end,r.allocations[1].start)>=10);
});
test('date overrides, excluded days, and deadlines are hard constraints',()=>{
  const s=emptyPlanning();s.availability=[{id:'weekly',weekday:now.getDay(),start:'09:00',end:'12:00'},{id:'override',date:localDate(now),start:'15:00',end:'16:00'}];
  const r=planCapacity(s,[task('a',{duration:60})],now,1);assert.equal(r.status,'ready');assert.equal(new Date(r.allocations[0].start).getHours(),15);
  assert.equal(planCapacity(s,[task('a',{duration:60,dueAt:'2026-11-16T15:30:00'})],now,1).status,'no_plan');
  s.excludedDates=[localDate(now)];assert.equal(planCapacity(s,[task('a')],now,1).status,'no_plan');
});
test('preview fingerprints detect priority and deletion changes even without a revision',()=>{
  const s=emptyPlanning();const original=task('a');assert.notEqual(scheduleFingerprint(s,[original]),scheduleFingerprint(s,[{...original,priority:4}]));assert.notEqual(scheduleFingerprint(s,[original]),scheduleFingerprint(s,[{...original,deletedAt:now.toISOString()}]));
});
const completed=(id:string):Task=>task(id,{completed:true,completedAt:'2026-11-15T12:00:00Z'});
const session=(id:string,taskId:string,start:string,end:string,durationMinutes=30):FocusSession=>({id,taskId,startedAt:start,endedAt:end,durationMinutes,dateKey:'2026-11-14',timestamp:Date.parse(end)});
test('estimator excludes overlap across different tasks and does not double count duplicate sessions',()=>{
  const a=session('one','a','2026-11-14T09:00:00Z','2026-11-14T09:30:00Z');
  const b=session('two','b','2026-11-14T09:20:00Z','2026-11-14T09:50:00Z');
  const c=session('three','c','2026-11-14T10:00:00Z','2026-11-14T10:30:00Z');
  const r=estimateDuration(task('target'),['a','b','c'].map(completed),[a,b,c,c],3,now.getTime());
  assert.equal(r.count,1);assert.deepEqual(r.sampleIds,['c']);assert.deepEqual(r.range,[30,30]);assert.equal(r.excluded.length,2);
});
test('estimator rejects invalid timestamps, post-completion sessions, and future edits',()=>{
  const a=session('one','a','not-a-date','2026-11-14T09:30:00Z');
  const b=session('two','b','2026-11-15T13:00:00Z','2026-11-15T13:30:00Z');
  const c={...session('three','c','2026-11-14T10:00:00Z','2026-11-14T10:30:00Z'),updatedAt:'2030-01-01T00:00:00Z'};
  const d={...completed('d'),updatedAt:'2030-01-01T00:00:00Z',planning:{actualConfirmed:true,actualMinutes:40}};
  const r=estimateDuration(task('target'),[...['a','b','c'].map(completed),d],[a,b,c],3,now.getTime());
  assert.equal(r.count,0);assert.equal(r.excluded.length,4);assert.equal(r.source,'manual');
});
test('estimator scales comparable volumes and keeps explicitly confirmed outliers',()=>{
  const target=task('target',{planning:{units:20,unitName:'سؤال'}});
  const history=[20,30,40,30,600].map((m,i)=>({...completed(String(i)),planning:{units:10,unitName:'سؤال',actualMinutes:m,actualConfirmed:true}}));
  const r=estimateDuration(target,history,[],3,now.getTime());assert.equal(r.minutes,60);assert.equal(r.count,5);assert.deepEqual(r.range,[40,1200]);
  assert.equal(estimateDuration({...target,duration:Infinity},[],[],3,now.getTime()).minutes,null);
});
test('MAD zero flags unconfirmed extreme time without deleting the original session',()=>{
  const history=[...['a','b','c','d','outlier'].map(completed)];
  const sessions=history.map((t,i)=>session('s'+i,t.id,`2026-11-${String(9+i).padStart(2,'0')}T09:00:00Z`,`2026-11-${String(9+i).padStart(2,'0')}T${i===4?'14':'09'}:${i===4?'00':'30'}:00Z`,i===4?300:30));
  const r=estimateDuration(task('target'),history,sessions,3,now.getTime());
  assert.equal(r.minutes,30);assert.equal(r.count,4);assert.ok(r.excluded.some(x=>x.id==='outlier'));assert.equal(sessions[4].durationMinutes,300);
});
test('last-value metrics use recording order within a day rather than random IDs',()=>{
  assert.equal(metricSummary({id:'m',title:'وزن',description:'',unit:'kg',aggregate:'last',direction:'neutral',entries:[{id:'z',date:'2026-11-01',value:70,note:''},{id:'a',date:'2026-11-01',value:72,note:''}]}),72);
});
