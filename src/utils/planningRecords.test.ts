import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlanning } from '../domain/planning';
import { KairosWebDatabase, WebDexiePlatformAdapter } from '../infrastructure/web/dexieAdapter';
import { PLANNING_RECOVERY_KEY, PLANNING_MIGRATION_KEY, splitPlanningRecords, joinPlanningRecords, diffPlanningRecords, hasPlanningContent, stablePlanningJson, utf8Bytes, upgradeLegacyPlanningLayout } from '../infrastructure/planningRecords';
import { createPlanningBridgeRepository } from '../infrastructure/bridge/planningBridgeRepository';
import { BridgeProtocolError, createBridgeRequest } from '../infrastructure/bridge/protocol';
import { computeBackupChecksum, validateBackupEnvelopeObject } from './backupCrypto';
let sequence = 0;
function setup() {
  const db = new KairosWebDatabase(`normalized_planning_${Date.now()}_${++sequence}`);
  return {
    db,
    adapter: new WebDexiePlatformAdapter(db)
  };
}
function populated() {
  const state = upgradeLegacyPlanningLayout(emptyPlanning());
  state.revision = 1;
  state.projects = [{
    id: 'پروژه/۱',
    title: 'هدف',
    description: 'حفظ داده',
    archived: false,
    stages: [{
      id: 's1',
      title: 'شروع'
    }]
  }];
  state.metrics = [{
    id: 'm1',
    title: 'شاخص',
    unit: 'عدد',
    description: '',
    aggregate: 'sum',
    direction: 'neutral',
    entries: [{
      id: 'e1',
      date: '2026-11-18',
      value: 1,
      note: ''
    }, {
      id: 'e2',
      date: '2026-11-19',
      value: 2,
      note: ''
    }]
  }];
  state.allocations = [{
    taskId: 't1',
    start: '2026-11-18T09:00:00.000Z',
    end: '2026-11-18T09:30:00.000Z'
  }];
  state.previousAllocations = [];
  return state;
}
test('normalized records retain identities, order, metric entries and optional previous allocations', () => {
  const state = populated();
  const records = splitPlanningRecords(state);
  assert.equal(records.filter(r => r.collection === 'metricEntries').length, 2);
  assert.deepEqual(joinPlanningRecords(records.reverse()), state);
  assert.ok(records.some(r => r.key.includes('%D9')));
  const without = structuredClone(state);
  delete without.previousAllocations;
  assert.equal(joinPlanningRecords(splitPlanningRecords(without)).previousAllocations, undefined);
});

test('native JSON object ordering does not mark unchanged records for upload', () => {
  const state = populated();
  const fromSqlite = JSON.parse(stablePlanningJson(splitPlanningRecords(state)));
  state.revision++;
  state.metrics[0].entries[0].value++;
  const patch = diffPlanningRecords(fromSqlite, splitPlanningRecords(state), 1);
  assert.deepEqual(patch.upserts.map(row => row.key), ['meta', 'metricEntries:m1/e1']);
  assert.deepEqual(patch.deletes, []);
});

test('revision-zero backup preferences and an undo history count as planning content', () => {
  const empty = emptyPlanning();
  assert.equal(hasPlanningContent(empty), false);
  assert.equal(hasPlanningContent({ ...empty, revision: 99 }), false);
  const state = upgradeLegacyPlanningLayout(empty);
  assert.equal(hasPlanningContent(state), false);
  state.layout.mobile.pinned = ['workspace'];
  assert.equal(hasPlanningContent(state), true);
  assert.equal(hasPlanningContent({ ...empty, breakMinutes: 10 }), true);
  assert.equal(hasPlanningContent({ ...empty, previousAllocations: populated().allocations }), true);
});

test('replace and rollback invalidate another connection’s pending save even with equal imported revisions', async () => {
  const { db, adapter } = setup();
  const otherDb = new KairosWebDatabase(db.name);
  const other = new WebDexiePlatformAdapter(otherDb);
  try {
    await adapter.planning.savePlanning(populated(), { expectedRevision: 0 });
    const stale = await other.planning.getPlanning();
    const replacement = await adapter.backup.exportBackup();
    replacement.payload.planning!.projects[0].title = 'کار جدید';
    replacement.checksum = computeBackupChecksum(replacement.payload);
    await adapter.backup.restoreBackup(replacement, 'replace');
    const restored = await other.planning.getPlanning();
    assert.equal(restored.revision, 2);
    await assert.rejects(() => other.planning.savePlanning({ ...stale, revision: 2 }, { expectedRevision: 1 }));
    await adapter.backup.rollbackLastRestore!();
    assert.deepEqual(await other.planning.getPlanning(), { ...stale, revision: 3 });
    await assert.rejects(() => other.planning.savePlanning({ ...restored, revision: 3 }, { expectedRevision: 2 }));
  } finally { otherDb.close(); await db.delete(); }
});

