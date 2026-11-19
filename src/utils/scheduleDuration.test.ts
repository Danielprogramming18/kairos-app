import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlanning, localDate, validatePlanning } from '../domain/planning';
import type { Task } from '../types';
import { taskToDomainEntity, domainEntityToTask } from '../app/PlatformContext';
import { KairosWebDatabase, WebDexiePlatformAdapter } from '../infrastructure/web/dexieAdapter';
import { confirmSchedule, estimateDuration, moveScheduleAllocation, planCapacity, validateScheduleAllocations, withConfirmedScheduleDurations } from './planningEngine';
import { editableSchedule, replacePendingSchedule, taskRevisionSnapshot } from './scheduleView';

const now = new Date('2099-11-19T08:00:00');
const target: Task = {id:'target', title:'طراحی وب', duration:25, priority:1, category:'work',
  targetDate:localDate(now), completed:false, planning:{workType:'طراحی وب', initialEstimate:25}};
const initial = () => ({...emptyPlanning(), availability:[{id:'free', date:localDate(now), start:'09:00', end:'17:00'}]});
const history = [0, 1, 2].map(i => ({...target, id:'sample'+i, completed:true, completedAt:'2026-11-18T12:00:00Z',
  planning:{...target.planning, actualMinutes:60, actualConfirmed:true}}));

test('25 to 60 approval survives database close/reopen, moving, a task edit and undo without changing the manual estimate', async () => {
  const name = 'duration_basis_' + crypto.randomUUID();
  let db = new KairosWebDatabase(name);
  try {
    let adapter = new WebDexiePlatformAdapter(db);
    await db.tasks.bulkPut([target, ...history].map(t => taskToDomainEntity(t)));
    const tasks = (await adapter.tasks.listTasks()).map(domainEntityToTask);
    const estimate = estimateDuration(tasks.find(t=>t.id===target.id)!, tasks, [], 3, now.getTime());
    assert.equal(estimate.source, 'history');
    assert.equal(estimate.minutes, 60);
    const inputs = tasks.map(t => t.id === target.id ? {...t, duration:estimate.minutes!} : t);
    const preview = planCapacity(initial(), inputs, now, 1);
    const confirmed = confirmSchedule(initial(), inputs, preview, new Date(now.getTime() + 5000));
    assert.equal(confirmed.status, 'accepted');
    assert.equal(confirmed.result.allocations[0].plannedTaskMinutes, 60);
    await adapter.planning.savePlanning({...initial(), revision:1, allocations:confirmed.result.allocations}, {
      expectedRevision:0, expectedTaskRevisions:taskRevisionSnapshot(tasks),
    });
    db.close();
    db = new KairosWebDatabase(name);
    adapter = new WebDexiePlatformAdapter(db);
    let state = await adapter.planning.getPlanning();
    let currentTasks = (await adapter.tasks.listTasks()).map(domainEntityToTask);
    assert.equal(state.allocations[0].plannedTaskMinutes, 60);
    assert.equal(currentTasks.find(t => t.id === target.id)!.duration, 25);
    assert.equal(currentTasks.find(t => t.id === target.id)!.planning?.initialEstimate, 25);
    assert.equal(validateScheduleAllocations(state, currentTasks, state.allocations, now).valid, true);
    const original = structuredClone(state.allocations);
    const moved = moveScheduleAllocation(state, currentTasks, 0, localDate(now)+'T11:00:00', now);
    assert.equal(moved.valid, true);
    assert.equal((Date.parse(moved.allocations[0].end) - Date.parse(moved.allocations[0].start)) / 60000, 60);
    state = await adapter.planning.savePlanning({...state, revision:2, previousAllocations:original, allocations:moved.allocations}, {
      expectedRevision:1, expectedTaskRevisions:taskRevisionSnapshot(currentTasks),
    });
    const entity = (await adapter.tasks.getTaskById(target.id))!;
    await adapter.tasks.upsertTask({...entity, duration:40}, {expectedRevision:entity.revision});
    currentTasks = (await adapter.tasks.listTasks()).map(domainEntityToTask);
    assert.equal(moveScheduleAllocation(state, currentTasks, 0, localDate(now)+'T12:00:00', now).valid, true);
    const previous = editableSchedule(state.previousAllocations!, currentTasks, now.getTime());
    assert.equal(validateScheduleAllocations(state, currentTasks, previous, now, {preserveLocked:true}).valid, true);
    await adapter.planning.savePlanning({...state, revision:3, previousAllocations:undefined,
      allocations:replacePendingSchedule(state.allocations, previous, currentTasks, now.getTime())}, {
      expectedRevision:2, expectedTaskRevisions:taskRevisionSnapshot(currentTasks),
    });
    db.close();
    db = new KairosWebDatabase(name);
    adapter = new WebDexiePlatformAdapter(db);
    assert.deepEqual((await adapter.planning.getPlanning()).allocations, original);
    assert.equal((await adapter.tasks.getTaskById(target.id))!.duration, 40);
    assert.equal((await adapter.tasks.getTaskById(target.id))!.planning?.initialEstimate, 25);
    const freshPlan = planCapacity(initial(), currentTasks, now, 1);
    assert.equal(freshPlan.allocations[0].plannedTaskMinutes, 40);
  } finally { await db.delete(); }
});

