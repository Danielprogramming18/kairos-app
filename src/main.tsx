import { createRoot } from 'react-dom/client';
import '@fontsource-variable/vazirmatn';
import App from './App.tsx';
import { OnboardingGate } from './components/OnboardingGate';
import { PlatformProvider } from './app/PlatformContext.tsx';
import './index.css';

/**
 * Platform-aware Service Worker strategy:
 * - In Windows Desktop (Tauri / WebView2 / tauri.localhost / __KAIROS_DESKTOP_BRIDGE__),
 *   Android WebView (file: / KairosAndroidBridge), or Dev mode:
 *   All assets are already packaged locally on disk. Unregister any Service Worker so
 *   WebView2/WebView never serves stale cached bundles after an application update.
 * - In production Web (standard http/https browser origin):
 *   Register `./sw.js` for offline PWA support.
 */
if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  const win = window as unknown as Record<string, unknown>;
  const protocol = window.location?.protocol || '';
  const hostname = window.location?.hostname || '';
  const isNativeDesktopOrAndroidHost =
    Boolean(win.__KAIROS_DESKTOP_BRIDGE__) ||
    Boolean(win.__TAURI_INTERNALS__) ||
    Boolean(win.KairosAndroidBridge) ||
    protocol === 'file:' ||
    protocol === 'tauri:' ||
    hostname === 'tauri.localhost' ||
    hostname.endsWith('.tauri.localhost');

  if (import.meta.env.DEV || isNativeDesktopOrAndroidHost) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      })
      .catch(() => {});
  } else if (protocol === 'https:' || protocol === 'http:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <PlatformProvider>
    <OnboardingGate><App /></OnboardingGate>
  </PlatformProvider>
);
