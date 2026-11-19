import test from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../types';
import { restoreTaskEditorDraft, taskEditorDraft, validateTaskEditor } from './taskEditor';
test('quick task needs only a title and does not fabricate an initial user estimate', () => {
  const draft = taskEditorDraft(null, '2026-11-18'); draft.title = 'شروع'; draft.targetDate = '';
  const result = validateTaskEditor(draft, '2026-11-18');
  assert.deepEqual(result.errors, {}); assert.equal(result.data?.targetDate, '2026-11-18');
  assert.equal(result.data?.planning?.initialEstimate, undefined);
});
test('saving a title edit preserves hidden advanced values and exact existing deadline', () => {
  const task: Task = { id: 'task', title: 'قبلی', duration: 35, priority: 7, targetDate: '2026-11-20', completed: false, category: 'learning', projectId: 'p', dueAt: '2026-11-21T10:30:00.123Z', reminderTime: '08:20', planning: { stageId: 's', resume: 'از صفحه ۱۲', initialEstimate: 35, units: 6, unitName: 'صفحه', splittable: true, minimumChunk: 10 } };
  const draft = taskEditorDraft(task, '2026-11-18'); draft.title = 'جدید';
  const result = validateTaskEditor(draft, '2026-11-18', task);
  assert.deepEqual(result.data?.planning, task.planning); assert.equal(result.data?.dueAt, task.dueAt);
  assert.equal(result.data?.category, 'learning'); assert.equal(result.data?.projectId, 'p'); assert.equal(result.data?.reminderTime, '08:20');
});
test('advanced task drafts survive restart and invalid numeric values do not save', () => {
  const draft = taskEditorDraft(null, '2026-11-18'); draft.title = 'ادامه'; draft.projectId = 'project'; draft.planning = { resume: 'جزئیات' }; draft.durationExplicit = true; draft.duration = '۴۰';
  const restored = restoreTaskEditorDraft(JSON.parse(JSON.stringify(draft)), '2026-11-19');
  assert.ok(restored); assert.equal(restored.projectId, 'project'); assert.equal(restored.planning.resume, 'جزئیات');
  assert.equal(validateTaskEditor(restored, '2026-11-19').data?.planning?.initialEstimate, 40);
  restored.duration = '-8'; assert.ok(validateTaskEditor(restored, '2026-11-19').errors.duration);
});
