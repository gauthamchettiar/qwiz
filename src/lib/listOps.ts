/** Small pure helpers for the update/remove/reorder-by-id pattern used across the builder
 * (questions, options, extras) — each returns a new array, never mutating the input. */

/** Returns a copy of `list` with the item whose `id` matches replaced by `updated`. */
export function updateInList<T extends { id: string }>(list: T[], id: string, updated: T): T[] {
  return list.map((item) => (item.id === id ? updated : item));
}

/** Returns a copy of `list` with the item whose `id` matches removed. */
export function removeFromList<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((item) => item.id !== id);
}

/** Returns a copy of `list` with the item at `id` swapped one slot in `dir` (-1 up, 1 down).
 * Returns the list unchanged if the move would fall off either end. */
export function moveInList<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const idx = list.findIndex((item) => item.id === id);
  const newIdx = idx + dir;
  if (idx < 0 || newIdx < 0 || newIdx >= list.length) return list;
  const copy = [...list];
  [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
  return copy;
}
