import { Habit, Task, Idea, FocusSession, UsefulInfoItem } from '../types';

export interface KairosPlainBackupEnvelope {
  appId: 'kairos';
  app: 'Kairos';
  formatVersion: '1.0.0';
  schemaVersion: number;
  exportedAt: string;
  encrypted: false;
  data: {
    habits: Habit[];
    tasks: Task[];
    ideas: Idea[];
    focusSessions: FocusSession[];
    usefulInfos: UsefulInfoItem[];
  };
}

export interface KairosEncryptedBackupEnvelope {
  appId: 'kairos';
  app: 'Kairos';
  formatVersion: '1.0.0';
  schemaVersion: number;
  exportedAt: string;
  encrypted: true;
  kdf: {
    algorithm: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    saltBase64: string;
  };
  cipher: {
    algorithm: 'AES-GCM';
    ivBase64: string;
    ciphertextBase64: string;
  };
}

export interface BackupPreviewSummary {
  valid: boolean;
  encrypted: boolean;
  error?: string;
  exportedAt?: string;
  counts?: {
    tasks: number;
    habits: number;
    ideas: number;
    usefulInfos: number;
    focusSessions: number;
  };
  data?: {
    habits: Habit[];
    tasks: Task[];
    ideas: Idea[];
    focusSessions: FocusSession[];
    usefulInfos: UsefulInfoItem[];
  };
}

const MAX_BACKUP_BYTES = 10 * 1024 * 1024; // 10 MB safety limit
const PBKDF2_ITERATIONS = 100_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesGcmKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Creates a standard versioned plain JSON backup envelope.
 */
export function createPlainBackupEnvelope(data: {
  habits: Habit[];
  tasks: Task[];
  ideas: Idea[];
  focusSessions: FocusSession[];
  usefulInfos: UsefulInfoItem[];
}): KairosPlainBackupEnvelope {
  return {
    appId: 'kairos',
    app: 'Kairos',
    formatVersion: '1.0.0',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    encrypted: false,
    data: {
      habits: Array.isArray(data.habits) ? data.habits : [],
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      ideas: Array.isArray(data.ideas) ? data.ideas : [],
      focusSessions: Array.isArray(data.focusSessions) ? data.focusSessions : [],
      usefulInfos: Array.isArray(data.usefulInfos) ? data.usefulInfos : [],
    },
  };
}

/**
 * Encrypts backup data using Web Crypto API PBKDF2-SHA256 + AES-256-GCM
 * with a random 16-byte salt and unique 12-byte IV.
 */
export async function createEncryptedBackupEnvelope(
  data: {
    habits: Habit[];
    tasks: Task[];
    ideas: Idea[];
    focusSessions: FocusSession[];
    usefulInfos: UsefulInfoItem[];
  },
  password: string
): Promise<KairosEncryptedBackupEnvelope> {
  if (!password || password.trim().length < 4) {
    throw new Error('گذرواژهٔ رمزگذاری باید حداقل ۴ کاراکتر باشد.');
  }

  const plainEnvelope = createPlainBackupEnvelope(data);
  const plaintextBytes = new TextEncoder().encode(JSON.stringify(plainEnvelope));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(password, salt, PBKDF2_ITERATIONS);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintextBytes as BufferSource
  );

  return {
    appId: 'kairos',
    app: 'Kairos',
    formatVersion: '1.0.0',
    schemaVersion: 2,
    exportedAt: plainEnvelope.exportedAt,
    encrypted: true,
    kdf: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      saltBase64: bytesToBase64(salt),
    },
    cipher: {
      algorithm: 'AES-GCM',
      ivBase64: bytesToBase64(iv),
      ciphertextBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
    },
  };
}

/**
 * Decrypts an AES-256-GCM encrypted backup envelope using the user's password.
 */
export async function decryptBackupEnvelope(
  rawJson: string,
  password: string
): Promise<BackupPreviewSummary> {
  try {
    const parsed = JSON.parse(rawJson) as KairosEncryptedBackupEnvelope;
    if (!parsed || parsed.encrypted !== true || !parsed.kdf || !parsed.cipher) {
      return { valid: false, encrypted: false, error: 'ساختار فایل پشتیبان رمزگذاری‌شده معتبر نیست.' };
    }
    const salt = base64ToBytes(parsed.kdf.saltBase64);
    const iv = base64ToBytes(parsed.cipher.ivBase64);
    const ciphertext = base64ToBytes(parsed.cipher.ciphertextBase64);
    const iterations = Number(parsed.kdf.iterations) || PBKDF2_ITERATIONS;

    const key = await deriveAesGcmKey(password, salt, iterations);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    const plainText = new TextDecoder().decode(plainBuffer);
    return validateAndPreviewBackupPayload(plainText);
  } catch {
    return {
      valid: false,
      encrypted: true,
      error: 'گذرواژه اشتباه است یا فایل پشتیبان رمزگذاری‌شده آسیب دیده است.',
    };
  }
}

