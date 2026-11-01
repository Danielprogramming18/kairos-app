import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MediaQueryListLike,
  migrateLegacyThemeSettings,
  neutralizeLegacyLocalStorageTheme,
  parseHostThemeFromUrl,
  resolveDeviceTheme,
  subscribeToDeviceThemeChanges,
} from './themeManager';
import { UserSettingsEntity } from '../domain/models';

class MockMediaQueryList implements MediaQueryListLike {
  public matches: boolean;
  public readonly media = '(prefers-color-scheme: dark)';
  private listeners = new Set<(ev: { matches: boolean }) => void>();

  constructor(initialMatches: boolean) {
    this.matches = initialMatches;
  }

  addEventListener(_type: 'change', listener: (ev: { matches: boolean }) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: (ev: { matches: boolean }) => void): void {
    this.listeners.delete(listener);
  }

  setMatches(next: boolean): void {
    this.matches = next;
    for (const fn of this.listeners) {
      fn({ matches: next });
    }
  }
}

test('resolveDeviceTheme defaults to light when matchMedia is unavailable or unsupported', () => {
  assert.equal(resolveDeviceTheme({}), 'light');
  assert.equal(
    resolveDeviceTheme({
      matchMedia: () => ({ matches: true, media: 'not all' }),
    }),
    'light'
  );
  assert.equal(
    resolveDeviceTheme({
      matchMedia: () => {
        throw new Error('matchMedia unsupported');
      },
    }),
    'light'
  );
});

test('resolveDeviceTheme follows prefers-color-scheme for both light and dark device preferences', () => {
  const lightMql = new MockMediaQueryList(false);
  assert.equal(resolveDeviceTheme({ matchMedia: () => lightMql }), 'light');

  const darkMql = new MockMediaQueryList(true);
  assert.equal(resolveDeviceTheme({ matchMedia: () => darkMql }), 'dark');
});

test('subscribeToDeviceThemeChanges notifies live when prefers-color-scheme toggles', () => {
  const mql = new MockMediaQueryList(false);
  const observed: string[] = [];

  const unsubscribe = subscribeToDeviceThemeChanges(
    (theme) => {
      observed.push(theme);
    },
    { matchMedia: () => mql }
  );

  mql.setMatches(true);
  assert.deepEqual(observed, ['dark']);

  mql.setMatches(false);
  assert.deepEqual(observed, ['dark', 'light']);

  unsubscribe();
  mql.setMatches(true);
  assert.deepEqual(observed, ['dark', 'light']);
});

test('resolveDeviceTheme respects Android WebView hostThemeOverride or URL query when provided', () => {
  const lightMql = new MockMediaQueryList(false);
  assert.equal(
    resolveDeviceTheme({
      matchMedia: () => lightMql,
      hostThemeOverride: 'dark',
    }),
    'dark'
  );

  assert.equal(
    resolveDeviceTheme({
      matchMedia: () => lightMql,
      locationSearch: '?hostTheme=dark',
    }),
    'dark'
  );

  assert.equal(parseHostThemeFromUrl('?hostTheme=light', ''), 'light');
  assert.equal(parseHostThemeFromUrl('', '#/today?hostTheme=dark'), 'dark');
  assert.equal(parseHostThemeFromUrl('?other=1', '#/today'), null);
});

test('migrateLegacyThemeSettings neutralizes manual light/dark theme to system while preserving all other user settings', () => {
  const legacyDarkSettings: UserSettingsEntity = {
    id: 'default',
    theme: 'dark',
    soundEnabled: false,
    pomodoroWorkMinutes: 50,
    pomodoroShortBreakMinutes: 10,
    pomodoroLongBreakMinutes: 25,
    pomodoroCyclesBeforeLongBreak: 3,
    calendarPreference: 'jalali',
    updatedAt: '2026-03-30T10:00:00.000Z',
  };

  const migratedDark = migrateLegacyThemeSettings(legacyDarkSettings);
  assert.equal(migratedDark.migrated, true);
  assert.equal(migratedDark.settings.theme, 'system');
  assert.equal(migratedDark.settings.soundEnabled, false);
  assert.equal(migratedDark.settings.pomodoroWorkMinutes, 50);
  assert.equal(migratedDark.settings.pomodoroShortBreakMinutes, 10);
  assert.equal(migratedDark.settings.pomodoroLongBreakMinutes, 25);
  assert.equal(migratedDark.settings.pomodoroCyclesBeforeLongBreak, 3);
  assert.equal(migratedDark.settings.calendarPreference, 'jalali');

  const alreadySystem = migrateLegacyThemeSettings(migratedDark.settings);
  assert.equal(alreadySystem.migrated, false);
  assert.equal(alreadySystem.settings.theme, 'system');
});

test('neutralizeLegacyLocalStorageTheme neutralizes legacy manual theme keys without touching sound or user data keys', () => {
  const store = new Map<string, string>([
    ['nazmyar_theme', 'dark'],
    ['kairos_theme', 'light'],
    ['nazmyar_sound', 'false'],
    ['nazmyar_danial_tasks_v1', '[{"id":"t1","title":"Preserve me"}]'],
  ]);

  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };

  const changed = neutralizeLegacyLocalStorageTheme(mockStorage);
  assert.equal(changed, true);
  assert.equal(store.get('nazmyar_theme'), 'system');
  assert.equal(store.has('kairos_theme'), false);
  assert.equal(store.get('nazmyar_sound'), 'false');
  assert.equal(store.get('nazmyar_danial_tasks_v1'), '[{"id":"t1","title":"Preserve me"}]');
});
