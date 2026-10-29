/**
 * Versioned JSON Async Bridge Protocol for Android (Sketchware WebView) & Windows Desktop (Tauri/Host)
 * Security rules:
 * - No eval / dynamic script execution
 * - No raw SQL over bridge (only whitelisted semantic operations)
 * - Strict schema, version, origin, and payload-size validation
 */

import { createEntityId } from '../../domain/models';

export const BRIDGE_CONTRACT_VERSION = '1.0.0';
export const MAX_BRIDGE_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB max payload
export const DEFAULT_BRIDGE_TIMEOUT_MS = 8000;

export type BridgeOperation =
  | 'bridge.handshake'
  | 'tasks.list'
  | 'tasks.getById'
  | 'tasks.upsert'
  | 'tasks.upsertBatch'
  | 'tasks.softDelete'
  | 'tasks.restore'
  | 'habits.list'
  | 'habits.getById'
  | 'habits.upsert'
  | 'habits.toggleDate'
  | 'habits.listEntries'
  | 'habits.softDelete'
  | 'notes.list'
  | 'notes.upsert'
  | 'notes.softDelete'
  | 'focus.listSessions'
  | 'focus.logSession'
  | 'focus.getActiveTimer'
  | 'focus.saveActiveTimer'
  | 'settings.get'
  | 'settings.save'
  | 'backup.export'
  | 'backup.restore'
  | 'notifications.getPermission'
  | 'notifications.requestPermission'
  | 'notifications.scheduleReminder'
  | 'notifications.cancelReminder';

export const ALLOWED_BRIDGE_OPERATIONS = new Set<BridgeOperation>([
  'bridge.handshake',
  'tasks.list',
  'tasks.getById',
  'tasks.upsert',
  'tasks.upsertBatch',
  'tasks.softDelete',
  'tasks.restore',
  'habits.list',
  'habits.getById',
  'habits.upsert',
  'habits.toggleDate',
  'habits.listEntries',
  'habits.softDelete',
  'notes.list',
  'notes.upsert',
  'notes.softDelete',
  'focus.listSessions',
  'focus.logSession',
  'focus.getActiveTimer',
  'focus.saveActiveTimer',
  'settings.get',
  'settings.save',
  'backup.export',
  'backup.restore',
  'notifications.getPermission',
  'notifications.requestPermission',
  'notifications.scheduleReminder',
  'notifications.cancelReminder',
]);

export type BridgeErrorCode =
  | 'BRIDGE_UNAVAILABLE'
  | 'VERSION_MISMATCH'
  | 'INVALID_ORIGIN'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNKNOWN_OPERATION'
  | 'VALIDATION_ERROR'
  | 'TIMEOUT'
  | 'STORAGE_ERROR';

export interface BridgeRequestEnvelope<TPayload = unknown> {
  requestId: string;
  version: string;
  operation: BridgeOperation;
  payload: TPayload;
  sentAt: string;
}

export interface BridgeErrorObject {
  code: BridgeErrorCode;
  message: string;
}

export interface BridgeResponseEnvelope<TData = unknown> {
  requestId: string;
  version: string;
  ok: boolean;
  data?: TData;
  error?: BridgeErrorObject;
}

export class BridgeProtocolError extends Error {
  public readonly code: BridgeErrorCode;

  constructor(code: BridgeErrorCode, message: string) {
    super(message);
    this.name = 'BridgeProtocolError';
    this.code = code;
  }
}

/**
 * Validates an outgoing or incoming bridge request envelope.
 */
export function validateBridgeRequest(
  raw: unknown,
  allowedOrigins?: string[],
  sourceOrigin?: string
): BridgeRequestEnvelope {
  if (allowedOrigins && sourceOrigin && !allowedOrigins.includes(sourceOrigin)) {
    throw new BridgeProtocolError(
      'INVALID_ORIGIN',
      `پیام پل ارتباطی از مبدأ غیرمجاز (${sourceOrigin}) رد شد.`
    );
  }

  const serialized = typeof raw === 'string' ? raw : JSON.stringify(raw ?? {});
  if (serialized.length > MAX_BRIDGE_PAYLOAD_BYTES) {
    throw new BridgeProtocolError(
      'PAYLOAD_TOO_LARGE',
      `حجم پیام پل ارتباطی بیش از حد مجاز (${MAX_BRIDGE_PAYLOAD_BYTES} بایت) است.`
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
  } catch {
    throw new BridgeProtocolError('VALIDATION_ERROR', 'ساختار JSON پیام پل ارتباطی نامعتبر است.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new BridgeProtocolError('VALIDATION_ERROR', 'بدنهٔ درخواست پل ارتباطی تهی یا نامعتبر است.');
  }

  if (typeof parsed.requestId !== 'string' || !parsed.requestId.trim()) {
    throw new BridgeProtocolError('VALIDATION_ERROR', 'شناسهٔ درخواست (requestId) الزامی است.');
  }

  if (parsed.version !== BRIDGE_CONTRACT_VERSION) {
    throw new BridgeProtocolError(
      'VERSION_MISMATCH',
      `نسخهٔ قرارداد پل ارتباطی (${String(parsed.version)}) با نسخهٔ مورد انتظار (${BRIDGE_CONTRACT_VERSION}) همخوانی ندارد.`
    );
  }

  if (
    typeof parsed.operation !== 'string' ||
    !ALLOWED_BRIDGE_OPERATIONS.has(parsed.operation as BridgeOperation)
  ) {
    throw new BridgeProtocolError(
      'UNKNOWN_OPERATION',
      `عملیات درخواستی (${String(parsed.operation)}) در لیست سفید پل ارتباطی قرار ندارد.`
    );
  }

  return {
    requestId: parsed.requestId,
    version: parsed.version,
    operation: parsed.operation as BridgeOperation,
    payload: parsed.payload,
    sentAt: typeof parsed.sentAt === 'string' ? parsed.sentAt : new Date().toISOString(),
  };
}

/**
 * Creates a strictly typed bridge request envelope.
 */
export function createBridgeRequest<TPayload>(
  operation: BridgeOperation,
  payload: TPayload
): BridgeRequestEnvelope<TPayload> {
  const env: BridgeRequestEnvelope<TPayload> = {
    requestId: createEntityId('req'),
    version: BRIDGE_CONTRACT_VERSION,
    operation,
    payload,
    sentAt: new Date().toISOString(),
  };
  validateBridgeRequest(env);
  return env;
}
