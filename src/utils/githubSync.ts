import {
  GitHubSyncConfig,
  KairosDataFile,
  Habit,
  Task,
  Idea,
  FocusSession,
  UsefulInfoItem,
} from '../types';

export const GITHUB_CONFIG_STORAGE_KEY = 'kairos_github_config_v1';
export const GITHUB_LAST_SHA_STORAGE_KEY = 'kairos_github_last_sha_v1';
export const KAIROS_DEVICE_ID_KEY = 'kairos_device_id_v1';

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(KAIROS_DEVICE_ID_KEY);
    if (existing) return existing;
    const newId = 'dev_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem(KAIROS_DEVICE_ID_KEY, newId);
    return newId;
  } catch {
    return 'dev_local';
  }
}

export function loadGitHubConfig(): GitHubSyncConfig {
  try {
    const raw = localStorage.getItem(GITHUB_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        owner: parsed.owner || '',
        repo: parsed.repo || '',
        path: parsed.path || 'data.json',
        branch: parsed.branch || 'main',
        token: parsed.token || '',
        autoSync: parsed.autoSync !== false,
      };
    }
  } catch {}
  return {
    owner: '',
    repo: '',
    path: 'data.json',
    branch: 'main',
    token: '',
    autoSync: true,
  };
}

export function saveGitHubConfig(config: GitHubSyncConfig): void {
  try {
    localStorage.setItem(GITHUB_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

export function isGitHubConfigValid(config: GitHubSyncConfig): boolean {
  return Boolean(
    config.owner.trim() &&
      config.repo.trim() &&
      config.path.trim() &&
      config.token.trim()
  );
}

/**
 * UTF-8 safe Base64 encoder (supports Persian characters and emojis cleanly)
 */
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

export interface FetchGitHubResult {
  exists: boolean;
  sha: string | null;
  fileData: KairosDataFile | null;
}

export async function fetchGitHubDataFile(
  config: GitHubSyncConfig
): Promise<FetchGitHubResult> {
  const owner = encodeURIComponent(config.owner.trim());
  const repo = encodeURIComponent(config.repo.trim());
  const cleanPath = config.path.trim().replace(/^\/+/, '');
  const branch = encodeURIComponent(config.branch.trim() || 'main');

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${branch}&t=${Date.now()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });

  if (response.status === 404) {
    return {
      exists: false,
      sha: null,
      fileData: null,
    };
  }

  if (!response.ok) {
    let errMsg = `خطای گیت‌هاب (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.message) errMsg += `: ${errJson.message}`;
    } catch {}
    throw new Error(errMsg);
  }

  const json = await response.json();
  const decodedContent = decodeBase64ToUtf8(json.content || '');
  const parsed = JSON.parse(decodedContent);

  const normalized: KairosDataFile = {
    app: 'Kairos',
    version: '4.0',
    updatedAt: parsed.updatedAt || new Date().toISOString(),
    deviceId: parsed.deviceId || 'remote',
    data: {
      habits: parsed.data?.habits || parsed.habits || [],
      tasks: parsed.data?.tasks || parsed.tasks || [],
      ideas: parsed.data?.ideas || parsed.ideas || [],
      focusSessions: parsed.data?.focusSessions || parsed.focusSessions || [],
      usefulInfos: parsed.data?.usefulInfos || parsed.usefulInfos || [],
    },
  };

  return {
    exists: true,
    sha: json.sha || null,
    fileData: normalized,
  };
}

export interface PushGitHubResult {
  sha: string;
  mergedData: KairosDataFile['data'];
  hadConflictResolved: boolean;
  updatedAt: string;
}

/**
 * Saves data.json to GitHub using SHA verification.
 * If the remote SHA differs from lastKnownSha (another device saved changes),
 * it safely merges remote & local changes before writing with the latest SHA.
 */
export async function pushGitHubDataFile(
  config: GitHubSyncConfig,
  localData: KairosDataFile['data'],
  lastKnownSha: string | null
): Promise<PushGitHubResult> {
  // 1. Check current remote SHA first to prevent overwriting another device's changes
  const remoteState = await fetchGitHubDataFile(config);

  let dataToSave = localData;
  let effectiveSha: string | null = remoteState.sha;
  let hadConflictResolved = false;

  if (
    remoteState.exists &&
    remoteState.fileData &&
    remoteState.sha &&
    lastKnownSha &&
    remoteState.sha !== lastKnownSha
  ) {
    // Another device updated data.json since our last known SHA!
    // Merge remote changes with local changes so nothing is overwritten.
    dataToSave = mergeKairosData(localData, remoteState.fileData.data, true);
    hadConflictResolved = true;
  }

  const nowIso = new Date().toISOString();
  const payload: KairosDataFile = {
    app: 'Kairos',
    version: '4.0',
    updatedAt: nowIso,
    deviceId: getOrCreateDeviceId(),
    data: dataToSave,
  };

  const base64Content = encodeUtf8ToBase64(JSON.stringify(payload, null, 2));

  const owner = encodeURIComponent(config.owner.trim());
  const repo = encodeURIComponent(config.repo.trim());
  const cleanPath = config.path.trim().replace(/^\/+/, '');
  const branch = config.branch.trim() || 'main';

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;

  const body: Record<string, string> = {
    message: `Sync Kairos data.json (${nowIso})`,
    content: base64Content,
    branch,
  };

  if (effectiveSha) {
    body.sha = effectiveSha;
  }

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token.trim()}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    let errMsg = `خطا در ذخیره روی گیت‌هاب (${putRes.status})`;
    try {
      const errJson = await putRes.json();
      if (errJson?.message) errMsg += `: ${errJson.message}`;
    } catch {}
    throw new Error(errMsg);
  }

  const putJson = await putRes.json();
  const newSha: string = putJson?.content?.sha || effectiveSha || '';

  return {
    sha: newSha,
    mergedData: dataToSave,
    hadConflictResolved,
    updatedAt: nowIso,
  };
}
