import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Pin, Plus, Settings2 } from 'lucide-react';
import type { NavTabId } from '../types';
import { usePlanning } from '../app/PlanningContext';
import { normalizeText } from '../domain/planning';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';
import { defaultMenuLayout, featureLocation, menuGroup, moveFeatureAfter, moveFeatureBefore, normalizeMenuLayout, orderedMain, reorderFeature, setFeatureLocation, setFeaturePinned, type MenuLocation, type MenuMode } from '../utils/menuLayout';
import { FEATURES, FEATURE_GROUP_LABELS, NAV_LABELS, type FeatureId } from './planningNavigation';
import { FEATURE_ICONS } from './featureIcons';
import { Field, PlanningShell } from './PlanningShared';
import './menuFeatures.css';

interface FeatureViewProps { onNavigate: (tab: NavTabId, section?: string) => void }
type MenuAction = { id: FeatureId; location: MenuLocation } | { id: FeatureId; pin: boolean };
function useDeviceMode(): MenuMode {
  const [mode, setMode] = useState<MenuMode>(() => typeof matchMedia !== 'undefined' && matchMedia('(min-width:1024px)').matches ? 'desktop' : 'mobile');
  useEffect(() => {
    const media = matchMedia('(min-width:1024px)');
    const update = () => setMode(media.matches ? 'desktop' : 'mobile');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return mode;
}

function useMenuActions(mode: MenuMode) {
  const { state, change } = usePlanning();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<MenuAction | null>(null);
  const [replacement, setReplacement] = useState<FeatureId | ''>('');
  const layout = normalizeMenuLayout(state.layout[mode], mode);
  useEffect(() => { setPending(null); setReplacement(''); setMessage(''); }, [mode]);
  const perform = async (action: MenuAction, replace?: FeatureId) => {
    setMessage('');
    try {
      const result = 'location' in action ? setFeatureLocation(state.layout[mode], mode, action.id, action.location, replace) : setFeaturePinned(state.layout[mode], mode, action.id, action.pin, replace);
      if (result.status === 'replace_required') { setPending(action); setReplacement(''); return; }
      if (await change(draft => { draft.layout[mode] = result.layout; })) {
        setPending(null); setReplacement(''); setMessage('چیدمان ذخیره شد. اطلاعات قابلیت‌ها حفظ شدند.');
      }
    } catch (error) { setMessage((error as Error).message); }
  };
  const dialogRef = useModalFocusTrap<HTMLDivElement>(Boolean(pending), () => setPending(null));
  const replacementDialog = pending && <div className="km-dialog-backdrop" role="presentation" onClick={event => { if (event.currentTarget === event.target) setPending(null); }}>
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="menu-replacement-title" className="km-replacement kairos-modal-panel">
      <h3 id="menu-replacement-title">کدام میان‌بر جایگزین شود؟</h3>
      <p>چهار جایگاه موبایل پر است. {NAV_LABELS[pending.id]} را جایگزین یکی از موارد زیر کن. میان‌بر قبلی در «بیشتر» باقی می‌ماند.</p>
      <Field label="میان‌بر برای جایگزینی"><select value={replacement} onChange={event => setReplacement(event.target.value as FeatureId)}><option value="">انتخاب کن</option>{orderedMain(layout).map(id => <option key={id} value={id}>{NAV_LABELS[id]}</option>)}</select></Field>
      <div className="kp-actions"><button type="button" disabled={!replacement} onClick={() => replacement && void perform(pending, replacement)}>تأیید جایگزینی</button><button type="button" onClick={() => setPending(null)}>انصراف</button></div>
    </div>
  </div>;
  return { layout, message, setMessage, perform, replacementDialog };
}

export function MoreFeaturesView({ onNavigate }: FeatureViewProps) {
  const mode = useDeviceMode();
  const { layout, message, perform, replacementDialog } = useMenuActions(mode);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const search = normalizeText(query);
  const visible = FEATURES.filter(feature => !layout.hidden.includes(feature.id) && (showAll || Boolean(search) || featureLocation(layout, feature.id) === 'more') && normalizeText(`${feature.title} ${feature.description} ${feature.keywords ?? ''}`).includes(search));
  const templatesVisible = !layout.hidden.includes('projects') && (!search || normalizeText('قالب‌ها قالب کار آماده کپی پروژه').includes(search));
  return <PlanningShell title="بیشتر">
    <div className="kp-actions km-heading"><p>ابزارهای موجود کایروس را پیدا کن و میان‌برهای دلخواهت را به منو بیاور.</p><button type="button" onClick={() => onNavigate('customize')}><Settings2 className="km-icon" /> شخصی‌سازی منو</button></div>
    <div className="kp-grid"><Field label="جست‌وجوی قابلیت"><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="مثلاً عادت، قالب یا زمان‌بندی" /></Field><label className="km-toggle"><input type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} /> نمایش قابلیت‌های منوی اصلی هم باشد</label></div>
    {Object.entries(FEATURE_GROUP_LABELS).map(([group, title]) => {
      const features = visible.filter(feature => feature.group === group);
      if (!features.length && !(group === 'planning' && templatesVisible)) return null;
      return <section className="km-feature-group" key={group} aria-label={title}><h3>{title}</h3><div className="km-feature-grid">
        {features.map(feature => {
          const Icon = FEATURE_ICONS[feature.id];
          const inMain = layout.main.includes(feature.id);
          return <article className="kp-card km-feature" key={feature.id}>
            <div className="km-feature-title"><Icon className="km-icon" /><h4>{feature.title}</h4></div><p>{feature.description}</p>
            <div className="kp-actions"><button type="button" onClick={() => onNavigate(feature.id)}>باز کردن {feature.title}</button>{inMain ? <small>در منوی اصلی</small> : <button type="button" onClick={() => void perform({ id: feature.id, location: 'main' })}><Plus className="km-icon" /> افزودن به منوی اصلی</button>}</div>
          </article>;
        })}
        {group === 'planning' && templatesVisible && <article className="kp-card km-feature"><div className="km-feature-title"><FEATURE_ICONS.projects className="km-icon" /><h4>قالب‌های کار</h4></div><p>قالب‌های آماده و شخصی در بخش پروژه‌ها؛ پیش از ساخت کارها می‌توانی آن‌ها را ویرایش کنی.</p><div className="kp-actions"><button type="button" onClick={() => onNavigate('projects', 'templates')}>باز کردن قالب‌ها</button>{!layout.main.includes('projects') && <button type="button" onClick={() => void perform({ id: 'projects', location: 'main' })}>افزودن میان‌بر پروژه‌ها و قالب‌ها</button>}</div></article>}
      </div></section>;
    })}
    {!visible.length && !templatesVisible && <p>قابلیتی پیدا نشد. برای دیدن موارد مخفی، «شخصی‌سازی منو» را باز کن.</p>}
    <p role="status">{message}</p>{replacementDialog}
  </PlanningShell>;
}

export function CustomizeView({ onNavigate }: FeatureViewProps) {
  const { state, change } = usePlanning();
  const [mode, setMode] = useState<MenuMode>(useDeviceMode());
  const { layout, message, setMessage, perform, replacementDialog } = useMenuActions(mode);
  const [query, setQuery] = useState('');
  const [dragged, setDragged] = useState<FeatureId | null>(null);
  const [clearFeedback, setClearFeedback] = useState(false);
  const canDrag = mode === 'desktop' && (typeof matchMedia === 'undefined' || matchMedia('(pointer:fine)').matches);
  const reorder = async (id: FeatureId, direction: -1 | 1) => {
    const next = reorderFeature(state.layout[mode], mode, id, direction);
    if (await change(draft => { draft.layout[mode] = next; })) setMessage('ترتیب منو ذخیره شد.');
  };
  const dropRelative = async (target: FeatureId, after: boolean) => {
    if (!dragged) return;
    try { const next = (after ? moveFeatureAfter : moveFeatureBefore)(state.layout[mode], mode, dragged, target); if (await change(draft => { draft.layout[mode] = next; })) setMessage('ترتیب منو ذخیره شد.'); }
    catch (error) { setMessage((error as Error).message); }
    setDragged(null);
  };
  const groupTitles: Record<string, string> = { 'main-pinned': 'منوی اصلی — سنجاق‌شده', 'main-regular': 'منوی اصلی', more: 'قابلیت‌های بیشتر', hidden: 'قابلیت‌های مخفی' };
  return <PlanningShell title="شخصی‌سازی منو">
    <div className="kp-actions"><p>در حالت ویرایش منو هستی. تغییر میان‌برها هیچ داده‌ای را حذف نمی‌کند.</p><button type="button" onClick={() => onNavigate('more')}>پایان ویرایش</button></div>
    <div className="kp-grid"><Field label="چیدمان دستگاه"><select value={mode} onChange={event => setMode(event.target.value as MenuMode)}><option value="desktop">دسکتاپ و ویندوز</option><option value="mobile">موبایل</option></select></Field><Field label="جست‌وجوی قابلیت‌ها و موارد مخفی"><input type="search" value={query} onChange={event => setQuery(event.target.value)} /></Field></div>
    <p>سنجاق، اولویت نمایش در قسمت ثابت منوی اصلی است. میان‌بر بدون سنجاق هم می‌تواند در منوی اصلی بماند. «بیشتر» و مسیر شخصی‌سازی همیشه در دسترس‌اند.</p>
    {mode === 'mobile' && <p>{layout.main.length} از ۴ جایگاه میان‌بر پر است؛ جایگاه «بیشتر» ثابت می‌ماند.</p>}
    {Object.entries(groupTitles).map(([group, title]) => {
      const allGroup = layout.order.filter(id => menuGroup(layout, id) === group);
      const ids = allGroup.filter(id => normalizeText(`${NAV_LABELS[id]} ${FEATURES.find(feature => feature.id === id)?.description ?? ''}`).includes(normalizeText(query)));
      if (!ids.length) return null;
      return <section key={group} aria-label={title}><h3>{title}</h3>{ids.map(rawId => {
        const id = rawId as FeatureId, Icon = FEATURE_ICONS[id], position = allGroup.indexOf(id);
        return <article key={id} className={`kp-card km-menu-row ${dragged === id ? 'km-dragged' : ''}`} onDragOver={event => { if (canDrag && dragged && menuGroup(layout, dragged) === group) event.preventDefault(); }} onDrop={event => { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); void dropRelative(id, event.clientY > bounds.top + bounds.height / 2); }}>
          <div className="km-feature-title"><Icon className="km-icon" /><button className="kp-link" type="button" onClick={() => onNavigate(id)}>{NAV_LABELS[id]}</button></div>
          <div className="km-menu-controls">
            <Field label={`محل نمایش ${NAV_LABELS[id]}`}><select value={featureLocation(layout, id)} onChange={event => void perform({ id, location: event.target.value as MenuLocation })}><option value="main">منوی اصلی</option><option value="more">بیشتر</option><option value="hidden">مخفی</option></select></Field>
            <label className="km-toggle"><input type="checkbox" checked={layout.pinned.includes(id)} onChange={event => void perform({ id, pin: event.target.checked })} /><Pin className="km-icon" /> سنجاق {NAV_LABELS[id]}</label>
            <div className="kp-actions"><button type="button" aria-label={`${NAV_LABELS[id]} بالاتر`} disabled={position === 0} onClick={() => void reorder(id, -1)}><ArrowUp className="km-icon" /></button><button type="button" aria-label={`${NAV_LABELS[id]} پایین‌تر`} disabled={position === allGroup.length - 1} onClick={() => void reorder(id, 1)}><ArrowDown className="km-icon" /></button>{canDrag && <button type="button" draggable aria-label={`کشیدن ${NAV_LABELS[id]} برای تغییر ترتیب`} title="این دستگیره را روی مورد دیگری در همین گروه بکش" onDragStart={event => { setDragged(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/kairos-feature', id); }} onDragEnd={() => setDragged(null)}><GripVertical className="km-icon" /></button>}</div>
          </div>
        </article>;
      })}</section>;
    })}
    <div className="kp-actions"><button type="button" onClick={async () => { if (await change(draft => { draft.layout[mode] = defaultMenuLayout(mode); })) setMessage('چیدمان پیش‌فرض این دستگاه بازگردانده شد. داده‌های برنامه حفظ شدند.'); }}>بازگرداندن چیدمان پیش‌فرض {mode === 'mobile' ? 'موبایل' : 'دسکتاپ'}</button></div>
    <p role="status">{message}</p>{replacementDialog}
    <details className="kp-card"><summary>بازخورد کمک‌یار</summary><p>بازخوردها فقط روی همین دستگاه و در پشتیبان نگهداری می‌شوند.</p><p>{state.feedback.filter(item => item.answer === 'helped').length} پاسخ «کمک کرد» از {state.feedback.filter(item => item.answer !== 'untried').length} بازخورد معتبر</p><button type="button" onClick={() => setClearFeedback(true)}>پاک‌کردن سابقهٔ شخصی‌سازی کمک‌یار</button>{clearFeedback && <div className="kp-actions"><span>سابقهٔ بازخورد کمک‌یار پاک شود؟</span><button type="button" onClick={async () => { if (await change(draft => { draft.feedback = []; })) setClearFeedback(false); }}>تأیید پاک‌کردن سابقهٔ کمک‌یار</button><button type="button" onClick={() => setClearFeedback(false)}>انصراف</button></div>}</details>
  </PlanningShell>;
}
