import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { KairosWebDatabase, WebDexiePlatformAdapter } from '../infrastructure/web/dexieAdapter';
import { emptyPlanning, validatePlanning } from '../domain/planning';
import type { BackupEnvelopeV2, TaskEntity } from '../domain/models';
import { taskToDomainEntity, domainEntityToTask } from '../app/PlatformContext';
import { computeBackupChecksum, createEncryptedBackupEnvelope, decryptBackupEnvelope, validateBackupEnvelopeObject } from './backupCrypto';
import { AndroidBridgePlatformAdapter } from '../infrastructure/android/androidBridgeAdapter';
import { WindowsDesktopPlatformAdapter } from '../infrastructure/desktop/desktopBridgeAdapter';
import { upgradeLegacyPlanningLayout } from '../infrastructure/planningRecords';

const at = '2026-11-17T08:00:00.000Z';
let dbSequence = 0;
function setup() {
  const db = new KairosWebDatabase(`planning_storage_${Date.now()}_${++dbSequence}`);
  return { db, adapter: new WebDexiePlatformAdapter(db) };
}
function examplePlanning() {
  const state = emptyPlanning();
  state.revision = 1;
  state.projects.push({ id: 'project1', title: 'پروژه', description: 'هدف', archived: false, stages: [{ id: 'stage1', title: 'شروع' }], nextTaskId: 'task1' });
  state.templates.push({ id: 'template1', title: 'قالب', tasks: [{ title: 'تمرین', duration: 20, priority: 2, category: 'learning', subtasks: [{ id: 'sub1', title: 'مرور', completed: false }] }] });
  state.events.push({ id: 'event1', title: 'امتحان', date: '2026-12-01', time: '09:30', projectId: 'project1' });
  state.metrics.push({ id: 'metric1', title: 'مطالعه', description: '', unit: 'صفحه', aggregate: 'sum', direction: 'up', entries: [{ id: 'entry1', date: '2026-11-17', value: 12.5, note: 'دادهٔ واقعی' }] });
  state.layout.mobile = { order: ['tracking', 'projects'], pinned: ['tracking'], hidden: ['analytics'] };
  state.availability.push({ id: 'window1', weekday: 2, start: '09:00', end: '12:00' });
  state.commitments.push({ id: 'fixed1', date: '2026-11-17', start: '10:00', end: '10:30' });
  state.excludedDates.push('2026-11-20');
  state.allocations.push({ taskId: 'task1', start: '2026-11-17T09:00:00.000Z', end: '2026-11-17T09:30:00.000Z', locked: true });
  state.previousAllocations = [];
  state.feedback.push({ id: 'feedback1', taskId: 'task1', barrier: 'large', action: 'small-step', answer: 'helped', at });
  state.predictions.push({ id: 'prediction1', taskId: 'task1', at, minutes: 30, manual: 40, sampleIds: ['old-task'] });
  return upgradeLegacyPlanningLayout(state);
}
function exampleTask(): TaskEntity {
  return { id: 'task1', title: 'کار', status: 'todo', completed: false, priority: 2, duration: 30, targetDate: '2026-11-17', dueAt: '2026-11-18T18:00:00.000Z', projectId: 'project1', category: 'learning', tags: [], subtasks: [], createdAt: at, updatedAt: at, revision: 1,
    planning: { stageId: 'stage1', resume: 'از صفحهٔ ۱۲ ادامه بده', templateId: 'template1', units: 5, unitName: 'صفحه', initialEstimate: 40, remainingMinutes: 30, actualMinutes: 10, actualConfirmed: true, splittable: true, minimumChunk: 10, waiting: false, coachDisabled: true } };
}
function refreshChecksum(envelope: BackupEnvelopeV2) {
  envelope.checksum = computeBackupChecksum(envelope.payload);
  return envelope;
}

