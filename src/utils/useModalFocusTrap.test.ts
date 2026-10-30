import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeNextFocusIndex } from './useModalFocusTrap';

describe('Modal Focus Trap Cycling (FIX-11 / BUG-37)', () => {
  it('cycles forward with Tab and wraps from last element to index 0', () => {
    assert.equal(computeNextFocusIndex(0, 4, false), 1);
    assert.equal(computeNextFocusIndex(2, 4, false), 3);
    assert.equal(computeNextFocusIndex(3, 4, false), 0);
  });

  it('cycles backward with Shift+Tab and wraps from index 0 to last element', () => {
    assert.equal(computeNextFocusIndex(0, 4, true), 3);
    assert.equal(computeNextFocusIndex(3, 4, true), 2);
    assert.equal(computeNextFocusIndex(1, 4, true), 0);
  });

  it('handles focus outside modal container (-1) by jumping to start or end', () => {
    assert.equal(computeNextFocusIndex(-1, 5, false), 0);
    assert.equal(computeNextFocusIndex(-1, 5, true), 4);
  });

  it('returns -1 when modal has no focusable elements', () => {
    assert.equal(computeNextFocusIndex(0, 0, false), -1);
  });
});
