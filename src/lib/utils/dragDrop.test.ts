// @vitest-environment jsdom
// jsdom for `findDropZone` alone, which walks real `closest()`/`dataset` — everything else here is
// pure arithmetic. The gesture handling in `draggable` itself is covered by e2e instead (see
// e2e/drag-and-drop.spec.ts): it depends on pointer capture, `elementFromPoint` hit-testing and
// layout, none of which jsdom implements, so a jsdom test of it would only be asserting a mock.
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD_PX, dragActivation, exceedsDragThreshold, findDropZone } from './dragDrop';

describe('exceedsDragThreshold', () => {
  it('treats movement within the threshold as a tap, not a drag', () => {
    expect(exceedsDragThreshold(0, 0)).toBe(false);
    expect(exceedsDragThreshold(DRAG_THRESHOLD_PX, 0)).toBe(false);
    expect(exceedsDragThreshold(-DRAG_THRESHOLD_PX, 0)).toBe(false);
  });

  it('counts movement past the threshold in any direction', () => {
    expect(exceedsDragThreshold(DRAG_THRESHOLD_PX + 1, 0)).toBe(true);
    expect(exceedsDragThreshold(0, -(DRAG_THRESHOLD_PX + 1))).toBe(true);
  });

  it('measures straight-line distance, so diagonal movement is held to the same standard', () => {
    // 5,5 is ~7.07 away — past the 6px threshold, even though neither axis is on its own.
    expect(exceedsDragThreshold(5, 5)).toBe(true);
    expect(exceedsDragThreshold(4, 4)).toBe(false); // ~5.66
  });

  it('accepts an explicit threshold', () => {
    expect(exceedsDragThreshold(10, 0, 20)).toBe(false);
    expect(exceedsDragThreshold(30, 0, 20)).toBe(true);
  });
});

describe('dragActivation', () => {
  it('makes touch wait for a deliberate hold, since a moving finger means scroll', () => {
    expect(dragActivation('touch')).toBe('hold');
  });

  it('lets mouse and pen start dragging on movement alone', () => {
    expect(dragActivation('mouse')).toBe('threshold');
    expect(dragActivation('pen')).toBe('threshold');
    expect(dragActivation('')).toBe('threshold');
  });
});

describe('findDropZone', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="outside">nowhere</div>
      <div data-drop-group="order" data-drop-zone="2" id="zone">
        <span id="inner">nested</span>
      </div>
      <div data-drop-group="categorise" data-drop-zone="0" id="other-group"></div>
      <div data-drop-group="order" data-drop-zone="-1" id="source"></div>
      <div data-drop-group="order" data-drop-zone="nope" id="malformed"></div>
    `;
  });

  const byId = (id: string) => document.getElementById(id);

  it('finds the zone an element is nested inside, not just the zone element itself', () => {
    expect(findDropZone(byId('zone'), 'order')).toBe(2);
    expect(findDropZone(byId('inner'), 'order')).toBe(2);
  });

  it('resolves a source/pool zone, whose index is negative by convention', () => {
    expect(findDropZone(byId('source'), 'order')).toBe(-1);
  });

  it('rejects a zone belonging to another group', () => {
    expect(findDropZone(byId('other-group'), 'order')).toBeNull();
  });

  it('rejects an element in no zone at all, and a null element', () => {
    expect(findDropZone(byId('outside'), 'order')).toBeNull();
    expect(findDropZone(null, 'order')).toBeNull();
  });

  it('rejects a non-integer zone rather than reporting NaN as a target', () => {
    expect(findDropZone(byId('malformed'), 'order')).toBeNull();
  });
});
