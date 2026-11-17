import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePlatform } from './PlatformContext';
import { emptyPlanning, PlanningState, validatePlanning } from '../domain/planning';
import { CROSS_TAB_SYNC_CHANNEL } from '../infrastructure/web/dexieAdapter';
const Context = createContext<{
  state: PlanningState;
  ready: boolean;
  busy: boolean;
  error: string;
  change: (fn: (draft: PlanningState) => void) => Promise<boolean>;
  refresh: () => Promise<void>;
} | null>(null);
export function PlanningProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const {
    container,
    ready: platformReady
  } = usePlatform();
  const [state, setState] = useState(emptyPlanning);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const revision = useRef(0);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!platformReady || saving.current) return;
    const request = ++generation.current;
    try {
      const saved = (await container.settings.getSettings()).planning;
      if (request !== generation.current) return;
      const next = saved ? validatePlanning(saved) : emptyPlanning();
      revision.current = next.revision;
      setState(next);
      setReady(true);
      setError('');
    } catch (e) {
      if (request !== generation.current) return;
      setError(String((e as Error).message));
      setReady(false);
    }
  }, [container, platformReady]);
  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh();
    window.addEventListener('focus', onRefresh);
    window.addEventListener('kairos-planning-refresh', onRefresh);
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CROSS_TAB_SYNC_CHANNEL) : null;
    if (channel) channel.onmessage = onRefresh;
    return () => {
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('kairos-planning-refresh', onRefresh);
      channel?.close();
    };
  }, [refresh]);
  const change = async (fn: (draft: PlanningState) => void) => {
    if (!ready || saving.current) return false;
    ++generation.current;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      // Capture event-backed values before React restores controlled inputs.
      const next = structuredClone(state);
      fn(next);
      next.revision = state.revision + 1;
      validatePlanning(next);
      const current = (await container.settings.getSettings()).planning ?? emptyPlanning();
      if (current.revision !== state.revision || current.revision !== revision.current) throw new Error('اطلاعات تغییر کرده است؛ تازه‌سازی کن و دوباره تلاش کن.');
      const saved = await container.settings.saveSettings({
        planning: next
      });
      if (saved.planning?.revision !== next.revision) throw new Error('میزبان ذخیرهٔ اطلاعات جدید را تأیید نکرد.');
      revision.current = next.revision;
      setState(next);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return <Context.Provider value={{
    state,
    ready,
    busy,
    error,
    change,
    refresh
  }}>{children}</Context.Provider>;
}
export function usePlanning() {
  const c = useContext(Context);
  if (!c) throw Error('PlanningProvider missing');
  return c;
}
