import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runSubsystemSelfDiagnostics,
  getPlatformHandoffSnippets,
} from './releaseReadiness';

test('runSubsystemSelfDiagnostics executes all 6 subsystem checks and passes with mock storage port', async () => {
  const summary = await runSubsystemSelfDiagnostics({
    verifyStorageHealth: async () => ({
      healthy: true,
      engine: 'indexeddb_dexie',
    }),
  });

  assert.equal(summary.checks.length, 6);
  const checkIds = summary.checks.map((c) => c.id);
  assert.deepEqual(checkIds, [
    'storage_check',
    'backup_contract_check',
    'crypto_check',
    'calendar_check',
    'nlp_check',
    'offline_bundle_check',
  ]);

  // Verify the storage, backup, crypto, calendar, and nlp checks all pass in Node
  const coreChecks = summary.checks.filter((c) => c.id !== 'offline_bundle_check');
  for (const check of coreChecks) {
    assert.equal(check.passed, true, `Expected ${check.id} to pass: ${check.detailFa}`);
  }
});

test('runSubsystemSelfDiagnostics reports failed storage_check if storage port throws', async () => {
  const summary = await runSubsystemSelfDiagnostics({
    verifyStorageHealth: async () => {
      throw new Error('Disk full');
    },
  });

  const storageCheck = summary.checks.find((c) => c.id === 'storage_check');
  assert.ok(storageCheck);
  assert.equal(storageCheck.passed, false);
  assert.ok(storageCheck.detailFa.includes('Disk full'));
});

test('getPlatformHandoffSnippets returns Sketchware WebSettings Java snippet and Windows build commands', () => {
  const snippets = getPlatformHandoffSnippets();
  assert.ok(snippets.sketchwareWebSettingsJava.includes('setDomStorageEnabled(true)'));
  assert.ok(
    snippets.sketchwareWebSettingsJava.includes('file:///android_asset/www/index.html')
  );
  assert.ok(snippets.windowsBuildCommands.includes('npm run build'));
});
