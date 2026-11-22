(function () {
  function readStoredPreference() {
    try {
      var keys = ['kairos_theme_preference', 'nazmyar_theme', 'kairos_theme', 'theme'];
      for (var i = 0; i < keys.length; i++) {
        var val = window.localStorage && window.localStorage.getItem(keys[i]);
        if (val === 'light' || val === 'dark' || val === 'system') {
          return val;
        }
      }
    } catch (e) {}
    return 'system';
  }
  function resolveDeviceTheme() {
    try {
      var hostOverride = window.__KAIROS_HOST_THEME__;
      if (hostOverride === 'dark' || hostOverride === 'light') {
        return hostOverride;
      }
      var q = (window.location && (window.location.search || window.location.hash)) || '';
      if (/[?&]hostTheme=dark\b/i.test(q)) return 'dark';
      if (/[?&]hostTheme=light\b/i.test(q)) return 'light';
      if (typeof window.matchMedia === 'function') {
        var mql = window.matchMedia('(prefers-color-scheme: dark)');
        if (mql && mql.media !== 'not all' && typeof mql.matches === 'boolean') {
          return mql.matches ? 'dark' : 'light';
        }
      }
    } catch (e) {}
    return 'light';
  }
  function getActivePreference() {
    var root = document.documentElement;
    var attr = root && root.getAttribute('data-theme-preference');
    if (attr === 'light' || attr === 'dark' || attr === 'system') {
      return attr;
    }
    return readStoredPreference();
  }
  function resolveEffective(pref) {
    if (pref === 'light') return 'light';
    if (pref === 'dark') return 'dark';
    return resolveDeviceTheme();
  }
  function applyTheme(resolved, pref) {
    var isDark = resolved === 'dark';
    var root = document.documentElement;
    if (!root) return;
    root.classList.toggle('dark', isDark);
    root.setAttribute('data-theme', resolved);
    if (pref) root.setAttribute('data-theme-preference', pref);
    if (root.style) root.style.colorScheme = resolved;
  }
  window.__KAIROS_SET_HOST_THEME__ = function (nextTheme) {
    window.__KAIROS_HOST_THEME__ =
      nextTheme === 'dark' || nextTheme === 'light' ? nextTheme : null;
    var deviceTheme = resolveDeviceTheme();
    var activePref = getActivePreference();
    var effective = resolveEffective(activePref);
    applyTheme(effective, activePref);
    try {
      window.dispatchEvent(
        new CustomEvent('kairos:host-theme-change', { detail: { theme: deviceTheme } })
      );
    } catch (e) {}
    return effective;
  };
  var initialPref = readStoredPreference();
  applyTheme(resolveEffective(initialPref), initialPref);
  try {
    if (typeof window.matchMedia === 'function') {
      var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      var onMediaChange = function () {
        var currentPref = getActivePreference();
        if (currentPref === 'system') {
          applyTheme(resolveDeviceTheme(), 'system');
        }
      };
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', onMediaChange);
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(onMediaChange);
      }
    }
  } catch (e) {}
})();

// The Android SQLite upgrade opens the actual old entry and the new entry in turn.
// Only UI state that lived outside SQLite is copied. Never enumerate storage.
if (location.search === '?kairosStorageTransfer=1') {
  const keys = ['kairos_theme_preference', 'nazmyar_theme', 'kairos_theme', 'theme',
    'nazmyar_sound', 'kairos_sidebar_collapsed_v1', 'kairos_onboarding_seen_version',
    'kairos_unsaved_task_draft_v1', 'kairos_active_timer_v1'];
  window.KairosPreferences = {
    read() {
      return Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])
        .filter(([, value]) => value !== null));
    },
    copy(previous) {
      for (const key of keys) {
        if (typeof previous[key] === 'string') {
          if (localStorage.getItem(key) === null) localStorage.setItem(key, previous[key]);
          if (localStorage.getItem(key) !== previous[key]) return false;
        }
      }
      return true;
    }
  };
}
