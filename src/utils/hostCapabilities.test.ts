import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { detectHostCapabilities } from './hostCapabilities';

describe('Host Capabilities Inspector & 100% Offline Bundle Contract (FIX-12)', () => {
  it('detects standard web browser with IndexedDB and WebCrypto as offline-ready', () => {
    const report = detectHostCapabilities({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      protocol: 'https:',
      hasIndexedDB: true,
      hasNativeAndroidBridge: false,
      hasNativeDesktopBridge: false,
      hasWebCryptoSubtle: true,
      hasBroadcastChannel: true,
      hasNotificationApi: true,
      hasServiceWorker: true,
      isOnline: false,
    });

    assert.equal(report.hostKind, 'web_browser');
    assert.equal(report.storageEngine, 'indexeddb_dexie');
    assert.equal(report.isOfflineReady, true);
    assert.equal(report.isNetworkOnline, false);
    assert.equal(report.warningsFa.length, 0);
  });

  it('detects Sketchware Android static WebView (file:// without native SQLite bridge) and uses IndexedDB', () => {
    const report = detectHostCapabilities({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
      protocol: 'file:',
      hasIndexedDB: true,
      hasNativeAndroidBridge: false,
      hasNativeDesktopBridge: false,
      hasWebCryptoSubtle: true,
      hasBroadcastChannel: true,
      hasNotificationApi: false,
      hasServiceWorker: false,
      isOnline: false,
    });

    assert.equal(report.hostKind, 'android_webview_static');
    assert.equal(report.storageEngine, 'indexeddb_dexie');
    assert.equal(report.isFileProtocol, true);
    assert.equal(report.hasServiceWorker, false);
    assert.equal(report.isOfflineReady, true);
    assert.equal(report.warningsFa.length, 0);
  });

  it('reports unavailable storage and explicit warning if WebView has neither IndexedDB nor native bridge', () => {
    const report = detectHostCapabilities({
      userAgent: 'Mozilla/5.0 (Linux; Android 13; wv)',
      protocol: 'file:',
      hasIndexedDB: false,
      hasNativeAndroidBridge: false,
      hasNativeDesktopBridge: false,
      hasWebCryptoSubtle: false,
      hasBroadcastChannel: false,
      hasNotificationApi: false,
      hasServiceWorker: false,
      isOnline: false,
    });

    assert.equal(report.hostKind, 'android_webview_static');
    assert.equal(report.storageEngine, 'unavailable');
    assert.equal(report.isOfflineReady, false);
    assert.equal(report.warningsFa.length, 2);
    assert.ok(report.warningsFa[0].includes('setDomStorageEnabled(true)'));
  });

  it('detects bridged Android and Windows hosts when native bridge objects are injected', () => {
    const androidReport = detectHostCapabilities({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; wv)',
      protocol: 'file:',
      hasIndexedDB: true,
      hasNativeAndroidBridge: true,
      hasNativeDesktopBridge: false,
      hasWebCryptoSubtle: true,
      hasBroadcastChannel: true,
      hasNotificationApi: false,
      hasServiceWorker: false,
    });
    assert.equal(androidReport.hostKind, 'android_webview_bridged');
    assert.equal(androidReport.storageEngine, 'android_sqlite_bridge');
    assert.equal(androidReport.isOfflineReady, true);

    const windowsReport = detectHostCapabilities({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/124.0.0.0',
      protocol: 'https:',
      hasIndexedDB: true,
      hasNativeAndroidBridge: false,
      hasNativeDesktopBridge: true,
      hasWebCryptoSubtle: true,
      hasBroadcastChannel: true,
      hasNotificationApi: true,
      hasServiceWorker: false,
    });
    assert.equal(windowsReport.hostKind, 'windows_desktop_bridged');
    assert.equal(windowsReport.storageEngine, 'windows_sqlite_bridge');
    assert.equal(windowsReport.isOfflineReady, true);
  });

  it('verifies index.html and main.tsx have zero external CDN dependencies and use local bundled Vazirmatn font', () => {
    const rootDir = process.cwd();
    const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    const mainTsx = fs.readFileSync(path.join(rootDir, 'src/main.tsx'), 'utf-8');

    assert.equal(
      indexHtml.includes('fonts.googleapis.com'),
      false,
      'index.html must not depend on external Google Fonts CDN'
    );
    assert.equal(
      indexHtml.includes('fonts.gstatic.com'),
      false,
      'index.html must not depend on external gstatic CDN'
    );
    assert.equal(
      /https?:\/\//i.test(indexHtml),
      false,
      'index.html must not contain any external http:// or https:// URLs'
    );
    assert.ok(
      indexHtml.includes('href="./icon.svg"'),
      'index.html must use relative path ./icon.svg for WebView compatibility'
    );
    assert.ok(
      mainTsx.includes("@fontsource-variable/vazirmatn"),
      'src/main.tsx must import local @fontsource-variable/vazirmatn package'
    );
  });
});