/**
 * Validates raw JSON backup string (size, version, duplicate IDs, required fields)
 * and produces a structured preview summary before any restore is committed.
 */
export function validateAndPreviewBackupPayload(rawJson: string): BackupPreviewSummary {
  if (!rawJson || typeof rawJson !== 'string') {
    return { valid: false, encrypted: false, error: 'فایل پشتیبان خالی است.' };
  }
  if (rawJson.length > MAX_BACKUP_BYTES) {
    return { valid: false, encrypted: false, error: 'حجم فایل پشتیبان بیش از حد مجاز (۱۰ مگابایت) است.' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { valid: false, encrypted: false, error: 'فایل انتخاب‌شده یک JSON معتبر نیست.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, encrypted: false, error: 'ساختار ریشهٔ فایل پشتیبان نامعتبر است.' };
  }

  if (parsed.encrypted === true) {
    return {
      valid: false,
      encrypted: true,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
      error: 'این فایل پشتیبان رمزگذاری شده است. لطفاً گذرواژهٔ آن را وارد کنید.',
    };
  }

  if (parsed.schemaVersion !== undefined && Number(parsed.schemaVersion) > 2) {
    return {
      valid: false,
      encrypted: false,
      error: 'نسخهٔ قالب این پشتیبان جدیدتر از نسخهٔ فعلی برنامه است و پشتیبانی نمی‌شود.',
    };
  }

  const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  if (!Array.isArray(data.tasks) || !Array.isArray(data.habits)) {
    return {
      valid: false,
      encrypted: false,
      error: 'فایل پشتیبان فاقد آرایه‌های ضروری مأموریت‌ها (tasks) و عادت‌ها (habits) است.',
    };
  }

  const tasks: Task[] = [];
  const seenTaskIds = new Set<string>();
  for (const t of data.tasks) {
    if (!t || typeof t.id !== 'string' || typeof t.title !== 'string' || !t.title.trim()) {
      return { valid: false, encrypted: false, error: 'یکی از مأموریت‌های داخل فایل پشتیبان فاقد شناسه یا عنوان معتبر است.' };
    }
    if (seenTaskIds.has(t.id)) {
      continue; // Deduplicate safely
    }
    seenTaskIds.add(t.id);
    tasks.push(t);
  }

  const habits: Habit[] = [];
  const seenHabitIds = new Set<string>();
  for (const h of data.habits) {
    if (!h || typeof h.id !== 'string' || typeof h.title !== 'string' || !h.title.trim()) {
      return { valid: false, encrypted: false, error: 'یکی از عادت‌های داخل فایل پشتیبان فاقد شناسه یا عنوان معتبر است.' };
    }
    if (seenHabitIds.has(h.id)) {
      continue;
    }
    seenHabitIds.add(h.id);
    habits.push({
      ...h,
      completedDates: h.completedDates && typeof h.completedDates === 'object' ? h.completedDates : {},
    });
  }

  const ideas: Idea[] = Array.isArray(data.ideas)
    ? data.ideas.filter((i: any) => i && typeof i.id === 'string' && typeof i.title === 'string')
    : [];
  const usefulInfos: UsefulInfoItem[] = Array.isArray(data.usefulInfos)
    ? data.usefulInfos.filter(
        (u: any) => u && typeof u.id === 'string' && typeof u.title === 'string' && typeof u.content === 'string'
      )
    : [];
  const focusSessions: FocusSession[] = Array.isArray(data.focusSessions)
    ? data.focusSessions.filter((f: any) => f && typeof f.id === 'string')
    : [];

  return {
    valid: true,
    encrypted: false,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : parsed.updatedAt,
    counts: {
      tasks: tasks.length,
      habits: habits.length,
      ideas: ideas.length,
      usefulInfos: usefulInfos.length,
      focusSessions: focusSessions.length,
    },
    data: {
      habits,
      tasks,
      ideas,
      focusSessions,
      usefulInfos,
    },
  };
}