test('subprojects and their task links survive storage and backup; only one level is valid', async () => {
  const { db, adapter } = setup();
  const planning = examplePlanning();
  const child = {
    id: 'css',
    parentProjectId: 'project1',
    title: 'یادگیری CSS',
    description: '',
    archived: false,
    stages: [{ id: 'stage1', title: 'مبانی' }],
  };
  planning.projects.push(child);
  try {
    await adapter.planning.savePlanning(planning, { expectedRevision: 0 });
    await adapter.tasks.upsertTask({ ...exampleTask(), projectId: child.id });
    assert.deepEqual((await adapter.planning.getPlanning()).projects, planning.projects);
    const backup = await adapter.backup.exportBackup();
    const validated = validateBackupEnvelopeObject(JSON.parse(JSON.stringify(backup)), { verifyChecksum: true });
    assert.equal(validated.valid, true, validated.errors.join(' | '));
    assert.deepEqual(validated.envelope!.payload.planning!.projects, planning.projects);
    assert.equal(validated.envelope!.payload.tasks[0].projectId, child.id);

    for (const parentProjectId of ['missing', child.id]) {
      const invalid = { ...planning, projects: [...planning.projects, { ...child, id: 'invalid', parentProjectId }] };
      assert.throws(() => validatePlanning(invalid), /زیرپروژه/);
    }
    const cycle = { ...planning, projects: [{ ...planning.projects[0], parentProjectId: child.id }, child] };
    assert.throws(() => validatePlanning(cycle), /زیرپروژه/);
  } finally {
    db.close();
  }
});

test('planning and task extras survive canonical mappings, encrypted backup, replace and rollback', async () => {
  const { db, adapter } = setup();
  const planning = examplePlanning();
  try {
    const savedTask = await adapter.tasks.upsertTask(exampleTask());
    await adapter.planning.savePlanning(planning, {expectedRevision:0});
    const uiTask = domainEntityToTask(savedTask);
    assert.deepEqual(taskToDomainEntity(uiTask).planning, savedTask.planning);
    assert.equal(uiTask.projectId, 'project1');
    const exported = await adapter.backup.exportBackup();
    const validated = validateBackupEnvelopeObject(JSON.parse(JSON.stringify(exported)), { verifyChecksum: true });
    assert.equal(validated.valid, true, validated.errors.join(' | '));
    assert.deepEqual(validated.envelope!.payload.planning, planning);
    assert.deepEqual(validated.envelope!.payload.tasks[0].planning, savedTask.planning);
    const encrypted = await createEncryptedBackupEnvelope(exported, 'planning-roundtrip');
    const decrypted = await decryptBackupEnvelope(JSON.stringify(encrypted), 'planning-roundtrip');
    assert.equal(decrypted.valid, true, decrypted.errors.join(' | '));
    assert.deepEqual(decrypted.envelope!.payload.planning, planning);

    const replacement = structuredClone(exported);
    replacement.payload.planning!.revision = 10;
    replacement.payload.planning!.projects[0].title = 'عنوان بازیابی‌شده';
    replacement.payload.tasks[0].planning!.resume = 'یادداشت جدید';
    await adapter.backup.restoreBackup(refreshChecksum(replacement), 'replace');
    assert.equal((await adapter.planning.getPlanning())?.projects[0].title, 'عنوان بازیابی‌شده');
    assert.equal((await adapter.tasks.listTasks())[0].planning?.resume, 'یادداشت جدید');
    await adapter.backup.rollbackLastRestore!();
    assert.deepEqual(await adapter.planning.getPlanning(), { ...planning, revision: 11 });
    assert.deepEqual((await adapter.tasks.listTasks())[0].planning, savedTask.planning);
  } finally { await db.delete(); }
});

test('planning revision check prevents concurrent and stale writes without clobbering general settings', async () => {
  const { db, adapter } = setup();
  try {
    const previous = await adapter.settings.getSettings();
    assert.equal(previous.planning, undefined);
    await adapter.settings.saveSettings({ theme: 'light' });
    const first = examplePlanning();
    const second = examplePlanning(); second.projects[0].title = 'پنجرهٔ دوم';
    const outcomes = await Promise.allSettled([adapter.planning.savePlanning(first, {expectedRevision:0}), adapter.planning.savePlanning(second, {expectedRevision:0})]);
    assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(r => r.status === 'rejected').length, 1);
    await assert.rejects(() => adapter.planning.savePlanning(first, {expectedRevision:0}), /پنجره/);
    await adapter.settings.saveSettings({ soundEnabled: false });
    const after = await adapter.settings.getSettings();
    assert.equal(after.theme, 'light'); assert.equal(after.soundEnabled, false); assert.equal((await adapter.planning.getPlanning()).revision, 1);
    await assert.rejects(() => adapter.settings.saveSettings({ planning: null as any }));
    assert.deepEqual((await adapter.planning.getPlanning()), await adapter.planning.getPlanning());
  } finally { await db.delete(); }
});