test('a failed replacement rolls back its recovery snapshot together with the data', async () => {
  const { db, adapter } = setup();
  try {
    await adapter.planning.savePlanning(populated(), { expectedRevision: 0 });
    const replacement = await adapter.backup.exportBackup();
    const previousTitle = replacement.payload.planning!.projects[0].title;
    replacement.payload.planning!.projects[0].title = 'بعد از بازیابی اول';
    replacement.checksum = computeBackupChecksum(replacement.payload);
    await adapter.backup.restoreBackup(replacement, 'replace');

    const fail = () => { throw Error('forced replacement failure'); };
    db.planningRecords.hook('creating', fail);
    await assert.rejects(() => adapter.backup.restoreBackup(replacement, 'replace'), /forced replacement failure/);
    db.planningRecords.hook('creating').unsubscribe(fail);
    assert.equal((await adapter.planning.getPlanning()).projects[0].title, 'بعد از بازیابی اول');
    await adapter.backup.rollbackLastRestore!();
    assert.equal((await adapter.planning.getPlanning()).projects[0].title, previousTitle);
  } finally { await db.delete(); }
});

test('native paging counts user data without charging repeated encoded record keys against the logical limit', async () => {
  const state = populated();
  state.metrics[0].id = 'ش'.repeat(200);
  state.metrics[0].entries = Array.from({ length: 16000 }, (_, i) =>
    ({ id: String(i), date: '2026-11-19', value: i, note: '' }));
  const rows = splitPlanningRecords(state);
  assert.ok(utf8Bytes(rows) > 20 * 1024 * 1024);
  const repository = createPlanningBridgeRepository(async (_, payload: any) => {
    const end = Math.min(payload.cursor + 250, rows.length);
    return { revision: state.revision, records: rows.slice(payload.cursor, end), nextCursor: end === rows.length ? null : end } as any;
  });
  assert.equal((await repository.getPlanning()).metrics[0].entries.length, 16000);
});
test('legacy settings migrate transactionally with recovery and replay without deleting user records', async () => {
  const {
    db,
    adapter
  } = setup();
  try {
    const settings = await adapter.settings.getSettings();
    const legacy = populated();
    delete legacy.layout.desktop.main;
    delete legacy.layout.mobile.main;
    await db.settings.put({
      ...settings,
      planning: legacy
    });
    const migrated = await adapter.planning.getPlanning();
    assert.equal(migrated.projects[0].id, 'پروژه/۱');
    assert.deepEqual((await db.kvState.get(PLANNING_RECOVERY_KEY))?.value, legacy);
    assert.equal((await db.settings.get('default'))?.planning, undefined);
    assert.ok(await db.kvState.get(PLANNING_MIGRATION_KEY));
    const before = await db.planningRecords.toArray();
    assert.deepEqual(await adapter.planning.getPlanning(), migrated);
    assert.deepEqual(await db.planningRecords.toArray(), before);
  } finally {
    await db.delete();
  }
});
test('quota failure during migration rolls back new records and retains original settings until retry succeeds', async () => {
  const {
    db,
    adapter
  } = setup();
  try {
    const settings = await adapter.settings.getSettings(),
      legacy = populated();
    await db.settings.put({
      ...settings,
      planning: legacy
    });
    let writes = 0;
    const fail = () => {
      if (++writes === 3) throw Error('QuotaExceededError: simulated full disk');
    };
    db.planningRecords.hook('creating', fail);
    await assert.rejects(() => adapter.planning.getPlanning(), /QuotaExceeded/);
    assert.deepEqual((await db.settings.get('default'))?.planning, legacy);
    assert.equal(await db.planningRecords.count(), 0);
    assert.equal(await db.kvState.get(PLANNING_RECOVERY_KEY), undefined);
    assert.equal(await db.kvState.get(PLANNING_MIGRATION_KEY), undefined);
    db.planningRecords.hook('creating').unsubscribe(fail);
    assert.deepEqual(await adapter.planning.getPlanning(), legacy);
  } finally {
    await db.delete();
  }
});
test('editing a measurement writes only that record and revision metadata', async () => {
  const {
    db,
    adapter
  } = setup();
  try {
    const state = populated();
    await adapter.planning.savePlanning(state, {
      expectedRevision: 0
    });
    const writes: string[] = [];
    db.planningRecords.hook('updating', (_changes, key) => {
      writes.push(String(key));
    });
    const next = await adapter.planning.getPlanning();
    next.revision++;
    next.metrics[0].entries[0].value = 3;
    await adapter.planning.savePlanning(next, {
      expectedRevision: 1
    });
    assert.deepEqual(writes.sort(), ['meta', 'metricEntries:m1/e1']);
    assert.equal((await adapter.settings.getSettings()).planning, undefined);
  } finally {
    await db.delete();
  }
});
test('schedule save atomically rejects changed, added, and deleted tasks', async () => {
  const {
    db,
    adapter
  } = setup();
  try {
    const now = '2026-11-18T08:00:00.000Z';
    const task = await adapter.tasks.upsertTask({
      id: 't1',
      title: 'کار',
      completed: false,
      status: 'todo',
      duration: 30,
      targetDate: '2026-11-18',
      priority: 1,
      category: 'work',
      tags: [],
      subtasks: [],
      revision: 1,
      createdAt: now,
      updatedAt: now
    });
    const proposal = populated();
    const map = {
      [task.id]: task.revision
    };
    const edited = await adapter.tasks.upsertTask({
      ...task,
      title: 'ویرایش'
    });
    await assert.rejects(() => adapter.planning.savePlanning(proposal, {
      expectedRevision: 0,
      expectedTaskRevisions: map
    }));
    assert.equal((await adapter.planning.getPlanning()).revision, 0);
    const extra = await adapter.tasks.upsertTask({
      ...edited,
      id: 't2',
      revision: 0
    });
    await assert.rejects(() => adapter.planning.savePlanning(proposal, {
      expectedRevision: 0,
      expectedTaskRevisions: {
        t1: edited.revision
      }
    }));
    const latest = {
      t1: edited.revision,
      t2: extra.revision
    };
    await adapter.tasks.softDeleteTask('t2');
    await assert.rejects(() => adapter.planning.savePlanning(proposal, {
      expectedRevision: 0,
      expectedTaskRevisions: latest
    }));
    assert.equal((await adapter.planning.getPlanning()).revision, 0);
    await adapter.planning.savePlanning(proposal, {
      expectedRevision: 0,
      expectedTaskRevisions: {
        t1: edited.revision
      }
    });
    assert.equal((await adapter.planning.getPlanning()).revision, 1);
  } finally {
    await db.delete();
  }
});
test('actual UTF8 byte limits reject oversized Unicode records and bridge frames', () => {
  assert.equal(utf8Bytes('فارسی'), 10);
  const state = populated();
  state.templates = [{
    id: 'large',
    title: 'قالب',
    tasks: Array.from({
      length: 40
    }, (_, i) => ({
      title: `کار ${i}`,
      description: 'آ'.repeat(4000),
      duration: 1,
      priority: 1
    }))
  }];
  assert.throws(() => splitPlanningRecords(state), /۲۵۶/);
  assert.throws(() => createBridgeRequest('tasks.upsert', {
    description: 'آ'.repeat(3 * 1024 * 1024)
  }), /بایت/);
});
test('paged native repository reads persistent rows and forwards only changed records with task guard', async () => {
  let rows = splitPlanningRecords(populated());
  const calls: {
    op: string;
    payload: any;
  }[] = [];
  const repository = createPlanningBridgeRepository(async (op, payload: any) => {
    calls.push({
      op,
      payload
    });
    if (op === 'planning.get') {
      const start = payload.cursor ?? 0;
      return {
        revision: 1,
        records: rows.slice(start, start + 2),
        nextCursor: start + 2 < rows.length ? start + 2 : null
      } as any;
    }
    if (op === 'planning.save') {
      assert.equal(payload.upserts.length, 2);
      assert.deepEqual(payload.expectedTaskRevisions, {
        t1: 5
      });
      return {
        revision: 2
      } as any;
    }
    throw Error(op);
  });
  const state = await repository.getPlanning();
  assert.equal(state.metrics[0].entries.length, 2);
  assert.ok(calls.filter(c => c.op === 'planning.get').length > 1);
  state.metrics[0].entries[1].value = 8;
  state.revision = 2;
  await repository.savePlanning(state, {
    expectedRevision: 1,
    expectedTaskRevisions: {
      t1: 5
    }
  });
  const missing = createPlanningBridgeRepository(async () => {
    throw new BridgeProtocolError('UNKNOWN_OPERATION', 'old host');
  });
  await assert.rejects(() => missing.getPlanning(), /به‌روز/);
});
test('planning records are included in backup integrity checks', async () => {
  const {
    db,
    adapter
  } = setup();
  try {
    await adapter.planning.savePlanning(populated(), {
      expectedRevision: 0
    });
    const backup = await adapter.backup.exportBackup();
    const checksum = backup.checksum;
    backup.payload.planning!.metrics[0].entries[0].value = 100;
    assert.notEqual(computeBackupChecksum(backup.payload), checksum);
    assert.equal(validateBackupEnvelopeObject(backup, {
      verifyChecksum: true
    }).valid, false);
  } finally {
    await db.delete();
  }
});

