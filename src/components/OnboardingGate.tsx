import { useEffect, useRef, useState, type ReactNode } from 'react';
import { readStoredThemePreference, resolveEffectiveTheme, subscribeToDeviceThemeChanges, registerGlobalHostThemeBridge } from '../utils/themeManager';

const SEEN_KEY = 'kairos_onboarding_seen_version';
const VERSION = '1';
const ids = ['welcome', 'planning', 'focus', 'habits', 'offline'];
function alreadySeen() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('intro') === '1') return false;
  try { return localStorage.getItem(SEEN_KEY) === VERSION; } catch { return false; }
}

/** Keep the main application unmounted until introduction finishes. No user-data migration. */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(alreadySeen);
  const [failed, setFailed] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const completed = useRef(false);
  const initialTheme = useRef(resolveEffectiveTheme(readStoredThemePreference()));
  useEffect(() => {
    if (done) return;
    registerGlobalHostThemeBridge();
    const syncTheme = () => iframe.current?.contentWindow?.postMessage({
      channel: 'kairos-intro-v1', theme: resolveEffectiveTheme(readStoredThemePreference()),
    }, '*');
    const timer = window.setTimeout(() => setFailed(true), 10000);
    const finish = () => {
      if (completed.current) return;
      completed.current = true;
      try { localStorage.setItem(SEEN_KEY, VERSION); } catch { /* Do not trap users if storage is unavailable. */ }
      setDone(true);
    };
    const receive = (message: MessageEvent) => {
      if (message.source !== iframe.current?.contentWindow || message.data?.channel !== 'kairos-intro-v1') return;
      const e = message.data.event;
      if (!e || e.version !== 1 || e.totalSlides !== 5 || !Number.isInteger(e.slideIndex) || e.slideIndex < 0 || e.slideIndex >= ids.length || ids[e.slideIndex] !== e.slideId) return;
      if (e.type === 'ready') { clearTimeout(timer); setFailed(false); syncTheme(); }
      if (e.type === 'skip' || (e.type === 'complete' && e.slideIndex === 4)) finish();
    };
    window.addEventListener('message', receive);
    window.addEventListener('storage', syncTheme);
    const unsubscribe = subscribeToDeviceThemeChanges(syncTheme);
    return () => { clearTimeout(timer); unsubscribe(); window.removeEventListener('message', receive); window.removeEventListener('storage', syncTheme); };
  }, [done]);
  if (done) return children;
  return <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: initialTheme.current === 'dark' ? '#10162c' : '#f6f7fc' }}>
    <iframe ref={iframe} title="معرفی کایروس" src={`${import.meta.env.BASE_URL}kairos-intro/kairos-intro.html?theme=${initialTheme.current}`}
      style={{ display: 'block', width: '100%', height: '100%', border: 0 }} onError={() => setFailed(true)} />
    {failed && <div role="alert" dir="rtl" style={{ position: 'absolute', bottom: 16, left: 16, right: 16, padding: 16, background: '#fff', color: '#242849', borderRadius: 12 }}>
      معرفی بارگذاری نشد. <button onClick={() => setDone(true)}>ورود به برنامه</button>
    </div>}
  </div>;
}