test('malformed planning is reported as invalid and cannot mutate tasks, settings or restore snapshot', async () => {
  const { db, adapter } = setup();
  try {
    await adapter.tasks.upsertTask(exampleTask());
    await adapter.planning.savePlanning(examplePlanning(), {expectedRevision:0});
    const exported = await adapter.backup.exportBackup();
    const invalidVariants: ((e: BackupEnvelopeV2) => void)[] = [
      e => { e.payload.planning!.schemaVersion = 2 as any; },
      e => { e.payload.planning!.metrics[0].entries[0].value = '۱۲' as any; },
      e => { e.payload.planning!.templates[0].tasks[0].category = {} as any; },
      e => { e.payload.tasks[0].planning!.remainingMinutes = -1; },
      e => { e.payload.tasks[0].planning = null as any; },
      e => { e.payload.planning = null as any; },
      e => { e.payload.planning!.projects.push(e.payload.planning!.projects[0]); },
    ];
    for (const mutate of invalidVariants) {
      const bad = structuredClone(exported); mutate(bad); refreshChecksum(bad);
      const validation = await adapter.backup.validateBackupJson(JSON.stringify(bad));
      assert.equal(validation.valid, false); assert.ok(validation.errors.length);
      await assert.rejects(() => adapter.backup.restoreBackup(bad, 'replace'));
      assert.deepEqual((await adapter.backup.exportBackup()).payload, exported.payload);
      assert.equal((await adapter.backup.hasPreRestoreSnapshot!()).exists, false);
    }
    await assert.rejects(() => adapter.backup.restoreBackup(exported, 'merge'), /ادغام/);
  } finally { await db.delete(); }
});

test('old settings and backups still load, and replacing a backup without settings clears stale planning only', async () => {
  const { db, adapter } = setup();
  try {
    await adapter.tasks.upsertTask(exampleTask());
    await adapter.settings.saveSettings({ theme: 'light' });
    const legacy = await adapter.backup.exportBackup();
    assert.equal(validateBackupEnvelopeObject(legacy).valid, true);
    await adapter.planning.savePlanning(examplePlanning(), {expectedRevision:0});
    delete legacy.payload.settings; delete legacy.payload.planning;
    await adapter.backup.restoreBackup(refreshChecksum(legacy), 'replace');
    const settings = await adapter.settings.getSettings();
    assert.equal(settings.planning, undefined); assert.equal(settings.theme, 'light');
    await adapter.backup.rollbackLastRestore!();
    assert.deepEqual(await adapter.planning.getPlanning(), { ...examplePlanning(), revision: 3 });
  } finally { await db.delete(); }
});

test('both native adapters reject planning merges before sending a restore command', async () => {
  const { db, adapter } = setup();
  try {
    await adapter.planning.savePlanning(examplePlanning(), {expectedRevision:0});
    const envelope = await adapter.backup.exportBackup();
    for (const Adapter of [AndroidBridgePlatformAdapter, WindowsDesktopPlatformAdapter]) {
      const operations: string[] = [];
      const transport = { isAvailable: () => true, invoke: async (op: string) => { operations.push(op); return { planning: examplePlanning() }; } };
      const native = new Adapter(transport as any);
      await assert.rejects(() => native.backup.restoreBackup(envelope, 'merge'), /ادغام/);
      assert.equal(operations.includes('backup.restore'), false);
      const old = structuredClone(envelope); delete old.payload.settings; refreshChecksum(old);
      await assert.rejects(() => native.backup.restoreBackup(old, 'merge'), /ادغام/);
      assert.equal(operations.includes('backup.restore'), false);
    }
  } finally { await db.delete(); }
});

test('planning validation rejects malformed nested templates and non-ISO prediction dates', () => {
  const malformed = examplePlanning();
  malformed.templates[0].tasks[0].subtasks![0].completed = 'false' as any;
  assert.throws(() => validatePlanning(malformed), /ریزکار/);
  const badDate = examplePlanning(); badDate.predictions[0].at = 'March 1, 2026';
  assert.throws(() => validatePlanning(badDate), /تخمین/);
});

test('first-run default initialization from another connection cannot overwrite planning saves', async () => {
  const { db, adapter } = setup();
  const otherDb = new KairosWebDatabase(db.name);
  const other = new WebDexiePlatformAdapter(otherDb);
  try {
    await Promise.all([adapter.planning.savePlanning(examplePlanning(), {expectedRevision:0}), other.settings.getSettings()]);
    assert.deepEqual((await other.planning.getPlanning()), examplePlanning());
  } finally { otherDb.close(); await db.delete(); }
});
