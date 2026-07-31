/** Pointer-driven drag-and-drop for the answer boards (order_items/match_pairs/group_items/fill_blanks),
 * layered ON TOP OF their existing tap-to-pick-then-tap-to-place interaction rather than replacing
 * it — see `draggable` below for how one gesture is split between the two.
 *
 * Why pointer events rather than HTML5 drag-and-drop (`draggable="true"` + dragstart/dragover/
 * drop): HTML5 DnD never fires on touch. Mobile Safari and Chrome Android don't implement it for
 * touch input at all, so a `dragstart`-based board is a desktop-only feature. Pointer events cover
 * mouse, touch and pen through one code path, which is the whole point here — this app is used on
 * a phone at least as much as on a desktop.
 *
 * Accessibility: dragging is a pure enhancement. Every item and drop target remains a real
 * `<button>` driven by the tap state machine in QuestionPlayer.svelte, so Tab + Enter/Space still
 * completes any board without a pointer — nothing here is the only route to a placement.
 */

/** How far a pointer must travel before a press becomes a drag instead of a tap. Small enough that
 * a deliberate drag feels immediate, large enough that the jitter in a real tap (especially a
 * thumb) doesn't accidentally lift the item. */
export const DRAG_THRESHOLD_PX = 6;

/** How long a touch must stay put before it takes over as a drag. Touch can't use the movement
 * threshold that mouse/pen do: on a phone, a finger moving across an item is the ordinary "scroll
 * the page" gesture, and there's no way to tell it apart from the start of a drag at the moment it
 * begins. A short deliberate hold first is unambiguous, and matches the reorder gesture both iOS
 * and Android already use, so it needs no teaching. */
export const TOUCH_HOLD_MS = 220;

export interface DragState {
  /** The `id` of the item currently being dragged. */
  id: number;
  /** The `data-drop-zone` currently under the pointer, or `null` when it's over nothing that
   * accepts this item — what a board reads to highlight the zone about to receive the drop. */
  overZone: number | null;
}

export interface DraggableParams {
  /** This item's identifier, handed straight back to `onDrop` — an original option index
   * everywhere this is currently used. */
  id: number;
  /** Only drop zones carrying a matching `data-drop-group` accept this item, so (for example) a
   * group_items pool item can't be dropped into a fill_blanks blank that happens to be on the
   * same screen. */
  group: string;
  /** Locked boards report no drags at all. */
  disabled?: boolean;
  /** What the ghost is cloned from, when the thing you grab isn't the thing that moves — a small
   * grip handle inside a much larger row, say. The grab offset is measured against this too, so
   * the ghost stays exactly over the element it's standing in for. Defaults to `node`. */
  ghostFrom?: HTMLElement;
  /** Fires when a drag starts (with the initial state), whenever the hovered zone changes, and
   * with `null` when the drag ends or is cancelled. */
  onDragChange?: (state: DragState | null) => void;
  /** Fires once, on a drag released over a valid zone. A drag released anywhere else is simply
   * abandoned — nothing moves, exactly like dropping a card next to the table rather than on it. */
  onDrop?: (id: number, zoneId: number) => void;
}

/** Whether a pointer has moved far enough from where it went down to count as a drag rather than a
 * tap. Straight-line distance, so diagonal movement isn't held to a laxer standard than
 * axis-aligned movement. */
export function exceedsDragThreshold(
  dx: number,
  dy: number,
  threshold = DRAG_THRESHOLD_PX
): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/** The `data-drop-zone` of the zone `element` sits inside, if that zone belongs to `group`.
 * `null` for an element outside any zone, inside another group's zone, or inside a zone whose
 * `data-drop-zone` isn't an integer — a caller can treat all three the same way ("not a valid
 * target"), so they deliberately aren't distinguished. */
export function findDropZone(element: Element | null, group: string): number | null {
  const zone = element?.closest<HTMLElement>('[data-drop-zone]');
  if (!zone || zone.dataset.dropGroup !== group) return null;
  const id = Number(zone.dataset.dropZone);
  return Number.isInteger(id) ? id : null;
}

