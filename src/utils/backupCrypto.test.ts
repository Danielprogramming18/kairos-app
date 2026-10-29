import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlainBackupEnvelope,
  createEncryptedBackupEnvelope,
  decryptBackupEnvelope,
  validateAndPreviewBackupPayload,
} from './backupCrypto';

const sampleData = {
  habits: [
    {
      id: 'h1',
      title: 'مطالعه روزانه',
      category: 'learning' as const,
      weeklyGoal: 5,
      emoji: '📚',
      color: '#6366f1',
      completedDates: { '2026-10-29': true },
    },
  ],
  tasks: [
    {
      id: 't1',
      title: 'تکمیل معماری کایروس',
      priority: 1,
      duration: 45,
      completed: false,
      targetDate: '2026-10-29',
    },
  ],
  ideas: [
    {
      id: 'i1',
      title: 'ایده تستی',
      category: 'project' as const,
      createdAt: '۷ آبان',
    },
  ],
  focusSessions: [],
  usefulInfos: [],
};

test('Plain backup round-trip and schema validation preview works and preserves empty arrays (BUG-31, BUG-32)', () => {
  const envelope = createPlainBackupEnvelope(sampleData);
  const raw = JSON.stringify(envelope);
  const preview = validateAndPreviewBackupPayload(raw);

  assert.equal(preview.valid, true);
  assert.equal(preview.encrypted, false);
  assert.equal(preview.counts?.tasks, 1);
  assert.equal(preview.counts?.habits, 1);
  assert.equal(preview.counts?.usefulInfos, 0);
  assert.deepEqual(preview.data?.usefulInfos, []);
});

test('Encrypted backup round-trip with PBKDF2 + AES-GCM succeeds with correct password and fails with wrong password', async () => {
  const encryptedEnvelope = await createEncryptedBackupEnvelope(sampleData, 'SecretPass123!');
  const rawEncrypted = JSON.stringify(encryptedEnvelope);

  // Direct preview detects encryption requirement
  const initialCheck = validateAndPreviewBackupPayload(rawEncrypted);
  assert.equal(initialCheck.valid, false);
  assert.equal(initialCheck.encrypted, true);

  // Wrong password fails cleanly without corrupting state
  const wrongPassResult = await decryptBackupEnvelope(rawEncrypted, 'WrongPassword');
  assert.equal(wrongPassResult.valid, false);
  assert.ok(wrongPassResult.error?.includes('گذرواژه اشتباه است'));

  // Correct password decrypts and validates schema
  const decryptedPreview = await decryptBackupEnvelope(rawEncrypted, 'SecretPass123!');
  assert.equal(decryptedPreview.valid, true);
  assert.equal(decryptedPreview.counts?.tasks, 1);
  assert.equal(decryptedPreview.data?.tasks[0].title, 'تکمیل معماری کایروس');
});