test('an actual version-one IndexedDB upgrades without losing the legacy document before migration commits',async()=>{
  const name=`old_planning_schema_${Date.now()}_${++sequence}`;const old=new Dexie(name);
  old.version(1).stores({tasks:'id',habits:'id',habitEntries:'id',notes:'id',focusSessions:'id',settings:'id',kvState:'key'});
  const legacy=populated();await old.table('settings').put({id:'default',theme:'light',planning:legacy});old.close();
  const db=new KairosWebDatabase(name);try{await db.open();assert.deepEqual((await db.settings.get('default'))?.planning,legacy);const adapter=new WebDexiePlatformAdapter(db);assert.deepEqual(await adapter.planning.getPlanning(),legacy);assert.equal((await db.settings.get('default'))?.planning,undefined);assert.deepEqual((await db.kvState.get(PLANNING_RECOVERY_KEY))?.value,legacy);}finally{await db.delete();}
});

test('large histories persist outside settings and a one-entry edit does not rewrite the history',async()=>{
  const {db,adapter}=setup();try{
    const state=populated();state.metrics[0].entries=Array.from({length:2200},(_,i)=>({id:`entry-${i}`,date:'2026-11-18',value:i,note:'ر'.repeat(1000)}));assert.ok(utf8Bytes(state)>4*1024*1024);
    await adapter.planning.savePlanning(state,{expectedRevision:0});assert.equal((await db.settings.get('default'))?.planning,undefined);assert.equal(await db.planningRecords.where('collection').equals('metricEntries').count(),2200);
    const next=await adapter.planning.getPlanning();const writes:string[]=[];db.planningRecords.hook('updating',(_change,key)=>{writes.push(String(key));});next.revision++;next.metrics[0].entries[1400].value=7;await adapter.planning.savePlanning(next,{expectedRevision:1});assert.deepEqual(writes.sort(),['meta','metricEntries:m1/entry-1400']);assert.equal((await adapter.planning.getPlanning()).metrics[0].entries.length,2200);
  }finally{await db.delete();}
});

