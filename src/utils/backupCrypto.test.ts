import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBackupChecksum,
  createPlainBackupEnvelope,
  createEncryptedBackupEnvelope,
  decryptBackupEnvelope,
  validateAndPreviewBackupPayload,
} from './backupCrypto';

test('encrypted export refuses a backup whose Base64 envelope would exceed the import limit', async () => {
  const envelope = createPlainBackupEnvelope(sampleData);
  envelope.payload.notes[0].content = 'آ'.repeat(12 * 1024 * 1024);
  await assert.rejects(() => createEncryptedBackupEnvelope(envelope, 'three test words for size'), /۳۲ میبی‌بایت/);
});

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

test('Canonical BackupEnvelopeV2 round-trip and schema validation preview works and preserves empty arrays (BUG-31, BUG-32, FIX-08)', () => {
  const envelope = createPlainBackupEnvelope(sampleData);
  assert.equal(envelope.appId, 'kairos');
  assert.equal(envelope.app, 'Kairos');
  assert.equal(envelope.formatVersion, 2);
  assert.equal(envelope.schemaVersion, 2);
  assert.equal(envelope.encrypted, false);
  assert.ok(envelope.checksum.startsWith('fnv1a_'));

  const raw = JSON.stringify(envelope);
  const preview = validateAndPreviewBackupPayload(raw);

  assert.equal(preview.valid, true);
  assert.equal(preview.encrypted, false);
  assert.equal(preview.counts?.tasks, 1);
  assert.equal(preview.counts?.habits, 1);
  assert.equal(preview.counts?.habitEntries, 1);
  assert.equal(preview.counts?.ideas, 1);
  assert.equal(preview.counts?.usefulInfos, 0);
  assert.deepEqual(preview.data?.usefulInfos, []);
  assert.deepEqual(preview.envelope?.payload.focusSessions, []);
});

test('Encrypted backup round-trip with PBKDF2 + AES-GCM succeeds with correct password and fails with wrong password or tampered ciphertext (FIX-08)', async () => {
  const encryptedEnvelope = await createEncryptedBackupEnvelope(sampleData, 'a fresh lantern on the roof');
  assert.equal(encryptedEnvelope.formatVersion, 2);
  assert.equal(encryptedEnvelope.schemaVersion, 2);
  assert.equal(encryptedEnvelope.kdf.iterations, 600_000);
  const rawEncrypted = JSON.stringify(encryptedEnvelope);

  // Direct preview detects encryption requirement
  const initialCheck = validateAndPreviewBackupPayload(rawEncrypted);
  assert.equal(initialCheck.valid, false);
  assert.equal(initialCheck.encrypted, true);

  // Wrong password fails cleanly without corrupting state
  const wrongPassResult = await decryptBackupEnvelope(rawEncrypted, 'WrongPassword');
  assert.equal(wrongPassResult.valid, false);
  assert.ok(wrongPassResult.error?.includes('گذرواژه اشتباه است'));

  // Tampered ciphertext fails AES-GCM authentication tag check
  const tamperedEnvelope = {
    ...encryptedEnvelope,
    cipher: {
      ...encryptedEnvelope.cipher,
      ciphertextBase64:
        encryptedEnvelope.cipher.ciphertextBase64.slice(0, -4) + 'AAAA',
    },
  };
  const tamperedResult = await decryptBackupEnvelope(
    JSON.stringify(tamperedEnvelope),
    'a fresh lantern on the roof'
  );
  assert.equal(tamperedResult.valid, false);
  assert.equal(tamperedResult.encrypted, true);

  // Correct password decrypts and validates schema
  const decryptedPreview = await decryptBackupEnvelope(rawEncrypted, 'a fresh lantern on the roof');
  assert.equal(decryptedPreview.valid, true);
  assert.equal(decryptedPreview.counts?.tasks, 1);
  assert.equal(decryptedPreview.data?.tasks[0].title, 'تکمیل معماری کایروس');
});

