import type { PlanningRepository } from '../../application/repositories';
import { MAX_PLANNING_STATE_BYTES, type PlanningState } from '../../domain/planning';
import { diffPlanningRecords, joinPlanningRecords, splitPlanningRecords, utf8Bytes, type PlanningRecord } from '../planningRecords';
import { BridgeProtocolError, type BridgeOperation } from './protocol';
export function createPlanningBridgeRepository(invoke: <T>(operation: BridgeOperation, payload: unknown) => Promise<T>): PlanningRepository {
  const unavailable = (error: unknown): never => {
    if (error instanceof BridgeProtocolError && (error.code === 'UNKNOWN_OPERATION' || error.code === 'VERSION_MISMATCH')) throw new Error('این میزبان ذخیره‌سازی برنامه‌ریزی جدید را پشتیبانی نمی‌کند. نسخهٔ ویندوز یا پل اندروید را به‌روز کن؛ اطلاعات در حافظهٔ موقت ذخیره نمی‌شود.');
    throw error;
  };
  async function readRecords(): Promise<{
    state: PlanningState;
    records: PlanningRecord[];
  }> {
    try {
      const records: PlanningRecord[] = [];
      let cursor = 0,
        revision: number | undefined;
      let bytes = 0;
      for (let page = 0; page < 10000; page++) {
        const result = await invoke<{
          revision: number;
          records: PlanningRecord[];
          nextCursor: number | null;
        }>('planning.get', {
          cursor,
          expectedRevision: revision
        });
        if (revision !== undefined && result.revision !== revision) throw Error('برنامه‌ریزی هنگام خواندن تغییر کرد؛ دوباره تازه‌سازی کن.');
        revision = result.revision;
        if (!Array.isArray(result.records)) throw Error('پاسخ ذخیره‌سازی برنامه‌ریزی نامعتبر است.');
        records.push(...result.records);
        // Record keys repeat owner IDs and may be percent-encoded. Count logical values
        // for this early guard; joinPlanningRecords checks the exact logical document.
        for (const record of result.records) bytes += utf8Bytes(record.value);
        if (bytes > MAX_PLANNING_STATE_BYTES + 1024) throw Error('حجم پاسخ برنامه‌ریزی بیش از حد مجاز است.');
        if (result.nextCursor === null || result.nextCursor === undefined) {
          const state = joinPlanningRecords(records);
          if (state.revision !== revision) throw Error('نسخهٔ برنامه‌ریزی ناسازگار است.');
          return {
            state,
            records
          };
        }
        if (!Number.isSafeInteger(result.nextCursor) || result.nextCursor <= cursor) throw Error('صفحه‌بندی برنامه‌ریزی نامعتبر است.');
        cursor = result.nextCursor;
      }
      throw Error('تعداد صفحه‌های اطلاعات بیش از حد مجاز است.');
    } catch (error) {
      return unavailable(error);
    }
  }
  return {
    getPlanning: async () => (await readRecords()).state,
    savePlanning: async (next, options) => {
      const previous = await readRecords();
      if (previous.state.revision !== options.expectedRevision || next.revision !== options.expectedRevision + 1) throw Error('اطلاعات برنامه‌ریزی در پنجرهٔ دیگری تغییر کرده؛ تازه‌سازی کن.');
      const patch = diffPlanningRecords(previous.records, splitPlanningRecords(next), options.expectedRevision);
      try {
        const result = await invoke<{
          revision: number;
        }>('planning.save', {
          ...patch,
          expectedTaskRevisions: options.expectedTaskRevisions
        });
        if (result.revision !== next.revision) throw Error('ذخیرهٔ برنامه‌ریزی تأیید نشد.');
        return structuredClone(next);
      } catch (error) {
        return unavailable(error);
      }
    }
  };
}
