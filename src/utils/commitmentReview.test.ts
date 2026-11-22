import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyPlanning} from '../domain/planning';
import type {Task} from '../types';
import {commitmentInputs, hypotheticalTask, type ScenarioDraft} from './commitmentReview';
import {planCapacity, confirmSchedule} from './planningEngine';
import {replacePendingSchedule} from './scheduleView';

const now=new Date('2030-01-02T08:00:00');
const time=(hour:string)=>new Date('2030-01-02T'+hour).toISOString();
const draft:ScenarioDraft={id:'offer',title:'طراحی جلد',minutes:'30',workType:'طراحی جلد',projectId:'',due:'2030-01-02T11:00',splittable:false};
const calendar=()=>({...emptyPlanning(),availability:[{id:'free',date:'2030-01-02',start:'09:00',end:'11:00'}],
  commitments:[{id:'fixed',date:'2030-01-02',start:'09:00',end:'09:30'}]});
const waiting:Task={...hypotheticalTask({...draft,id:'waiting'},45,now),planning:{waiting:true},projectId:'other'};

test('unrelated waiting work reserves its existing interval and fixed commitments without blocking the review',()=>{
  const state={...calendar(),allocations:[{taskId:'waiting',start:time('09:30'),end:time('10:30'),locked:true}]};
  const target=hypotheticalTask(draft,45,now);
  const scope=commitmentInputs(state,[waiting],[],target,true,[],now);
  assert.deepEqual(scope.omitted.map(t=>t.id),['waiting']);
  const result=planCapacity(scope.calendar,scope.inputs,now,1);
  assert.equal(result.status,'ready'); assert.equal(result.allocations[0].start,time('10:30'));
  assert.equal(confirmSchedule(scope.calendar,scope.inputs,result,now).status,'accepted');
  assert.deepEqual(replacePendingSchedule(state.allocations,result.allocations,scope.inputs,+now)[0],state.allocations[0]);
  for (const related of [commitmentInputs(state,[waiting],[],{...target,projectId:'other'},true,[],now),
    commitmentInputs(state,[waiting],[],target,true,['waiting'],now)]) {
    const unresolved=planCapacity(related.calendar,related.inputs,now,1);
    assert.equal(unresolved.status,'needs_data');assert.match(unresolved.messages.join(' '),/انتظار/);
  }
});
test('hypothetical deadline, splitting and cancellation are side-effect free',()=>{
  const state=calendar();state.commitments.push({id:'gap',date:'2030-01-02',start:'10:00',end:'10:30'});
  const before=structuredClone(state);
  for(const split of [false,true]) {
    const target=hypotheticalTask({...draft,minutes:'60',splittable:split},45,now);
    const scope=commitmentInputs(state,[],[],target,true,[],now);
    const result=planCapacity(scope.calendar,scope.inputs,now,1);
    assert.equal(result.status,split?'ready':'no_plan');
    if(split) assert.equal(result.allocations.length,2); else assert.ok(result.messages.some(m=>m.includes(target.title)));
  }
  assert.deepEqual(state,before);
});
test('explicit manual estimate, comparable work history and timer assumption remain distinct',()=>{
  const blank=hypotheticalTask({...draft,minutes:''},45,now);
  const history=Array.from({length:3},(_,i)=>({...blank,id:'h'+i,completed:true,completedAt:time('07:00'),
    planning:{...blank.planning,actualConfirmed:true,actualMinutes:60}}));
  for(const [target,past,minutes,basis] of [
    [blank,[],45,'timer'],[blank,history,60,'history'],[hypotheticalTask(draft,45,now),history,30,'manual'],
  ] as const) {
    const review=commitmentInputs(calendar(),[...past],[],target,true,[],now);
    assert.equal(review.rows[0].basis,basis);assert.equal(review.rows[0].minutes,minutes);
    assert.equal(review.assumptions.length,basis==='timer'?1:0);
  }
});

test('a different selected task cannot relabel or resize the duration of a locked commitment',()=>{
  const existing=hypotheticalTask({...draft,id:'locked',minutes:'25'},45,now);
  const target=hypotheticalTask(draft,45,now);
  const state={...calendar(),allocations:[{taskId:existing.id,start:time('09:30'),end:time('10:30'),locked:true,
    plannedTaskMinutes:60,durationBasis:'history' as const}]};
  const view=commitmentInputs(state,[existing,target],[],target,false,[],now);
  const row=view.rows.find(r=>r.task.id==='locked')!;
  assert.equal(row.minutes,60);assert.equal(row.basis,'approved');assert.equal(row.previousBasis,'history');
  assert.equal(existing.duration,25);
  const result=planCapacity(view.calendar,view.inputs,now,1);
  assert.equal(result.status,'ready');
  assert.equal(confirmSchedule(view.calendar,view.inputs,result,now).status,'accepted');
});
