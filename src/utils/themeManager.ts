import { UserSettingsEntity } from '../domain/models';

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

/**
 * Parses an optional host theme parameter (`?hostTheme=dark|light`) if provided by an Android WebView host.
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
 * Pure, deterministic resolution of the active theme ('light' | 'dark').
 * Rules:
 * 1. Follows explicit Android WebView host override (`__KAIROS_HOST_THEME__` or `?hostTheme=`) if valid ('light' | 'dark').
 * 2. Follows standard web `prefers-color-scheme: dark` media query when supported.
 * 3. Defaults to 'light' when theme preference cannot be detected.
 * Never uses time-of-day, geolocation, sunrise/sunset, or saved manual overrides.
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

  // Requirement: In environments where theme preference is undetectable, default to 'light'.
  return 'light';
}

/**
 * Applies the resolved theme ('light' | 'dark') to the DOM root (`<html>`) without reloading
 * or disturbing any form inputs, timers, or application state.
 */
export function applyThemeToDocument(
  theme: ResolvedTheme,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): void {
  if (!doc || !doc.documentElement) return;
  const isDark = theme === 'dark';
  doc.documentElement.classList.toggle('dark', isDark);
  doc.documentElement.setAttribute('data-theme', theme);
  if (doc.documentElement.style) {
    doc.documentElement.style.colorScheme = theme;
  }
}

/**
 * Registers the global `window.__KAIROS_SET_HOST_THEME__(theme)` bridge function so an Android
 * WebView host can push configuration changes (`UI_MODE_NIGHT_YES` / `UI_MODE_NIGHT_NO`) live
 * without reloading the page.
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
    const resolved = resolveDeviceTheme({
      matchMedia: typeof win.matchMedia === 'function' ? win.matchMedia.bind(win) : undefined,
      hostThemeOverride: win.__KAIROS_HOST_THEME__,
      locationSearch: win.location?.search ?? '',
      locationHash: win.location?.hash ?? '',
    });
    applyThemeToDocument(resolved, doc);
    try {
      win.dispatchEvent(
        new CustomEvent(HOST_THEME_CHANGE_EVENT, { detail: { theme: resolved } })
      );
    } catch {
      // CustomEvent dispatch optional in minimal test environments
    }
    return resolved;
  };
}

/**
 * Subscribes to live device theme changes (`prefers-color-scheme: dark` media query + Android host bridge event)
 * and invokes `onChange` immediately whenever the device theme switches.
 */
export function subscribeToDeviceThemeChanges(
  onChange: (theme: ResolvedTheme) => void,
  env?: ThemeEnvironmentLike,
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined
): () => void {
  const getMatchMedia = () =>
    env?.matchMedia ??
    (win && typeof win.matchMedia === 'function' ? win.matchMedia.bind(win) : undefined);

  const notifyLatest = () => {
    const nextTheme = resolveDeviceTheme(
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
    onChange(nextTheme);
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
 * Migrates/neutralizes any previously saved manual theme preference ('light' | 'dark') in UserSettingsEntity
 * to 'system' while preserving all other user settings (soundEnabled, pomodoro durations, calendarPreference, etc.).
 */
export function migrateLegacyThemeSettings(settings: UserSettingsEntity): {
  settings: UserSettingsEntity;
  migrated: boolean;
} {
  if (settings.theme === 'system') {
    return { settings, migrated: false };
  }
  return {
    settings: {
      ...settings,
      theme: 'system',
    },
    migrated: true,
  };
}

/**
 * Neutralizes legacy manual theme keys in localStorage (`nazmyar_theme`, `kairos_theme`, `theme`)
 * so old manual selections never override automatic device theme, while leaving all other keys untouched.
 */
export function neutralizeLegacyLocalStorageTheme(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined = typeof localStorage !==
  'undefined'
    ? localStorage
    : undefined
): boolean {
  if (!storage) return false;
  let changed = false;
  try {
    const legacyKeys = ['nazmyar_theme', 'kairos_theme', 'theme'];
    for (const key of legacyKeys) {
      const current = storage.getItem(key);
      if (current !== null && current !== 'system') {
        if (key === 'nazmyar_theme') {
          storage.setItem(key, 'system');
        } else if (typeof storage.removeItem === 'function') {
          storage.removeItem(key);
        } else {
          storage.setItem(key, 'system');
        }
        changed = true;
      }
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return changed;
}