test('approved 60-minute basis still enforces conflicts, deadlines and locked time', () => {
  const state = initial();
  state.allocations = planCapacity(state, [{...target, duration:60}], now, 1).allocations;
  const dueTask = {...target, dueAt:localDate(now)+'T14:00:00'};
  assert.equal(moveScheduleAllocation(state, [dueTask], 0, localDate(now)+'T14:00:00', now).valid, false);
  state.commitments = [{id:'busy', date:localDate(now), start:'11:00', end:'12:00'}];
  assert.equal(moveScheduleAllocation(state, [target], 0, localDate(now)+'T11:00:00', now).valid, false);
  state.allocations[0].locked = true;
  assert.equal(moveScheduleAllocation(state, [target], 0, localDate(now)+'T12:00:00', now).valid, false);
  const preview = planCapacity(state, [{...target, duration:40}], now, 1);
  assert.equal(preview.status, 'ready');
  assert.deepEqual(preview.allocations, state.allocations);
  assert.equal(confirmSchedule(state, [{...target, duration:40}], preview, now).status, 'accepted');
});

test('split schedules share one duration basis and refuse mismatched or invalid metadata', () => {
  const state = initial();
  state.availability = [{id:'a',date:localDate(now),start:'09:00',end:'09:30'}, {id:'b',date:localDate(now),start:'11:00',end:'12:00'}];
  const splitTask = {...target, planning:{...target.planning, splittable:true, minimumChunk:15}};
  state.allocations = planCapacity(state, [{...splitTask, duration:60}], now, 1).allocations;
  assert.equal(state.allocations.length, 2);
  assert.deepEqual(state.allocations.map(a=>a.plannedTaskMinutes), [60,60]);
  assert.equal(moveScheduleAllocation(state, [splitTask], 1, localDate(now)+'T11:30:00', now).valid, true);
  state.allocations[1].plannedTaskMinutes = 25;
  assert.equal(validateScheduleAllocations(state, [splitTask], state.allocations, now).valid, false);
  state.allocations.forEach(slot=>{slot.locked=true;});
  assert.equal(planCapacity(state, [splitTask], now, 1).status, 'needs_data');
  state.allocations[1].plannedTaskMinutes = -1;
  assert.throws(()=>validatePlanning(state), /مدت مبنای/);
});

test('legacy approved intervals recover their saved 60-minute total for moving and undo', () => {
  const state = initial();
  state.allocations = [{taskId:target.id, start:localDate(now)+'T09:00:00', end:localDate(now)+'T10:00:00'}];
  const moved = moveScheduleAllocation(state, [target], 0, localDate(now)+'T11:00:00', now);
  assert.equal(moved.valid, true);
  assert.equal(moved.allocations[0].plannedTaskMinutes, 60);
  const previous = withConfirmedScheduleDurations(state.allocations, now);
  assert.equal(validateScheduleAllocations({...state,allocations:moved.allocations}, [target], previous, now).valid, true);
  assert.equal(state.allocations[0].plannedTaskMinutes, undefined);
  assert.equal(target.duration, 25);
});
