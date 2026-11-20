import {
  KairosDataFile,
  Habit,
  Task,
  Idea,
  FocusSession,
  UsefulInfoItem,
} from '../types';

export function encodeUtf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * UTF-8 safe Base64 decoder (ignores newlines returned by GitHub API)
 */
export function decodeBase64ToUtf8(base64: string): string {
  const cleaned = base64.replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Merges two data sets by ID when a SHA conflict is detected between two devices
 * (e.g., phone and laptop both edited data before syncing).
 * Remote items and local items are combined; for Habits, completedDates maps are unioned.
 */
export function mergeKairosData(
  local: KairosDataFile['data'],
  remote: KairosDataFile['data'],
  preferLocalOnTie = true
): KairosDataFile['data'] {
  const mergeById = <T extends { id: string }>(localArr: T[], remoteArr: T[]): T[] => {
    const map = new Map<string, T>();
    const first = preferLocalOnTie ? remoteArr : localArr;
    const second = preferLocalOnTie ? localArr : remoteArr;
    for (const item of first || []) {
      if (item && item.id) map.set(item.id, item);
    }
    for (const item of second || []) {
      if (item && item.id) map.set(item.id, item);
    }
    return Array.from(map.values());
  };

  // Special merge for habits so completedDates from both devices are preserved
  const habitMap = new Map<string, Habit>();
  for (const h of remote.habits || []) {
    if (h && h.id) habitMap.set(h.id, { ...h, completedDates: { ...(h.completedDates || {}) } });
  }
  for (const h of local.habits || []) {
    if (!h || !h.id) continue;
    const existing = habitMap.get(h.id);
    if (existing) {
      habitMap.set(h.id, {
        ...(preferLocalOnTie ? h : existing),
        completedDates: {
          ...(existing.completedDates || {}),
          ...(h.completedDates || {}),
        },
      });
    } else {
      habitMap.set(h.id, { ...h, completedDates: { ...(h.completedDates || {}) } });
    }
  }

  return {
    habits: Array.from(habitMap.values()),
    tasks: mergeById<Task>(local.tasks || [], remote.tasks || []),
    ideas: mergeById<Idea>(local.ideas || [], remote.ideas || []),
    focusSessions: mergeById<FocusSession>(local.focusSessions || [], remote.focusSessions || []),
    usefulInfos: mergeById<UsefulInfoItem>(local.usefulInfos || [], remote.usefulInfos || []),
  };
}
