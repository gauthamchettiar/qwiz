/** Svelte action: calls `onOutside` on any pointerdown outside `node`, and on Escape. Used to
 * dismiss popover menus (e.g. the question-type pickers) the same way a native <select> would. */
export function clickOutside(node: HTMLElement, onOutside: () => void) {
  function handlePointer(e: PointerEvent) {
    if (!node.contains(e.target as Node)) onOutside();
  }
  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onOutside();
  }
  document.addEventListener('pointerdown', handlePointer, true);
  document.addEventListener('keydown', handleKey);
  return {
    destroy() {
      document.removeEventListener('pointerdown', handlePointer, true);
      document.removeEventListener('keydown', handleKey);
    }
  };
}
