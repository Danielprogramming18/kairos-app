import type { LayoutPreference } from '../domain/planning';
import { FEATURE_IDS, type FeatureId } from '../components/planningNavigation';

export type MenuMode = 'desktop' | 'mobile';
export type MenuLocation = 'main' | 'more' | 'hidden';
export type MenuLayout = LayoutPreference & { main: string[] };
export const MOBILE_MAIN_CAPACITY = 4;
const DEFAULT_MAIN: Record<MenuMode, FeatureId[]> = {
  desktop: ['dashboard', 'workspace', 'projects', 'calendar', 'pomodoro'],
  mobile: ['dashboard', 'workspace', 'projects'],
};
const known = (id: string): id is FeatureId => FEATURE_IDS.includes(id as FeatureId);
const uniqueKnown = (ids: readonly string[]) => [...new Set(ids.filter(known))];

export function defaultMenuLayout(mode: MenuMode): MenuLayout {
  return { order: [...FEATURE_IDS], main: [...DEFAULT_MAIN[mode]], pinned: [], hidden: [] };
}

/** Legacy preferences are interpreted at the boundary; new saves always include placement. */
export function normalizeMenuLayout(raw: LayoutPreference, mode: MenuMode): MenuLayout {
  const order = uniqueKnown([...raw.order, ...FEATURE_IDS]);
  const hidden = uniqueKnown(raw.hidden);
  const pinned = uniqueKnown(raw.pinned).filter(id => !hidden.includes(id));
  const explicitMain = raw.main;
  let main: string[];
  if (explicitMain !== undefined) {
    main = uniqueKnown(explicitMain).filter(id => !hidden.includes(id));
    if (mode === 'mobile' && main.length > MOBILE_MAIN_CAPACITY) throw Error('منوی موبایل حداکثر چهار میان‌بر و یک «بیشتر» دارد.');
  } else {
    const customized = raw.order.length > 0 || raw.hidden.length > 0 || raw.pinned.length > 0;
    if (!customized) main = [...DEFAULT_MAIN[mode]];
    else if (mode === 'desktop') main = order.filter(id => !hidden.includes(id));
    else {
      const oldDefault = ['dashboard', 'workspace', 'pomodoro', 'habits'];
      const candidates = raw.order.length || pinned.length ? [...pinned, ...order] : oldDefault;
      main = uniqueKnown(candidates).filter(id => !hidden.includes(id)).slice(0, MOBILE_MAIN_CAPACITY);
    }
  }
  const mainSet = new Set(main);
  return {
    order,
    main: order.filter(id => mainSet.has(id)),
    pinned: order.filter(id => mainSet.has(id) && pinned.includes(id)),
    hidden: order.filter(id => hidden.includes(id)),
  };
}

export function featureLocation(layout: MenuLayout, id: string): MenuLocation {
  return layout.hidden.includes(id) ? 'hidden' : layout.main.includes(id) ? 'main' : 'more';
}
export function orderedMain(layout: MenuLayout): FeatureId[] {
  const inOrder = layout.order.filter(id => layout.main.includes(id)) as FeatureId[];
  return [...inOrder.filter(id => layout.pinned.includes(id)), ...inOrder.filter(id => !layout.pinned.includes(id))];
}
export type MenuMutationResult = { status: 'saved'; layout: MenuLayout } | { status: 'replace_required'; candidates: FeatureId[] };

export function setFeatureLocation(raw: LayoutPreference, mode: MenuMode, id: FeatureId, location: MenuLocation, replacement?: FeatureId): MenuMutationResult {
  if (!known(id)) throw Error('این قابلیت در برنامه وجود ندارد.');
  const layout = normalizeMenuLayout(raw, mode);
  if (location === 'main' && !layout.main.includes(id) && mode === 'mobile' && layout.main.length >= MOBILE_MAIN_CAPACITY) {
    if (!replacement) return { status: 'replace_required', candidates: orderedMain(layout) };
    if (!layout.main.includes(replacement) || replacement === id) throw Error('یکی از میان‌برهای فعلی را برای جایگزینی انتخاب کن.');
    layout.main = layout.main.filter(item => item !== replacement);
    layout.pinned = layout.pinned.filter(item => item !== replacement);
  }
  layout.hidden = layout.hidden.filter(item => item !== id);
  layout.main = layout.main.filter(item => item !== id);
  if (location === 'main') layout.main.push(id);
  if (location === 'hidden') layout.hidden.push(id);
  if (location !== 'main') layout.pinned = layout.pinned.filter(item => item !== id);
  return { status: 'saved', layout: normalizeMenuLayout(layout, mode) };
}

export function setFeaturePinned(raw: LayoutPreference, mode: MenuMode, id: FeatureId, pinned: boolean, replacement?: FeatureId): MenuMutationResult {
  const result = pinned ? setFeatureLocation(raw, mode, id, 'main', replacement) : { status: 'saved' as const, layout: normalizeMenuLayout(raw, mode) };
  if (result.status !== 'saved') return result;
  result.layout.pinned = pinned ? [...new Set([...result.layout.pinned, id])] : result.layout.pinned.filter(item => item !== id);
  return { status: 'saved', layout: normalizeMenuLayout(result.layout, mode) };
}

export function menuGroup(layout: MenuLayout, id: string): string {
  const location = featureLocation(layout, id);
  return location === 'main' ? `main-${layout.pinned.includes(id) ? 'pinned' : 'regular'}` : location;
}

/** Reordering stays within the pinned/unpinned or placement group. */
export function reorderFeature(raw: LayoutPreference, mode: MenuMode, id: FeatureId, direction: -1 | 1): MenuLayout {
  const layout = normalizeMenuLayout(raw, mode);
  const group = layout.order.filter(item => menuGroup(layout, item) === menuGroup(layout, id));
  const index = group.indexOf(id), neighbor = group[index + direction];
  if (!neighbor) return layout;
  return moveFeatureBefore(layout, mode, direction < 0 ? id : neighbor as FeatureId, direction < 0 ? neighbor as FeatureId : id);
}

export function moveFeatureBefore(raw: LayoutPreference, mode: MenuMode, id: FeatureId, before: FeatureId): MenuLayout {
  const layout = normalizeMenuLayout(raw, mode);
  if (id === before) return layout;
  if (menuGroup(layout, id) !== menuGroup(layout, before)) throw Error('جابه‌جایی فقط در همان گروه انجام می‌شود؛ محل نمایش یا سنجاق را جدا تغییر بده.');
  const order = layout.order.filter(item => item !== id);
  order.splice(order.indexOf(before), 0, id);
  layout.order = order;
  return normalizeMenuLayout(layout, mode);
}

export function moveFeatureAfter(raw: LayoutPreference, mode: MenuMode, id: FeatureId, after: FeatureId): MenuLayout {
  const layout = normalizeMenuLayout(raw, mode);
  if (id === after) return layout;
  if (menuGroup(layout, id) !== menuGroup(layout, after)) throw Error('جابه‌جایی فقط در همان گروه انجام می‌شود؛ محل نمایش یا سنجاق را جدا تغییر بده.');
  const order = layout.order.filter(item => item !== id);
  order.splice(order.indexOf(after) + 1, 0, id);
  layout.order = order;
  return normalizeMenuLayout(layout, mode);
}
