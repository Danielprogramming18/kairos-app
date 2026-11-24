import type {ReminderHost} from './repositories';
import type {NativeReminder} from '../domain/reminders';
import {BridgeProtocolError} from '../infrastructure/bridge/protocol';

export type ReminderStatus = 'scheduled' | 'permission' | 'unsupported' | 'unconfirmed';
export const reminderMessages: Record<ReminderStatus,string> = {
  scheduled: 'اندروید زمان‌بندی اعلان را تأیید کرد.',
  permission: 'یادآوری ذخیره شد. برای دریافت اعلان، مجوز اندروید را فعال کن.',
  unsupported: 'تنظیم یادآوری ذخیره شد. زمان‌بندی اعلان اندروید در این نسخه در دسترس نیست.',
  unconfirmed: 'تنظیم یادآوری ذخیره شد. اندروید زمان‌بندی یا لغو اعلان را تأیید نکرد.',
};

export function statusForError(error: unknown): ReminderStatus {
  if (error instanceof BridgeProtocolError) {
    if (['UNKNOWN_OPERATION','BRIDGE_UNAVAILABLE','REMINDER_UNAVAILABLE'].includes(error.code)) return 'unsupported';
    if (error.code === 'NOTIFICATION_PERMISSION_DENIED') return 'permission';
  }
  return 'unconfirmed';
}

export async function syncReminders(host:ReminderHost | undefined, desired:NativeReminder[]) {
  const statuses: Record<string,ReminderStatus> = Object.create(null);
  const result = (fallback?:ReminderStatus, cancelFailed=false) => ({statuses,fallback,cancelFailed});
  if (!host) return result('unsupported');
  try {
    const permission = await host.permission();
    if (permission === 'unsupported') return result('unsupported');
    const inventory = await host.list();
    if (!Array.isArray(inventory?.ids) || !inventory.ids.every(id=>typeof id==='string')) return result('unconfirmed');
    const wanted = new Set(desired.map(reminder=>reminder.id));
    const allowed = permission === 'granted';
    let cancelFailed = false;
    for (const id of new Set(inventory.ids)) {
      if (!/^kairos:(task|event):.+$/.test(id) || (allowed && wanted.has(id))) continue;
      try {
        const reply = await host.cancel(id);
        if (reply?.status !== 'cancelled' || reply.id !== id) cancelFailed = true;
      } catch { cancelFailed = true; }
    }
    if (!allowed) return result('permission',cancelFailed);
    for (const reminder of desired) {
      try {
        const reply = await host.schedule(reminder);
        statuses[reminder.id] = reply?.status === 'scheduled' && reply.id === reminder.id ? 'scheduled' : 'unconfirmed';
      } catch (error) { statuses[reminder.id] = statusForError(error); }
    }
    return result(undefined,cancelFailed);
  } catch (error) {
    return result(statusForError(error));
  }
}