test('early Android flat V2 backups preserve planning settings and notes during canonical import',async()=>{
  const {db,adapter}=setup();try{
    await adapter.settings.saveSettings({theme:'light'});const exported=await adapter.backup.exportBackup();
    const flat:any={app:'kairos',schemaVersion:2,exportedAt:exported.exportedAt,...exported.payload};delete flat.planning;flat.settings.planning=populated();flat.notes=[{id:'android-note',kind:'idea',title:'یادداشت قدیمی',content:'متن',category:'work',tags:[],pinned:false,createdAt:exported.exportedAt,updatedAt:exported.exportedAt,revision:1,deletedAt:null}];
    const validated=validateBackupEnvelopeObject(flat);assert.equal(validated.valid,true,validated.errors.join(' | '));await adapter.backup.restoreBackup(validated.envelope!,'replace');assert.equal((await adapter.planning.getPlanning()).projects[0].id,'پروژه/۱');assert.equal((await adapter.notes.listNotes())[0].id,'android-note');
  }finally{await db.delete();}
});

test('accepting a scenario creates its task and plan together and rejects a retry or stale snapshot', async () => {
  const {db,adapter}=setup();
  const task={id:'offer',title:'کار',status:'todo' as const,completed:false,priority:3,duration:30,targetDate:'2030-01-02',
    category:'work',tags:[],subtasks:[],createdAt:'2030-01-02T08:00:00Z',updatedAt:'2030-01-02T08:00:00Z',revision:1};
  try {
    const original=await adapter.planning.getPlanning();
    const plan={...original,revision:1,allocations:[{taskId:task.id,start:'2030-01-02T09:00:00Z',end:'2030-01-02T09:30:00Z',plannedTaskMinutes:30}]};
    const options={expectedRevision:0,expectedTaskRevisions:{},createTask:task};
    await assert.rejects(adapter.planning.savePlanning(plan,{...options,expectedTaskRevisions:{missing:1}}));
    assert.equal(await adapter.tasks.getTaskById(task.id),null);
    assert.deepEqual(await adapter.planning.getPlanning(),original);
    await adapter.planning.savePlanning(plan,options);
    await assert.rejects(adapter.planning.savePlanning({...plan,revision:2},{expectedRevision:1,createTask:task}));
    assert.equal((await adapter.tasks.listTasks()).length,1);
    assert.deepEqual(await adapter.planning.getPlanning(),plan);
  } finally {await db.delete();}
});
