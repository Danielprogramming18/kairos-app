import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMenuLayout, featureLocation, moveFeatureAfter, normalizeMenuLayout, orderedMain, reorderFeature, setFeatureLocation, setFeaturePinned } from './menuLayout';

test('new menus have direct project access and fixed capacity with separate device defaults', () => {
  assert.deepEqual(orderedMain(defaultMenuLayout('desktop')), ['dashboard', 'workspace', 'projects', 'calendar', 'pomodoro']);
  assert.deepEqual(orderedMain(defaultMenuLayout('mobile')), ['dashboard', 'workspace', 'projects']);
  assert.equal(featureLocation(defaultMenuLayout('mobile'), 'habits'), 'more');
});
test('mobile promotion requires an explicit replacement when four positions are occupied', () => {
  const initial = setFeatureLocation(defaultMenuLayout('mobile'), 'mobile', 'calendar', 'main');
  assert.equal(initial.status, 'saved'); if (initial.status !== 'saved') return;
  const full = structuredClone(initial.layout);
  const pending = setFeaturePinned(full, 'mobile', 'habits', true);
  assert.equal(pending.status, 'replace_required');
  assert.deepEqual(full, initial.layout, 'pending choice cannot mutate the saved menu');
  const replaced = setFeaturePinned(full, 'mobile', 'habits', true, 'calendar');
  assert.equal(replaced.status, 'saved'); if (replaced.status !== 'saved') return;
  assert.equal(featureLocation(replaced.layout, 'calendar'), 'more');
  assert.ok(replaced.layout.pinned.includes('habits'));
  assert.equal(replaced.layout.main.length, 4);
});
test('pinning preserves a regular main shortcut and order within each group after reopen', () => {
  const initial = defaultMenuLayout('desktop');
  const pinned = setFeaturePinned(initial, 'desktop', 'projects', true);
  assert.equal(pinned.status, 'saved'); if (pinned.status !== 'saved') return;
  assert.deepEqual(orderedMain(pinned.layout), ['projects', 'dashboard', 'workspace', 'calendar', 'pomodoro']);
  const moved = reorderFeature(pinned.layout, 'desktop', 'calendar', -1);
  const reopened = normalizeMenuLayout(JSON.parse(JSON.stringify(moved)), 'desktop');
  assert.deepEqual(orderedMain(reopened), ['projects', 'dashboard', 'calendar', 'workspace', 'pomodoro']);
  const unpinned = setFeaturePinned(reopened, 'desktop', 'projects', false);
  assert.equal(unpinned.status, 'saved'); if (unpinned.status === 'saved') assert.ok(unpinned.layout.main.includes('projects'));
});
test('hide, recover and reset change only the selected layout and preserve application data', () => {
  const app = { projects: [{ id: 'p', title: 'هدف' }], metrics: [{ id: 'm', entries: [12] }], layout: { desktop: defaultMenuLayout('desktop'), mobile: defaultMenuLayout('mobile') } };
  const data = JSON.stringify({ projects: app.projects, metrics: app.metrics, mobile: app.layout.mobile });
  const hidden = setFeatureLocation(app.layout.desktop, 'desktop', 'projects', 'hidden');
  assert.equal(hidden.status, 'saved'); if (hidden.status !== 'saved') return;
  app.layout.desktop = hidden.layout; assert.equal(featureLocation(app.layout.desktop, 'projects'), 'hidden');
  const recovered = setFeatureLocation(app.layout.desktop, 'desktop', 'projects', 'main');
  assert.equal(recovered.status, 'saved'); if (recovered.status === 'saved') app.layout.desktop = recovered.layout;
  app.layout.desktop = defaultMenuLayout('desktop');
  assert.equal(JSON.stringify({ projects: app.projects, metrics: app.metrics, mobile: app.layout.mobile }), data);
});
test('legacy migration preserves known customization and removes fixed management IDs from hidden state', () => {
  const old = { order: ['tracking', 'workspace', 'projects'], pinned: ['tracking'], hidden: ['more', 'customize', 'events'] };
  const next = normalizeMenuLayout(old, 'mobile');
  assert.equal(orderedMain(next)[0], 'tracking');
  assert.equal(next.main.length, 4);
  assert.deepEqual(next.hidden, ['events']);
  assert.deepEqual(normalizeMenuLayout(next, 'mobile'), next);
});
test('drag placement can reach the end and cannot cross a pinned group implicitly', () => {
  const reordered = moveFeatureAfter(defaultMenuLayout('desktop'), 'desktop', 'dashboard', 'pomodoro');
  assert.deepEqual(orderedMain(reordered), ['workspace', 'projects', 'calendar', 'pomodoro', 'dashboard']);
  const pinned = setFeaturePinned(reordered, 'desktop', 'projects', true);
  if (pinned.status === 'saved') assert.throws(() => moveFeatureAfter(pinned.layout, 'desktop', 'projects', 'dashboard'));
});
