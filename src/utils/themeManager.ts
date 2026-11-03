import { UserSettingsEntity } from '../domain/models';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface MediaQueryListLike {
  readonly matches: boolean;
  readonly media: string;
  addEventListener?: (type: 'change', listener: (ev: { matches: boolean }) => void) => void;
  removeEventListener?: (type: 'change', listener: (ev: { matches: boolean }) => void) => void;
  addListener?: (listener: (ev: { matches: boolean }) => void) => void;
  removeListener?: (listener: (ev: { matches: boolean }) => void) => void;
}

export interface ThemeEnvironmentLike {
  matchMedia?: (query: string) => MediaQueryListLike;
  hostThemeOverride?: ResolvedTheme | null;
  locationSearch?: string;
  locationHash?: string;
}

declare global {
  interface Window {
    __KAIROS_HOST_THEME__?: ResolvedTheme | null;
    __KAIROS_SET_HOST_THEME__?: (theme: ResolvedTheme | null) => ResolvedTheme;
  }
}

export const HOST_THEME_CHANGE_EVENT = 'kairos:host-theme-change';
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';
export const THEME_PREFERENCE_STORAGE_KEY = 'kairos_theme_preference';
export const LEGACY_THEME_STORAGE_KEY = 'nazmyar_theme';

export const THEME_PREFERENCE_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  labelFa: string;
  descriptionFa: string;
}> = [
  {
    value: 'light',
    labelFa: 'روشن',
    descriptionFa: 'مستقل از تنظیمات دستگاه، همیشه با نمای روشن نمایش داده شود',
  },
  {
    value: 'dark',
    labelFa: 'تاریک',
    descriptionFa: 'مستقل از تنظیمات دستگاه، همیشه با نمای تاریک نمایش داده شود',
  },
  {
    value: 'system',
    labelFa: 'هماهنگ با دستگاه',
    descriptionFa: 'پیروی خودکار و زنده از حالت روشن یا تاریک دستگاه',
  },
];

export function getThemePreferenceLabelFa(preference: ThemePreference): string {
  if (preference === 'light') return 'روشن';
  if (preference === 'dark') return 'تاریک';
  return 'هماهنگ با دستگاه';
}

export function getResolvedThemeLabelFa(resolved: ResolvedTheme): string {
  return resolved === 'dark' ? 'تاریک' : 'روشن';
}

/**
 * Normalizes any raw theme preference value into a valid ThemePreference.
 * Fresh installs or unrecognized values default to 'system' («هماهنگ با دستگاه»).
 */
export function normalizeThemePreference(raw: unknown): ThemePreference {
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === 'light' || trimmed === 'dark' || trimmed === 'system') {
      return trimmed;
    }
  }
  return 'system';
}

/**
 * Reads the persisted ThemePreference from localStorage (checking current and legacy keys).
 * Defaults to 'system' if no valid preference has been saved.
 */
