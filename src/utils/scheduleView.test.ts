import test from 'node:test';import assert from 'node:assert/strict';
import {editableSchedule,replacePendingSchedule,scheduleRows,taskRevisionSnapshot} from './scheduleView';
import type {Task} from '../types';
const task:Task={id:'one',title:'کار',duration:30,priority:1,targetDate:'2026-11-17',completed:false,revision:4};
const slot={taskId:'one',start:'2026-11-18T20:20:00Z',end:'2026-11-18T21:00:00Z'};
test('today and calendar derive same confirmed allocations despite a different target date',()=>{
  const today=scheduleRows([slot],[task],'2026-11-18','UTC');
  const calendar=scheduleRows([slot],[task],'2026-11-18','UTC');
  assert.deepEqual(today,calendar);assert.equal(today.length,1);
  assert.equal(scheduleRows([slot],[{...task,completed:true}],'2026-11-18','UTC')[0].task.completed,true);
  assert.equal(scheduleRows([slot],[],'2026-11-18','UTC').length,0);
  assert.equal(scheduleRows([slot],[{...task,deletedAt:'2026-11-18T00:00:00Z'}]).length,0);
});
test('timezone affects the displayed day without changing the stored instant or inventing copies',()=>{
  const before=JSON.stringify(slot);
  assert.equal(scheduleRows([slot],[task],'2026-11-19','Asia/Tehran').length,1);
  assert.equal(scheduleRows([slot],[task],'2026-11-19','UTC').length,0);
  assert.equal(JSON.stringify(slot),before);
  assert.deepEqual(taskRevisionSnapshot([task]),{one:4});
});
test('replanning replaces future work and retains past days and completed assignments', () => {
  const past = {...slot, start:'2026-11-17T09:00:00Z', end:'2026-11-17T09:30:00Z'};
  const finished = {...slot, taskId:'finished'};
  const tasks = [task, {...task, id:'finished', completed:true}];
  const now = Date.parse('2026-11-18T07:00:00Z');
  const pending = {...slot, start:'2026-11-18T14:00:00Z', end:'2026-11-18T14:30:00Z'};
  assert.deepEqual(editableSchedule([past, finished, slot], tasks, now), [slot]);
  assert.deepEqual(replacePendingSchedule([past, finished, slot], [pending], tasks, now), [past, pending, finished]);
});
