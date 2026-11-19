import test from 'node:test';
import assert from 'node:assert/strict';
import { getFocusableElements } from './useModalFocusTrap';

test('modal focus excludes collapsed details controls but retains visible summaries and footer buttons', () => {
  const details = { querySelector: () => ({ contains: (el: {name: string}) => el.name === 'summary' }), parentElement: null };
  const element = (name: string, visible: boolean, hiddenAncestor = false, disabled = false) => ({
    name, matches: () => disabled,
    closest: (selector: string) => selector.startsWith('details')
      ? (['summary', 'advanced input'].includes(name) ? details : null)
      : (hiddenAncestor ? {} : null),
    getClientRects: () => ({ length: visible ? 1 : 0 }),
  });
  const summary = element('summary', true), insideClosed = element('advanced input', true), save = element('save', true), inert = element('inert button', true, true), disabled = element('disabled button', true, false, true);
  const container = { querySelectorAll: () => [summary, insideClosed, save, inert, disabled] } as unknown as HTMLElement;
  assert.deepEqual(getFocusableElements(container), [summary, save]);
});
