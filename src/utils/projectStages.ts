import type {Project} from '../domain/planning';
import type {Task} from '../types';

export function taskProgress(tasks:Task[]) {
  const active=tasks.filter(t=>!t.deletedAt&&t.status!=='archived');
  const completed=active.filter(t=>t.completed).length;
  return {completed,total:active.length,percent:active.length?Math.round(completed/active.length*100):null};
}
export function projectStageGroups(project:Project,tasks:Task[]) {
  const own=tasks.filter(t=>!t.deletedAt&&t.projectId===project.id);
  const ids=new Set(project.stages.map(s=>s.id));
  return [...project.stages.map(s=>({...s,tasks:own.filter(t=>t.planning?.stageId===s.id)})),{id:'__none',title:'بدون مرحله',tasks:own.filter(t=>!t.planning?.stageId||!ids.has(t.planning.stageId))}];
}