export function readStoredThemePreference(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : undefined
): ThemePreference {
  if (!storage) return 'system';
  try {
    const primary = storage.getItem(THEME_PREFERENCE_STORAGE_KEY);
    if (primary === 'light' || primary === 'dark' || primary === 'system') {
      return primary;
    }
    const legacyKeys = [LEGACY_THEME_STORAGE_KEY, 'kairos_theme', 'theme'];
    for (const key of legacyKeys) {
      const val = storage.getItem(key);
      if (val === 'light' || val === 'dark' || val === 'system') {
        return val;
      }
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
  return 'system';
}

/**
 * Persists the user's selected ThemePreference to localStorage so initial page load
 * can apply the exact theme before first paint without flash.
 */
export function persistThemePreferenceToStorage(
  preference: ThemePreference,
  storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : undefined
): void {
  if (!storage) return;
  const normalized = normalizeThemePreference(preference);
  try {
    storage.setItem(THEME_PREFERENCE_STORAGE_KEY, normalized);
    storage.setItem(LEGACY_THEME_STORAGE_KEY, normalized);
  } catch {
    // Ignore quota/security errors
  }
}

/**
 * Parses an optional host theme parameter (`?hostTheme=dark|light`) if provided by a native WebView host.
 */
export function parseHostThemeFromUrl(search = '', hash = ''): ResolvedTheme | null {
  try {
    const checkParams = (rawQuery: string): ResolvedTheme | null => {
      if (!rawQuery) return null;
      const qIdx = rawQuery.indexOf('?');
      const queryPart = qIdx >= 0 ? rawQuery.slice(qIdx + 1) : rawQuery.replace(/^[?#]/, '');
      if (!queryPart) return null;
      const params = new URLSearchParams(queryPart);
      const val = params.get('hostTheme')?.trim().toLowerCase();
      if (val === 'dark' || val === 'light') return val;
      return null;
    };
    return checkParams(search) ?? checkParams(hash);
  } catch {
    return null;
  }
}

/**
 * Pure, deterministic resolution of the system/device theme ('light' | 'dark').
 * Rules:
 * 1. Follows explicit native host override (`__KAIROS_HOST_THEME__` or `?hostTheme=`) if valid ('light' | 'dark').
 * 2. Follows standard `prefers-color-scheme: dark` media query when supported.
 * 3. Defaults to 'light' when system theme preference cannot be detected.
 */
export function resolveDeviceTheme(env?: ThemeEnvironmentLike): ResolvedTheme {
  const effectiveEnv: ThemeEnvironmentLike =
    env ??
    (typeof window !== 'undefined'
      ? {
          matchMedia:
            typeof window.matchMedia === 'function'
              ? window.matchMedia.bind(window)
              : undefined,
          hostThemeOverride: window.__KAIROS_HOST_THEME__ ?? null,
          locationSearch: window.location?.search ?? '',
          locationHash: window.location?.hash ?? '',
        }
      : {});

  if (effectiveEnv.hostThemeOverride === 'dark' || effectiveEnv.hostThemeOverride === 'light') {
    return effectiveEnv.hostThemeOverride;
  }

  const urlHostTheme = parseHostThemeFromUrl(
    effectiveEnv.locationSearch,
    effectiveEnv.locationHash
  );
  if (urlHostTheme === 'dark' || urlHostTheme === 'light') {
    return urlHostTheme;
  }

  if (typeof effectiveEnv.matchMedia === 'function') {
    try {
      const mql = effectiveEnv.matchMedia(DARK_MEDIA_QUERY);
      if (mql && mql.media !== 'not all' && typeof mql.matches === 'boolean') {
        return mql.matches ? 'dark' : 'light';
      }
    } catch {
      // Fallback to light when matchMedia throws
    }
  }

  // Requirement: If system preference cannot be detected, default to 'light'.
  return 'light';
}

/**
 * Resolves the effective displayed theme ('light' | 'dark') given the user's selected
 * ThemePreference ('light' | 'dark' | 'system') and the current device environment.
 * Keeps selected mode and displayed theme strictly separate.
 */
export function resolveEffectiveTheme(
  preference: ThemePreference,
  env?: ThemeEnvironmentLike
): ResolvedTheme {
  const normalized = normalizeThemePreference(preference);
  if (normalized === 'light') return 'light';
  if (normalized === 'dark') return 'dark';
  return resolveDeviceTheme(env);
}

/**
 * Applies the resolved theme ('light' | 'dark') and optional selected preference attribute
 * to the DOM root (`<html>`) without reloading or disturbing form inputs, timers, or state.
 */
export function applyThemeToDocument(
  theme: ResolvedTheme,
  docOrPreference?: Document | ThemePreference,
  maybeDoc?: Document
): void {
  let doc: Document | undefined;
  let preference: ThemePreference | undefined;

  if (
    typeof docOrPreference === 'string' &&
    (docOrPreference === 'light' || docOrPreference === 'dark' || docOrPreference === 'system')
  ) {
    preference = docOrPreference;
    doc = maybeDoc ?? (typeof document !== 'undefined' ? document : undefined);
  } else {
    doc =
      (docOrPreference as Document | undefined) ??
      (typeof document !== 'undefined' ? document : undefined);
  }

  if (!doc || !doc.documentElement) return;
  const isDark = theme === 'dark';
  doc.documentElement.classList.toggle('dark', isDark);
  doc.documentElement.setAttribute('data-theme', theme);
  if (preference) {
    doc.documentElement.setAttribute('data-theme-preference', preference);
  }
  if (doc.documentElement.style) {
    doc.documentElement.style.colorScheme = theme;
  }
}

/**
 * Registers the global `window.__KAIROS_SET_HOST_THEME__(theme)` bridge function so a native
 * WebView host can push OS theme changes live without reloading the page.
 * Importantly, if the user has selected a manual theme ('light' or 'dark'), host theme messages
 * update the recorded device theme but NEVER overwrite the user's manual selection.
 */
export function registerGlobalHostThemeBridge(
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): void {
  if (!win) return;
  win.__KAIROS_SET_HOST_THEME__ = (nextHostTheme: ResolvedTheme | null): ResolvedTheme => {
    if (nextHostTheme === 'dark' || nextHostTheme === 'light') {
      win.__KAIROS_HOST_THEME__ = nextHostTheme;
    } else {
      win.__KAIROS_HOST_THEME__ = null;
    }
    const deviceTheme = resolveDeviceTheme({
      matchMedia: typeof win.matchMedia === 'function' ? win.matchMedia.bind(win) : undefined,
      hostThemeOverride: win.__KAIROS_HOST_THEME__,
      locationSearch: win.location?.search ?? '',
      locationHash: win.location?.hash ?? '',
    });

    const attrPref = doc?.documentElement?.getAttribute('data-theme-preference');
    const activePref: ThemePreference =
      attrPref === 'light' || attrPref === 'dark' || attrPref === 'system'
        ? attrPref
        : readStoredThemePreference();
    const effective = activePref === 'system' ? deviceTheme : activePref;
    applyThemeToDocument(effective, activePref, doc);

    try {
      win.dispatchEvent(
        new CustomEvent(HOST_THEME_CHANGE_EVENT, { detail: { theme: deviceTheme } })
      );
    } catch {
      // CustomEvent dispatch optional in minimal test environments
    }
    return effective;
  };
}

/**
 * Subscribes to live device theme changes (`prefers-color-scheme: dark` media query + native host bridge event)
 * and invokes `onChange` with the latest device theme ('light' | 'dark').
 */
export function subscribeToDeviceThemeChanges(
  onChange: (deviceTheme: ResolvedTheme) => void,
  env?: ThemeEnvironmentLike,
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined
): () => void {
  const getMatchMedia = () =>
    env?.matchMedia ??
    (win && typeof win.matchMedia === 'function' ? win.matchMedia.bind(win) : undefined);

  const notifyLatest = () => {
    const nextDeviceTheme = resolveDeviceTheme(
      env ??
        (win
          ? {
              matchMedia: getMatchMedia(),
              hostThemeOverride: win.__KAIROS_HOST_THEME__ ?? null,
              locationSearch: win.location?.search ?? '',
              locationHash: win.location?.hash ?? '',
            }
          : {})
    );
    onChange(nextDeviceTheme);
  };

  const matchMediaFn = getMatchMedia();
  let mql: MediaQueryListLike | null = null;
  if (typeof matchMediaFn === 'function') {
    try {
      mql = matchMediaFn(DARK_MEDIA_QUERY);
    } catch {
      mql = null;
    }
  }

  const handleMediaChange = () => {
    notifyLatest();
  };

  if (mql) {
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleMediaChange);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(handleMediaChange);
    }
  }

  const handleHostEvent = () => {
    notifyLatest();
  };

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      notifyLatest();
    }
  };

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener(HOST_THEME_CHANGE_EVENT, handleHostEvent);
    win.addEventListener('pageshow', handleHostEvent);
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  return () => {
    if (mql) {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', handleMediaChange);
      } else if (typeof mql.removeListener === 'function') {
        mql.removeListener(handleMediaChange);
      }
    }
    if (win && typeof win.removeEventListener === 'function') {
      win.removeEventListener(HOST_THEME_CHANGE_EVENT, handleHostEvent);
      win.removeEventListener('pageshow', handleHostEvent);
    }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}

/**
 * Safely normalizes/migrates theme settings in UserSettingsEntity without losing any other settings
 * or overwriting valid legacy selections ('light', 'dark', 'system').
 * If settings.theme is invalid or missing, falls back to any valid legacy localStorage preference or 'system'.
 */
export function migrateLegacyThemeSettings(
  settings: UserSettingsEntity,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : undefined
): {
  settings: UserSettingsEntity;
  migrated: boolean;
} {
  const rawTheme = (settings as { theme?: unknown }).theme;
  if (rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system') {
    persistThemePreferenceToStorage(rawTheme, storage);
    return { settings, migrated: false };
  }

  const fallbackPref = readStoredThemePreference(storage);
  persistThemePreferenceToStorage(fallbackPref, storage);
  return {
    settings: {
      ...settings,
      theme: fallbackPref,
    },
    migrated: true,
  };
}
