import { emptyPlanning, validatePlanning, type PlanningState } from '../domain/planning';
import { normalizeMenuLayout } from '../utils/menuLayout';
export const PLANNING_STORAGE_VERSION = 1;
export const MAX_PLANNING_RECORD_BYTES = 256 * 1024;
export const PLANNING_PAGE_BYTES = 512 * 1024;
export const PLANNING_RECOVERY_KEY = 'kairos_planning_settings_recovery_v1';
export const PLANNING_MIGRATION_KEY = 'kairos_planning_records_v1';
export interface PlanningRecord {
  key: string;
  collection: string;
  ownerId?: string;
  position: number;
  value: unknown;
}
export interface PlanningPatch {
  storageVersion: 1;
  expectedRevision: number;
  revision: number;
  upserts: PlanningRecord[];
  deletes: string[];
}
export const utf8Bytes = (value: unknown) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).byteLength;
export function upgradeLegacyPlanningLayout(input: PlanningState): PlanningState {
  const state = structuredClone(input);
  for (const mode of ['desktop', 'mobile'] as const) if (state.layout?.[mode] && state.layout[mode].main === undefined) state.layout[mode] = normalizeMenuLayout(state.layout[mode], mode);
  return state;
}
export function stablePlanningJson(value: unknown): string {
  const canonical = (input: any): any => Array.isArray(input) ? input.map(canonical) : input && typeof input === 'object' ? Object.fromEntries(Object.keys(input).sort().filter(k => input[k] !== undefined).map(k => [k, canonical(input[k])])) : input;
  return JSON.stringify(canonical(value));
}
const key = (collection: string, id: string) => `${collection}:${encodeURIComponent(id)}`;
const collections = ['projects', 'templates', 'events', 'availability', 'commitments', 'feedback', 'predictions'] as const;
export function splitPlanningRecords(input: PlanningState): PlanningRecord[] {
  const state = validatePlanning(input);
  const {
    projects,
    templates,
    events,
    availability,
    commitments,
    feedback,
    predictions,
    metrics,
    allocations,
    previousAllocations,
    excludedDates,
    ...preferences
  } = state;
  const records: PlanningRecord[] = [{
    key: 'meta',
    collection: 'meta',
    position: 0,
    value: {
      ...preferences,
      storageVersion: PLANNING_STORAGE_VERSION,
      previousAllocationsPresent: previousAllocations !== undefined
    }
  }];
  for (const collection of collections) state[collection].forEach((value, position) => records.push({
    key: key(collection, value.id),
    collection,
    position,
    value
  }));
  metrics.forEach((metric, position) => {
    const {
      entries,
      ...definition
    } = metric;
    records.push({
      key: key('metrics', metric.id),
      collection: 'metrics',
      position,
      value: definition
    });
    entries.forEach((entry, position) => records.push({
      key: key('metricEntries', metric.id) + '/' + encodeURIComponent(entry.id),
      collection: 'metricEntries',
      ownerId: metric.id,
      position,
      value: entry
    }));
  });
  for (const collection of ['allocations', 'previousAllocations'] as const) {
    const duplicates = new Map<string, number>();
    (state[collection] ?? []).forEach((value, position) => {
      const identity = value.taskId + '/' + value.start;
      const occurrence = duplicates.get(identity) ?? 0;
      duplicates.set(identity, occurrence + 1);
      records.push({
        key: key(collection, identity) + '/' + occurrence,
        collection,
        position,
        value
      });
    });
  }
  excludedDates.forEach((date, position) => records.push({
    key: key('excludedDates', date),
    collection: 'excludedDates',
    position,
    value: date
  }));
  const keys = new Set<string>();
  for (const record of records) {
    validatePlanningRecord(record);
    if (keys.has(record.key)) throw Error('شناسهٔ تکراری در رکوردهای برنامه‌ریزی.');
    keys.add(record.key);
  }
  return records;
}
export function validatePlanningRecord(record: PlanningRecord): void {
  if (!record || typeof record.key !== 'string' || !record.key || record.key.length > 2048 || typeof record.collection !== 'string' || !Number.isSafeInteger(record.position) || record.position < 0) throw Error('رکورد برنامه‌ریزی نامعتبر است.');
  if (utf8Bytes(record) > MAX_PLANNING_RECORD_BYTES) throw Error('اندازهٔ یک رکورد برنامه‌ریزی از ۲۵۶ کیبی‌بایت بیشتر است. آن را به بخش‌های کوچک‌تر تقسیم کن.');
}
export function joinPlanningRecords(records: PlanningRecord[]): PlanningState {
  if (!records.length) return emptyPlanning();
  const meta = records.find(r => r.key === 'meta')?.value as Record<string, unknown> | undefined;
  if (!meta || meta.storageVersion !== PLANNING_STORAGE_VERSION) throw Error('نسخهٔ ذخیره‌سازی برنامه‌ریزی پشتیبانی نمی‌شود.');
  const {
    storageVersion,
    previousAllocationsPresent,
    ...preferences
  } = meta;
  const state = {
    ...emptyPlanning(),
    ...preferences
  } as PlanningState;
  const ordered = (name: string) => records.filter(r => r.collection === name).sort((a, b) => a.position - b.position);
  for (const collection of collections) (state as any)[collection] = ordered(collection).map(r => r.value);
  const entriesByMetric = new Map<string, unknown[]>();
  for (const entry of ordered('metricEntries')) {
    const id = entry.ownerId ?? '';
    const group = entriesByMetric.get(id) ?? [];
    group.push(entry.value);
    entriesByMetric.set(id, group);
  }
  state.metrics = ordered('metrics').map(r => ({
    ...(r.value as any),
    entries: entriesByMetric.get((r.value as any).id) ?? []
  }));
  state.allocations = ordered('allocations').map(r => r.value as PlanningState['allocations'][number]);
  state.previousAllocations = previousAllocationsPresent ? ordered('previousAllocations').map(r => r.value as PlanningState['allocations'][number]) : undefined;
  state.excludedDates = ordered('excludedDates').map(r => r.value as string);
  return validatePlanning(upgradeLegacyPlanningLayout(state));
}
export function diffPlanningRecords(previous: PlanningRecord[], next: PlanningRecord[], expectedRevision: number): PlanningPatch {
  const old = new Map(previous.map(r => [r.key, r]));
  const current = new Map(next.map(r => [r.key, r]));
  return {
    storageVersion: 1,
    expectedRevision,
    revision: expectedRevision + 1,
    // Native JSON serializers may return object properties in a different order.
    upserts: next.filter(r => !old.has(r.key) || stablePlanningJson(old.get(r.key)) !== stablePlanningJson(r)),
    deletes: previous.filter(r => !current.has(r.key)).map(r => r.key)
  };
}
export function hasPlanningContent(state: PlanningState): boolean {
  if (state.previousAllocations?.length ||
    [state.projects, state.templates, state.events, state.metrics, state.allocations, state.availability,
      state.commitments, state.excludedDates, state.feedback, state.predictions].some(items => items.length > 0)) return true;
  const defaults = emptyPlanning();
  return state.breakMinutes !== defaults.breakMinutes || state.minimumSamples !== defaults.minimumSamples ||
    (['desktop', 'mobile'] as const).some(mode =>
      stablePlanningJson(normalizeMenuLayout(state.layout[mode], mode)) !==
      stablePlanningJson(normalizeMenuLayout(defaults.layout[mode], mode)));
}
