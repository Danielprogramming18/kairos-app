import type { PlanningState } from '../domain/planning';
import type { Task } from '../types';
import { planCapacity } from './planningEngine';

// Keep the bounded schedule search off the interface thread on web and native WebViews.
self.onmessage = (event: MessageEvent<{
  state: PlanningState;
  tasks: Task[];
  now: string;
  horizon: number;
}>) => {
  try {
    const {
      state,
      tasks,
      now,
      horizon
    } = event.data;
    self.postMessage({
      result: planCapacity(state, tasks, new Date(now), horizon)
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'محاسبهٔ برنامه انجام نشد.'
    });
  }
};
