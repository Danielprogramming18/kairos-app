import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyThemeToDocument,
  DARK_MEDIA_QUERY,
  LEGACY_THEME_STORAGE_KEY,
  migrateLegacyThemeSettings,
  normalizeThemePreference,
  persistThemePreferenceToStorage,
  readStoredThemePreference,
  registerGlobalHostThemeBridge,
  resolveDeviceTheme,
  resolveEffectiveTheme,
  subscribeToDeviceThemeChanges,
  THEME_PREFERENCE_STORAGE_KEY,
} from './themeManager';
import { UserSettingsEntity } from '../domain/models';

test('fresh install defaults to system preference, and undetectable system theme defaults to light', () => {
  assert.equal(normalizeThemePreference(undefined), 'system');
  assert.equal(normalizeThemePreference(null), 'system');
  assert.equal(normalizeThemePreference('invalid'), 'system');

  assert.equal(resolveDeviceTheme({}), 'light');
  assert.equal(
    resolveDeviceTheme({
      matchMedia: () => ({ matches: true, media: 'not all' }),
    }),
    'light'
  );
  assert.equal(resolveEffectiveTheme('system', {}), 'light');
});

test('resolveEffectiveTheme keeps manual light/dark independent of system theme and follows system when set to system', () => {
  const darkSystemEnv = {
    matchMedia: (q: string) => ({
      matches: q === DARK_MEDIA_QUERY,
      media: q,
    }),
  };
  const lightSystemEnv = {
    matchMedia: (q: string) => ({
      matches: false,
      media: q,
    }),
  };

  // Manual light stays light even when OS is dark
  assert.equal(resolveEffectiveTheme('light', darkSystemEnv), 'light');
  assert.equal(resolveEffectiveTheme('light', lightSystemEnv), 'light');

  // Manual dark stays dark even when OS is light
  assert.equal(resolveEffectiveTheme('dark', lightSystemEnv), 'dark');
  assert.equal(resolveEffectiveTheme('dark', darkSystemEnv), 'dark');

  // System mode follows OS preference
  assert.equal(resolveEffectiveTheme('system', darkSystemEnv), 'dark');
  assert.equal(resolveEffectiveTheme('system', lightSystemEnv), 'light');
});

test('subscribeToDeviceThemeChanges notifies live when prefers-color-scheme toggles', () => {
  let isDark = false;
  const listeners: Array<(ev: { matches: boolean }) => void> = [];

  const env = {
    matchMedia: (query: string) => ({
      get matches() {
        return query === DARK_MEDIA_QUERY ? isDark : false;
      },
      media: query,
      addEventListener: (_type: 'change', fn: (ev: { matches: boolean }) => void) => {
        listeners.push(fn);
      },
      removeEventListener: (_type: 'change', fn: (ev: { matches: boolean }) => void) => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    }),
  };

  const observed: string[] = [];
  const unsubscribe = subscribeToDeviceThemeChanges(
    (theme) => {
      observed.push(theme);
    },
    env,
    undefined
  );

  isDark = true;
  listeners.forEach((fn) => fn({ matches: true }));
  assert.deepEqual(observed, ['dark']);

  isDark = false;
  listeners.forEach((fn) => fn({ matches: false }));
  assert.deepEqual(observed, ['dark', 'light']);

  unsubscribe();
  assert.equal(listeners.length, 0);
});

test('registerGlobalHostThemeBridge does not overwrite manual light or dark selection when system theme message arrives', () => {
  const classSet = new Set<string>();
  const attrs = new Map<string, string>();
  const fakeDoc = {
    documentElement: {
      classList: {
        toggle: (cls: string, force?: boolean) => {
          if (force) classSet.add(cls);
          else classSet.delete(cls);
        },
        contains: (cls: string) => classSet.has(cls),
      },
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      getAttribute: (k: string) => attrs.get(k) ?? null,
      style: { colorScheme: '' },
    },
  } as unknown as Document;

  const fakeWin = {
    matchMedia: () => ({ matches: false, media: DARK_MEDIA_QUERY }),
    location: { search: '', hash: '' },
    dispatchEvent: () => true,
  } as unknown as Window;

  registerGlobalHostThemeBridge(fakeWin, fakeDoc);

  // User manually selects 'light'
  applyThemeToDocument('light', 'light', fakeDoc);
  assert.equal(attrs.get('data-theme'), 'light');
  assert.equal(attrs.get('data-theme-preference'), 'light');

  // System sends 'dark' host message -> manual 'light' must NOT be overwritten
  const effectiveAfterDarkMsg = fakeWin.__KAIROS_SET_HOST_THEME__!('dark');
  assert.equal(effectiveAfterDarkMsg, 'light');
  assert.equal(attrs.get('data-theme'), 'light');
  assert.equal(classSet.has('dark'), false);

  // User switches to 'system' -> now host 'dark' takes effect immediately
  applyThemeToDocument(resolveEffectiveTheme('system', { hostThemeOverride: 'dark' }), 'system', fakeDoc);
  assert.equal(attrs.get('data-theme'), 'dark');
  assert.equal(classSet.has('dark'), true);

  // Host switches to 'light' while in 'system' mode -> updates to 'light'
  const effectiveAfterLightMsg = fakeWin.__KAIROS_SET_HOST_THEME__!('light');
  assert.equal(effectiveAfterLightMsg, 'light');
  assert.equal(attrs.get('data-theme'), 'light');
  assert.equal(classSet.has('dark'), false);
});

test('migrateLegacyThemeSettings preserves valid user theme preferences and all other settings without data loss', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };

  const darkSettings: UserSettingsEntity = {
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

  const migratedDark = migrateLegacyThemeSettings(darkSettings, mockStorage);
  assert.equal(migratedDark.migrated, false);
  assert.equal(migratedDark.settings.theme, 'dark');
  assert.equal(migratedDark.settings.soundEnabled, false);
  assert.equal(migratedDark.settings.pomodoroWorkMinutes, 50);
  assert.equal(store.get(THEME_PREFERENCE_STORAGE_KEY), 'dark');
  assert.equal(store.get(LEGACY_THEME_STORAGE_KEY), 'dark');

  // Legacy localStorage fallback when settings.theme is missing/corrupted
  store.clear();
  store.set(LEGACY_THEME_STORAGE_KEY, 'light');
  const corruptedSettings = {
    ...darkSettings,
    theme: 'unknown_legacy' as any,
  };
  const recovered = migrateLegacyThemeSettings(corruptedSettings, mockStorage);
  assert.equal(recovered.migrated, true);
  assert.equal(recovered.settings.theme, 'light');
  assert.equal(recovered.settings.soundEnabled, false);
  assert.equal(recovered.settings.pomodoroWorkMinutes, 50);

  //Persist and read roundtrip
  persistThemePreferenceToStorage('system', mockStorage);
  assert.equal(readStoredThemePreference(mockStorage), 'system');
});