/** Which gesture promotes a press into a drag, per input type — see `TOUCH_HOLD_MS`. */
export function dragActivation(pointerType: string): 'hold' | 'threshold' {
  return pointerType === 'touch' ? 'hold' : 'threshold';
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/* v8 ignore start -- everything below is browser-side-effect code: pointer capture,
   `elementFromPoint` hit-testing against real layout, and a ghost element appended to the document.
   jsdom implements none of that, so a unit test here could only assert against mocks of the very
   APIs being driven. It's covered end-to-end instead, in a real browser, by
   e2e/drag-and-drop.spec.ts — same division as `download.ts`'s `downloadTextFile`. The decisions
   this plumbing makes (tap vs drag, which zone, which activation gesture) are factored out into the
   pure, unit-tested helpers above precisely so that the untestable part stays dumb. */

/** A visual copy of the item that follows the pointer, so there's something to actually aim with —
 * the original stays in place (dimmed by the board) to keep the layout from collapsing mid-drag.
 * Styled inline rather than with utility classes because these values are computed from the
 * element being dragged, and because a class string referenced only from a `.ts` file is exactly
 * the kind of thing Tailwind's scanner is entitled to miss. */
function buildGhost(node: HTMLElement): HTMLElement {
  const rect = node.getBoundingClientRect();
  const computed = getComputedStyle(node);
  const ghost = node.cloneNode(true) as HTMLElement;

  // A cloned drop zone must never be hit-testable itself, and a cloned control must never be
  // focusable or reachable by assistive tech — this is decoration, not a second copy of the UI.
  ghost.removeAttribute('data-drop-zone');
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('tabindex', '-1');

  ghost.style.position = 'fixed';
  ghost.style.left = '0';
  ghost.style.top = '0';
  ghost.style.margin = '0';
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '50';
  ghost.style.opacity = '0.92';
  ghost.style.boxShadow = '0 12px 24px -8px rgb(15 23 42 / 0.45)';
  // A transparent original would render as a floating, borderless smear of text.
  if (computed.backgroundColor === TRANSPARENT) ghost.style.backgroundColor = '#fff';

  return ghost;
}

export function draggable(node: HTMLElement, params: DraggableParams) {
  let current = params;

  let activePointer: number | null = null;
  let startX = 0;
  let startY = 0;
  /** Where inside the item the pointer grabbed it, so the ghost stays under the same spot rather
   * than snapping its corner or centre to the cursor. */
  let grabX = 0;
  let grabY = 0;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let dragging = false;
  let ghost: HTMLElement | null = null;
  let overZone: number | null = null;
  /** A drag that ends back over the item it started on still produces a `click`, which would run
   * the tap handler and undo (or double-apply) what the drop just did. */
  let swallowNextClick = false;

  function report() {
    current.onDragChange?.(dragging ? { id: current.id, overZone } : null);
  }

  function moveGhost(x: number, y: number) {
    if (ghost) ghost.style.transform = `translate3d(${x - grabX}px, ${y - grabY}px, 0)`;
  }

  function beginDrag(x: number, y: number) {
    clearTimeout(holdTimer);
    dragging = true;
    ghost = buildGhost(current.ghostFrom ?? node);
    moveGhost(x, y);
    document.body.appendChild(ghost);
    // The node's own `user-select: none` (see below) stops a selection STARTING on it, but a drag
    // that travels over other text can still extend one that the browser decides to begin
    // elsewhere mid-gesture. Suppressing it document-wide for the duration is the only thing that
    // covers the whole path the finger takes.
    document.body.style.userSelect = 'none';
    report();
  }

  function endDrag(dropped: boolean) {
    clearTimeout(holdTimer);
    if (activePointer !== null && node.hasPointerCapture(activePointer)) {
      node.releasePointerCapture(activePointer);
    }
    ghost?.remove();
    ghost = null;
    document.body.style.userSelect = '';
    const zone = overZone;
    const wasDragging = dragging;
    dragging = false;
    overZone = null;
    activePointer = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    report();

    if (wasDragging) {
      swallowNextClick = true;
      if (dropped && zone !== null) current.onDrop?.(current.id, zone);
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (current.disabled || activePointer !== null) return;
    // Ignore secondary mouse buttons; touch/pen report button 0 for a primary contact too.
    if (e.button !== 0) return;

    activePointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    const rect = (current.ghostFrom ?? node).getBoundingClientRect();
    grabX = e.clientX - rect.left;
    grabY = e.clientY - rect.top;

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);

    if (dragActivation(e.pointerType) === 'hold') {
      const { clientX, clientY, pointerId } = e;
      holdTimer = setTimeout(() => {
        // Capture keeps the rest of the gesture aimed at this node even as the finger travels over
        // other elements, and stops the browser reinterpreting it as a scroll or a text selection.
        if (node.isConnected) node.setPointerCapture(pointerId);
        beginDrag(clientX, clientY);
      }, TOUCH_HOLD_MS);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== activePointer) return;

    if (!dragging) {
      const moved = exceedsDragThreshold(e.clientX - startX, e.clientY - startY);
      if (!moved) return;
      // Moving before the hold elapsed means this was a scroll (or a sloppy tap), not a drag —
      // stand down and let the browser have the gesture.
      if (dragActivation(e.pointerType) === 'hold') {
        endDrag(false);
        return;
      }
      node.setPointerCapture(e.pointerId);
      beginDrag(e.clientX, e.clientY);
    }

    // Suppresses the page scroll / text selection that would otherwise ride along with the drag.
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);

    const next = findDropZone(document.elementFromPoint(e.clientX, e.clientY), current.group);
    if (next !== overZone) {
      overZone = next;
      report();
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== activePointer) return;
    endDrag(true);
  }

  function onPointerCancel(e: PointerEvent) {
    if (e.pointerId !== activePointer) return;
    endDrag(false);
  }

  function onClickCapture(e: MouseEvent) {
    if (!swallowNextClick) return;
    swallowNextClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  /** `touch-action: none` is what stops the browser claiming a touch gesture as a page scroll, and
   * it has to be in place BEFORE the finger lands: the value is latched when the touch begins, so
   * setting it once a drag is underway — which is what this used to do — changes nothing about the
   * gesture already in flight. That's why touch dragging never worked at all. The browser started
   * panning on the first movement, fired `pointercancel`, and the drag was torn down before it
   * could begin; the page just scrolled.
   *
   * The cost is real and was the reason it was deferred: a touch starting on a draggable item no
   * longer scrolls the page. It's confined to the items themselves — every board has surrounding
   * space that still scrolls normally, the items are small, and this is the same tradeoff dnd-kit
   * and SortableJS make for the same reason. A locked board opts back out, since nothing there is
   * draggable and it's often the longest thing on screen (the end-of-run review).
   *
   * A long press is also how both mobile browsers start a text selection. Theirs fires around
   * 500ms, well after `TOUCH_HOLD_MS` has already begun a drag, so the selection highlight,
   * handles and magnifier come up on top of one in flight. `touch-action` doesn't suppress that;
   * `user-select` does, and `-webkit-touch-callout` is what stops iOS additionally offering its
   * copy/share menu for the same press. Nothing this is used on holds text worth selecting: every
   * one is a button, or a grip handle beside one. */
  function applyTouchPolicy() {
    node.style.touchAction = current.disabled ? '' : 'none';
  }

  node.style.userSelect = 'none';
  node.style.setProperty('-webkit-user-select', 'none');
  node.style.setProperty('-webkit-touch-callout', 'none');
  applyTouchPolicy();

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('click', onClickCapture, true);

  return {
    update(next: DraggableParams) {
      current = next;
      applyTouchPolicy();
      if (next.disabled && (dragging || activePointer !== null)) endDrag(false);
    },
    destroy() {
      endDrag(false);
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('click', onClickCapture, true);
    }
  };
}
/* v8 ignore stop */
