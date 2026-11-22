import type { PlanningRepository } from '../../application/repositories';
import { emptyPlanning, validatePlanning, type PlanningState } from '../../domain/planning';
import { nowIso, StorageConflictError } from '../../domain/models';
import type { KairosWebDatabase } from './dexieAdapter';
import { diffPlanningRecords, joinPlanningRecords, PLANNING_MIGRATION_KEY, PLANNING_RECOVERY_KEY, splitPlanningRecords, stablePlanningJson, upgradeLegacyPlanningLayout } from '../planningRecords';
export async function migratePlanningRecords(db: KairosWebDatabase): Promise<void> {
  await db.transaction('rw', [db.settings, db.planningRecords, db.kvState], async () => {
    if (await db.planningRecords.get('meta')) return;
    const settings = await db.settings.get('default');
    const legacy = settings?.planning;
    const state = validatePlanning(upgradeLegacyPlanningLayout(legacy ?? emptyPlanning()));
    const records = splitPlanningRecords(state);
    if (legacy) await db.kvState.put({
      key: PLANNING_RECOVERY_KEY,
      value: structuredClone(legacy),
      updatedAt: nowIso()
    });
    await db.planningRecords.bulkPut(records);
    const verified = joinPlanningRecords(await db.planningRecords.toArray());
    if (stablePlanningJson(verified) !== stablePlanningJson(state)) throw Error('تأیید مهاجرت برنامه‌ریزی انجام نشد؛ اطلاعات قبلی حفظ شد.');
    await db.kvState.put({
      key: PLANNING_MIGRATION_KEY,
      value: {
        storageVersion: 1,
        revision: state.revision
      },
      updatedAt: nowIso()
    });
    if (settings && legacy) {
      const next = {
        ...settings
      };
      delete next.planning;
      await db.settings.put(next);
    }
  });
}
// Called within the recovery transaction that also writes settings, entities and the rollback snapshot.
export async function replacePlanningFromBackup(db: KairosWebDatabase, incoming: PlanningState): Promise<void> {
  await migratePlanningRecords(db);
  const meta = await db.planningRecords.get('meta');
  const current = (meta?.value as Pick<PlanningState, 'revision'> | undefined)?.revision;
  if (current === undefined || !Number.isSafeInteger(current)) throw Error('نسخهٔ برنامه‌ریزی فعلی نامعتبر است.');
  const revision = Math.max(current + 1, incoming.revision);
  const records = splitPlanningRecords({ ...upgradeLegacyPlanningLayout(incoming), revision });
  await db.planningRecords.clear();
  await db.planningRecords.bulkPut(records);
}

export function createDexiePlanningRepository(db: KairosWebDatabase, notify: () => void): PlanningRepository {
  return {
    getPlanning: async () => {
      await migratePlanningRecords(db);
      return db.transaction('r', db.planningRecords, async () => joinPlanningRecords(await db.planningRecords.toArray()));
    },
    savePlanning: async (next, options) => {
      const records = splitPlanningRecords(next);
      await migratePlanningRecords(db);
      const result = await db.transaction('rw', [db.planningRecords, db.tasks], async () => {
        if (options.expectedTaskRevisions) {
          const tasks = (await db.tasks.toArray()).filter(t => !t.deletedAt);
          const expected = options.expectedTaskRevisions;
          if (tasks.length !== Object.keys(expected).length || tasks.some(t => expected[t.id] !== t.revision)) throw new StorageConflictError('tasks', -1, -1);
        }
        const previous = await db.planningRecords.toArray();
        const current = joinPlanningRecords(previous);
        if (current.revision !== options.expectedRevision || next.revision !== current.revision + 1) throw Error('اطلاعات برنامه‌ریزی در پنجرهٔ دیگری تغییر کرده؛ تازه‌سازی کن.');
        if (options.createTask) await db.tasks.add(options.createTask);
        const patch = diffPlanningRecords(previous, records, options.expectedRevision);
        if (patch.deletes.length) await db.planningRecords.bulkDelete(patch.deletes);
        if (patch.upserts.length) await db.planningRecords.bulkPut(patch.upserts);
        return structuredClone(next);
      });
      notify();
      return result;
    }
  };
}