test('Strict validator rejects malformed JSON, future schemaVersion, tampered checksum, null items, negative duration, invalid dates, and duplicate IDs (FIX-08)', () => {
  // 1. Malformed JSON
  const badJson = validateAndPreviewBackupPayload('{bad json');
  assert.equal(badJson.valid, false);
  assert.ok(badJson.error?.includes('JSON معتبر نیست'));

  // 2. Future incompatible schemaVersion
  const futureVersion = validateAndPreviewBackupPayload(
    JSON.stringify({ app: 'Kairos', schemaVersion: 99, payload: {} })
  );
  assert.equal(futureVersion.valid, false);
  assert.ok(futureVersion.error?.includes('جدیدتر یا ناسازگار'));

  // 3. Tampered checksum on canonical V2 envelope
  const validEnvelope = createPlainBackupEnvelope(sampleData);
  const tamperedChecksumEnvelope = {
    ...validEnvelope,
    payload: {
      ...validEnvelope.payload,
      tasks: [
        {
          ...validEnvelope.payload.tasks[0],
          title: 'عنوان دستکاری‌شده بدون بروزرسانی Checksum',
        },
      ],
    },
  };
  const checksumCheck = validateAndPreviewBackupPayload(
    JSON.stringify(tamperedChecksumEnvelope)
  );
  assert.equal(checksumCheck.valid, false);
  assert.ok(checksumCheck.error?.includes('checksum'));

  // 4. Null element inside tasks array
  const nullTaskPayload = {
    ...validEnvelope.payload,
    tasks: [null as any],
  };
  const nullTaskCheck = validateAndPreviewBackupPayload(
    JSON.stringify({
      ...validEnvelope,
      checksum: computeBackupChecksum(nullTaskPayload),
      payload: nullTaskPayload,
    })
  );
  assert.equal(nullTaskCheck.valid, false);
  assert.ok(nullTaskCheck.errors.some((e) => e.includes('tasks[0]')));

  // 5. Negative duration in task
  const negDurationPayload = {
    ...validEnvelope.payload,
    tasks: [
      {
        ...validEnvelope.payload.tasks[0],
        duration: -15,
      },
    ],
  };
  const negDurationCheck = validateAndPreviewBackupPayload(
    JSON.stringify({
      ...validEnvelope,
      checksum: computeBackupChecksum(negDurationPayload),
      payload: negDurationPayload,
    })
  );
  assert.equal(negDurationCheck.valid, false);
  assert.ok(negDurationCheck.errors.some((e) => e.includes('duration')));

  // 6. Invalid calendar date (e.g. 2026-02-30 or 2026-13-01)
  const badDatePayload = {
    ...validEnvelope.payload,
    tasks: [
      {
        ...validEnvelope.payload.tasks[0],
        targetDate: '2026-02-30',
      },
    ],
  };
  const badDateCheck = validateAndPreviewBackupPayload(
    JSON.stringify({
      ...validEnvelope,
      checksum: computeBackupChecksum(badDatePayload),
      payload: badDatePayload,
    })
  );
  assert.equal(badDateCheck.valid, false);
  assert.ok(badDateCheck.errors.some((e) => e.includes('targetDate')));

  // 7. Duplicate IDs in tasks
  const duplicateTaskPayload = {
    ...validEnvelope.payload,
    tasks: [
      validEnvelope.payload.tasks[0],
      { ...validEnvelope.payload.tasks[0], title: 'کپی با همان شناسه' },
    ],
  };
  const dupCheck = validateAndPreviewBackupPayload(
    JSON.stringify({
      ...validEnvelope,
      checksum: computeBackupChecksum(duplicateTaskPayload),
      payload: duplicateTaskPayload,
    })
  );
  assert.equal(dupCheck.valid, false);
  assert.ok(dupCheck.errors.some((e) => e.includes('شناسهٔ تکراری')));
});

test('Legacy v1 backup format is migrated cleanly to canonical BackupEnvelopeV2 while enforcing strict item validation (FIX-08)', () => {
  const legacyV1 = {
    appId: 'kairos',
    formatVersion: '1.0.0',
    schemaVersion: 1,
    exportedAt: '2026-03-29T10:00:00.000Z',
    data: {
      tasks: [
        {
          id: 't_leg_1',
          title: 'مأموریت نسخه ۱',
          priority: 1,
          duration: 30,
          completed: false,
          targetDate: '2026-03-29',
        },
      ],
      habits: [
        {
          id: 'h_leg_1',
          title: 'عادت نسخه ۱',
          category: 'health',
          weeklyGoal: 4,
          emoji: '💪',
          color: '#10b981',
          completedDates: { '2026-03-29': true },
        },
      ],
      ideas: [],
      usefulInfos: [],
      focusSessions: [],
    },
  };

  const preview = validateAndPreviewBackupPayload(JSON.stringify(legacyV1));
  assert.equal(preview.valid, true);
  assert.equal(preview.migratedFromLegacy, true);
  assert.equal(preview.envelope?.schemaVersion, 2);
  assert.equal(preview.envelope?.payload.tasks.length, 1);
  assert.equal(preview.envelope?.payload.habitEntries.length, 1);
});

