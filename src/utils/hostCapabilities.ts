/**
 * Host Capabilities Inspector (FIX-12)
 * Inspects runtime environment capabilities without assuming SQLite, native bridge,
 * native file picker, or native notifications exist unless explicitly detected.
 */

export type RuntimeHostKind =
  | 'web_browser'
  | 'android_webview_static'
  | 'android_webview_bridged'
  | 'windows_desktop_bridged';

export type ActiveStorageEngineKind =
  | 'indexeddb_dexie'
  | 'android_sqlite_bridge'
  | 'windows_sqlite_bridge'
  | 'unavailable';

export interface HostEnvironmentProbe {
  userAgent?: string;
  protocol?: string;
  hasIndexedDB?: boolean;
  hasNativeAndroidBridge?: boolean;
  hasNativeDesktopBridge?: boolean;
  hasWebCryptoSubtle?: boolean;
  hasBroadcastChannel?: boolean;
  hasNotificationApi?: boolean;
  hasServiceWorker?: boolean;
  isOnline?: boolean;
}

export interface HostCapabilitiesReport {
  hostKind: RuntimeHostKind;
  hostLabelFa: string;
  storageEngine: ActiveStorageEngineKind;
  storageEngineLabelFa: string;
  isFileProtocol: boolean;
  hasIndexedDB: boolean;
  hasNativeAndroidBridge: boolean;
  hasNativeDesktopBridge: boolean;
  hasWebCryptoSubtle: boolean;
  hasBroadcastChannel: boolean;
  hasNotificationApi: boolean;
  hasServiceWorker: boolean;
  isOfflineReady: boolean;
  isNetworkOnline: boolean;
  warningsFa: string[];
}

export function probeCurrentBrowserEnvironment(): HostEnvironmentProbe {
  const win = typeof window !== 'undefined' ? (window as any) : undefined;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;

  const hasIndexedDB = Boolean(
    typeof indexedDB !== 'undefined' || (win && win.indexedDB)
  );
  const hasNativeAndroidBridge = Boolean(
    win &&
      win.KairosAndroidBridge &&
      typeof win.KairosAndroidBridge.postMessage === 'function'
  );
  const hasNativeDesktopBridge = Boolean(
    win &&
      win.__KAIROS_DESKTOP_BRIDGE__ &&
      typeof win.__KAIROS_DESKTOP_BRIDGE__.invoke === 'function'
  );
  const hasWebCryptoSubtle = Boolean(
    typeof crypto !== 'undefined' &&
      crypto.subtle &&
      typeof crypto.subtle.encrypt === 'function'
  );
  const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';
  const hasNotificationApi = Boolean(win && 'Notification' in win);
  const hasServiceWorker = Boolean(nav && 'serviceWorker' in nav);
  const isOnline = nav && typeof nav.onLine === 'boolean' ? nav.onLine : true;

  return {
    userAgent: nav?.userAgent || '',
    protocol: win?.location?.protocol || 'https:',
    hasIndexedDB,
    hasNativeAndroidBridge,
    hasNativeDesktopBridge,
    hasWebCryptoSubtle,
    hasBroadcastChannel,
    hasNotificationApi,
    hasServiceWorker,
    isOnline,
  };
}

export function detectHostCapabilities(
  customProbe?: HostEnvironmentProbe
): HostCapabilitiesReport {
  const probe = {
    ...probeCurrentBrowserEnvironment(),
    ...(customProbe || {}),
  };

  const ua = (probe.userAgent || '').toLowerCase();
  const isFileProtocol = probe.protocol === 'file:';
  const isAndroidWebViewUa =
    ua.includes('wv') ||
    (ua.includes('android') && ua.includes('version/')) ||
    (isFileProtocol && ua.includes('android'));

  const hasIndexedDB = Boolean(probe.hasIndexedDB);
  const hasNativeAndroidBridge = Boolean(probe.hasNativeAndroidBridge);
  const hasNativeDesktopBridge = Boolean(probe.hasNativeDesktopBridge);
  const hasWebCryptoSubtle = Boolean(probe.hasWebCryptoSubtle);
  const hasBroadcastChannel = Boolean(probe.hasBroadcastChannel);
  const hasNotificationApi = Boolean(probe.hasNotificationApi);
  const hasServiceWorker = Boolean(probe.hasServiceWorker) && !isFileProtocol;
  const isNetworkOnline = probe.isOnline ?? true;

  let hostKind: RuntimeHostKind = 'web_browser';
  let hostLabelFa = 'مرورگر وب (مستقل از سرور و حساب کاربری)';

  if (hasNativeAndroidBridge) {
    hostKind = 'android_webview_bridged';
    hostLabelFa = 'میزبان بومی اندروید (متصل به پل بومی KairosAndroidBridge)';
  } else if (hasNativeDesktopBridge) {
    hostKind = 'windows_desktop_bridged';
    hostLabelFa = 'میزبان دسکتاپ ویندوز (متصل به پل بومی دسکتاپ)';
  } else if (isAndroidWebViewUa || isFileProtocol) {
    hostKind = 'android_webview_static';
    hostLabelFa = 'وب‌ویو استاتیک اندروید / فایل محلی (بدون وابستگی به پل بومی)';
  }

  let storageEngine: ActiveStorageEngineKind = 'unavailable';
  let storageEngineLabelFa = 'عدم دسترسی به موتور ذخیره‌سازی پایدار';

  if (hasNativeAndroidBridge) {
    storageEngine = 'android_sqlite_bridge';
    storageEngineLabelFa = 'پایگاه‌دادهٔ بومی SQLite اندروید (از طریق KairosAndroidBridge)';
  } else if (hasNativeDesktopBridge) {
    storageEngine = 'windows_sqlite_bridge';
    storageEngineLabelFa = 'پایگاه‌دادهٔ بومی SQLite دسکتاپ ویندوز';
  } else if (hasIndexedDB) {
    storageEngine = 'indexeddb_dexie';
    storageEngineLabelFa = 'پایگاه‌دادهٔ تراکنشی IndexedDB روی دستگاه (Dexie)';
  }

  const warningsFa: string[] = [];

  if (storageEngine === 'unavailable') {
    warningsFa.push(
      'موتور ذخیره‌سازی IndexedDB یا پل بومی در این محیط فعال نیست؛ در WebView اندروید باید setDomStorageEnabled(true) فعال شود.'
    );
  }

  if (!hasWebCryptoSubtle) {
    warningsFa.push(
      'رابط رمزنگاری WebCrypto (AES-256-GCM) در این مبدأ فعال نیست؛ خروجی پشتیبان استاندارد JSON همچنان در دسترس است.'
    );
  }

  return {
    hostKind,
    hostLabelFa,
    storageEngine,
    storageEngineLabelFa,
    isFileProtocol,
    hasIndexedDB,
    hasNativeAndroidBridge,
    hasNativeDesktopBridge,
    hasWebCryptoSubtle,
    hasBroadcastChannel,
    hasNotificationApi,
    hasServiceWorker,
    isOfflineReady: storageEngine !== 'unavailable',
    isNetworkOnline,
    warningsFa,
  };
}
