import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStageGroups,taskProgress} from './projectStages';
import type {Task} from '../types';
const task=(id:string,extra:Partial<Task>={}):Task=>({id,title:id,duration:30,priority:1,targetDate:'2026-11-18',completed:false,projectId:'p',...extra});
test('project and stage progress count main active tasks once and empty is unknown',()=>{
  assert.equal(taskProgress([]).percent,null);
  assert.deepEqual(taskProgress([task('a',{completed:true,subtasks:[{id:'sub',title:'part',completed:true}]}),task('b'),task('c',{status:'archived'}),task('d',{deletedAt:'2026-11-18T00:00:00Z'})]),{completed:1,total:2,percent:50});
});
test('stage groups preserve unassigned and orphaned tasks and never mix projects',()=>{
  const p={id:'p',title:'P',description:'',archived:false,stages:[{id:'one',title:'First'}]};
  const groups=projectStageGroups(p,[task('a',{planning:{stageId:'one'}}),task('b'),task('c',{planning:{stageId:'removed'}}),task('d',{projectId:'other'})]);
  assert.deepEqual(groups.map(g=>g.tasks.map(t=>t.id)),[['a'],['b','c']]);
});
