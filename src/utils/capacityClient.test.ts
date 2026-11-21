import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlanning, localDate } from '../domain/planning';
import { canRunCapacityWithoutWorker, runCapacityCalculation, runCapacityConfirmation } from './capacityClient';
import { planCapacity } from './planningEngine';
import type { Task } from '../types';

const now=new Date('2026-11-16T09:00:00');
const state=()=>({...emptyPlanning(),availability:[{id:'today',date:localDate(now),start:'09:00',end:'11:00'}]});
const tasks:Task[]=[{id:'a',title:'A',duration:30,priority:1,category:'work',targetDate:localDate(now),completed:false}];

test('small file WebView without module Worker gets a bounded asynchronous calculation',async()=>{
  let yielded=false;
  setTimeout(()=>{yielded=true;},0);
  const result=await runCapacityCalculation(state(),tasks,{now,horizon:1,workerFactory:()=>{throw new DOMException('Module Worker blocked for file:','SecurityError');}});
  assert.equal(yielded,true);assert.equal(result.status,'ready');assert.deepEqual(result,planCapacity(state(),tasks,now,1));
});

test('large Worker-less input is rejected instead of running the synchronous planner',async()=>{
  const large=Array.from({length:1000},(_,i)=>({...tasks[0],id:String(i)}));
  assert.equal(canRunCapacityWithoutWorker(state(),large,30),false);
  await assert.rejects(runCapacityCalculation(state(),large,{now,horizon:30,workerFactory:()=>{throw Error('unavailable');}}),/Worker/);
});

test('Worker calculation uses protocol result and terminates its worker',async()=>{
  let terminated=false;
  const fake={onmessage:null as ((e:MessageEvent)=>void)|null,onerror:null as ((e:ErrorEvent)=>void)|null,
    postMessage(data:any){assert.equal(data.action,'calculate');assert.deepEqual(data.state.metrics,[]);assert.equal(data.tasks[0].description,undefined);queueMicrotask(()=>fake.onmessage?.({data:{result:planCapacity(data.state,data.tasks,new Date(data.now),data.horizon)}} as MessageEvent));},
    terminate(){terminated=true;}
  };
  const stateWithMetrics=state();stateWithMetrics.metrics=[{id:'weight',title:'Private metric',description:'',unit:'kg',aggregate:'last',direction:'neutral',entries:[]}];
  const result=await runCapacityCalculation(stateWithMetrics,[{...tasks[0],description:'Private task note'}],{now,horizon:1,workerFactory:()=>fake});
  assert.equal(result.status,'ready');assert.equal(terminated,true);
});

test('Worker failure falls back only for small data and cancellation remains cancellation',async()=>{
  const fake={onmessage:null as ((e:MessageEvent)=>void)|null,onerror:null as ((e:ErrorEvent)=>void)|null,
    postMessage(){queueMicrotask(()=>fake.onerror?.({} as ErrorEvent));},terminate(){}
  };
  assert.equal((await runCapacityCalculation(state(),tasks,{now,horizon:1,workerFactory:()=>fake})).status,'ready');
  const controller=new AbortController();controller.abort();
  await assert.rejects(runCapacityCalculation(state(),tasks,{now,horizon:1,signal:controller.signal}),{name:'AbortError'});
  const pending=new AbortController();let stopped=false;
  const hanging={onmessage:null,onerror:null,postMessage(){pending.abort();},terminate(){stopped=true;}};
  await assert.rejects(runCapacityCalculation(state(),tasks,{now,horizon:1,signal:pending.signal,workerFactory:()=>hanging}),{name:'AbortError'});
  assert.equal(stopped,true);
});

test('Worker-less confirmation of a brief delay resolves in one accepted action',async()=>{
  const preview=planCapacity(state(),tasks,now,1);
  const result=await runCapacityConfirmation(state(),tasks,preview,new Date(now.getTime()+9000));
  assert.equal(result.status,'accepted');assert.equal(result.adjusted,true);
});