test('v2.2.1 encrypted fixture keeps its short password on import only', async () => {
  const legacy = "{\"appId\":\"kairos\",\"app\":\"Kairos\",\"formatVersion\":2,\"schemaVersion\":2,\"exportedAt\":\"2026-11-20T07:39:50.161Z\",\"encrypted\":true,\"kdf\":{\"algorithm\":\"PBKDF2\",\"hash\":\"SHA-256\",\"iterations\":100000,\"saltBase64\":\"VDNZiMWD7/1keThJcUt5gQ==\"},\"cipher\":{\"algorithm\":\"AES-GCM\",\"ivBase64\":\"vqOZ3MCoMk4wkmQr\",\"ciphertextBase64\":\"aM0xfm+X53dSpNv0ksvDqdPHVKMH5e9KzI7+t/yM55LNCf6US5ieWkww5RiHLtf46TfjAC2lsWG3UU6rKYzdL+X7oauqy8FGU0mop35ESGPDhOAZmXwNXEc5lntPoSeG6NBTmeTsBh4h5WoyVYBYZPqwJ86YAh6Y+oWyrr3sVwvb5WRcbIEWZyCy7icvIrjLOVPTsO5RLJkx/odpiWecw8zkUWKlXsSzVUAWEHHkucSsD7t7Bel6JblVQoYeDq+SP4IRzrU+UXji9NXRXOEqXIq2JeJomKgevQYjovggBbJeOWFu1He9oJa2FdRrphbOL+dZ5FfzqaVijha18Ilk8uUudPXt2lSYRGwBlUUD5wjcyw==\"}}";
  assert.equal((await decryptBackupEnvelope(legacy, 'old4')).valid, true);
  for (const password of ['old4', 'passwordpassword', '1234567890123456']) {
    await assert.rejects(createEncryptedBackupEnvelope(sampleData, password), /۱۵/);
  }
});

test('malformed encrypted inputs are rejected before Web Crypto', async (t) => {
  const original = JSON.parse("{\"appId\":\"kairos\",\"app\":\"Kairos\",\"formatVersion\":2,\"schemaVersion\":2,\"exportedAt\":\"2026-11-20T07:39:50.161Z\",\"encrypted\":true,\"kdf\":{\"algorithm\":\"PBKDF2\",\"hash\":\"SHA-256\",\"iterations\":100000,\"saltBase64\":\"VDNZiMWD7/1keThJcUt5gQ==\"},\"cipher\":{\"algorithm\":\"AES-GCM\",\"ivBase64\":\"vqOZ3MCoMk4wkmQr\",\"ciphertextBase64\":\"aM0xfm+X53dSpNv0ksvDqdPHVKMH5e9KzI7+t/yM55LNCf6US5ieWkww5RiHLtf46TfjAC2lsWG3UU6rKYzdL+X7oauqy8FGU0mop35ESGPDhOAZmXwNXEc5lntPoSeG6NBTmeTsBh4h5WoyVYBYZPqwJ86YAh6Y+oWyrr3sVwvb5WRcbIEWZyCy7icvIrjLOVPTsO5RLJkx/odpiWecw8zkUWKlXsSzVUAWEHHkucSsD7t7Bel6JblVQoYeDq+SP4IRzrU+UXji9NXRXOEqXIq2JeJomKgevQYjovggBbJeOWFu1He9oJa2FdRrphbOL+dZ5FfzqaVijha18Ilk8uUudPXt2lSYRGwBlUUD5wjcyw==\"}}");
  const spy = t.mock.method(crypto.subtle, 'importKey', () => { throw Error('unexpected crypto'); });
  const reject = async (input: string) => assert.equal((await decryptBackupEnvelope(input, 'old4')).valid, false);
  for (const iterations of [2147483647, 600001, 99999, -1, 0, 100000.5, '100000', null, undefined]) {
    await reject(JSON.stringify({...original, kdf: {...original.kdf, iterations}}));
  }
  for (const [section, patch] of [
    ['kdf', {saltBase64: 'AA=='}], ['kdf', {algorithm: 'other'}], ['kdf', {hash: 'SHA-1'}],
    ['cipher', {ivBase64: 'A==='}], ['cipher', {ciphertextBase64: 'bad!'}],
    ['cipher', {ciphertextBase64: 'AAAA'}], ['cipher', {algorithm: 'other'}],
  ] as const) await reject(JSON.stringify({...original, [section]: {...original[section], ...patch}}));
  for (const patch of [{appId:'other'}, {app:undefined}, {schemaVersion:3}, {formatVersion:'2'},
    {exportedAt:null}, {cipher:null}, {kdf:null}, {encrypted:false}]) await reject(JSON.stringify({...original,...patch}));
  await reject(' '.repeat(32 * 1024 * 1024 + 1));
  assert.equal(spy.mock.callCount(), 0);
});
