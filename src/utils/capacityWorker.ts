import type { PlanningState } from '../domain/planning';
import type { Task } from '../types';
import { confirmSchedule, planCapacity, ScheduleResult } from './planningEngine';

// Keep the bounded schedule search off the interface thread on web and native WebViews.
self.onmessage = (event: MessageEvent<{
  state: PlanningState;
  tasks: Task[];
  now: string;
  horizon: number;
  action?: 'calculate' | 'confirm';
  preview?: ScheduleResult;
}>) => {
  try {
    const {
      state,
      tasks,
      now,
      horizon
    } = event.data;
    if (event.data.action === 'confirm' && event.data.preview) self.postMessage({ confirmation: confirmSchedule(state,tasks,event.data.preview,new Date(now)) });
    else self.postMessage({ result: planCapacity(state, tasks, new Date(now), horizon) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'محاسبهٔ برنامه انجام نشد.'
    });
  }
};
