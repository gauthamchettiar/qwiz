/** Groups the visitor has saved to this browser, contents and all.
 *
 * The fourth module allowed to touch `localStorage` (CLAUDE.md §4). A saved group is a FULL OFFLINE
 * COPY — the `.qwizgroup` manifest plus every `.qwiz` file it names — so opening it makes no
 * network request at all. That's the deliberate difference from `remoteCache.ts`, which caches the
 * index only and expires: a cache is a speed-up the app manages, a saved group is a thing the
 * visitor asked to keep.
 *
 * Two costs come with that choice, both real and both surfaced rather than hidden:
 *   - **Size.** A group whose quizzes embed base64 images can be megabytes, and `localStorage` is
 *     typically capped around 5MB. `saveGroup` returns `false` when the write doesn't land, exactly
 *     as `saveQuiz` does, and callers must say so rather than claim success.
 *   - **Staleness.** A saved copy is a snapshot. It never changes when the author updates the
 *     repository, so the UI shows when it was taken and offers a refresh.
 */

import { z } from 'zod';

const STORAGE_KEY = 'qwiz:saved-groups';

const fileSchema = z.object({
  path: z.string(),
  content: z.string()
});

const savedGroupSchema = z.object({
  id: z.string(),
  /** `owner/repo[:path]` — how a saved group is matched to the remote it came from, so saving the
   * same group twice updates it rather than accumulating duplicates. */
  key: z.string(),
  title: z.string(),
  description: z.string(),
  mode: z.string(),
  owner: z.string(),
  repo: z.string(),
  path: z.string(),
  ref: z.string(),
  /** The `.qwizgroup` source exactly as fetched, so it re-parses through the ordinary parser. */
  manifest: z.string(),
  /** Every `.qwiz` the manifest names, keyed by its repo-relative path. */
  files: z.array(fileSchema),
  savedAt: z.string()
});

export type SavedGroup = z.infer<typeof savedGroupSchema>;

/** Same parse-don't-validate contract as `quizzes.ts`: a record that doesn't match the schema is
 * dropped rather than handed to a renderer that assumes it's well formed. */
function readAll(): Record<string, SavedGroup> {
  // `window`, not `localStorage` — Node 22+ defines a global `localStorage` that throws on use;
  // see the long note in quizzes.ts.
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const valid: Record<string, SavedGroup> = {};
    for (const [id, candidate] of Object.entries(parsed)) {
      const result = savedGroupSchema.safeParse(candidate);
      if (result.success) valid[id] = result.data;
      else console.warn(`Dropping invalid saved group "${id}":`, result.error.message);
    }
    return valid;
  } catch {
    return {};
  }
}

/** Returns whether the write actually landed. Quota is a live concern here in a way it isn't for a
 * theme preference — a group of image-heavy quizzes can be megabytes. */
function writeAll(groups: Record<string, SavedGroup>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
    return true;
  } catch (error) {
    console.error('Failed to persist saved groups to localStorage:', error);
    return false;
  }
}

export function listSavedGroups(): SavedGroup[] {
  return Object.values(readAll()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getSavedGroup(id: string): SavedGroup | null {
  return readAll()[id] ?? null;
}

/** The saved copy of a particular remote group, if there is one — so the group screen can say
 * "saved" rather than offering to save it again. */
export function findSavedGroupByKey(key: string): SavedGroup | null {
  return Object.values(readAll()).find((group) => group.key === key) ?? null;
}

/** Saves, or re-saves. Saving a group already held under the same `key` REPLACES it and keeps its
 * id, so a refresh updates the entry in place rather than leaving two copies of the same group in
 * the list — and any link to it keeps working. */
export function saveGroup(group: Omit<SavedGroup, 'id' | 'savedAt'>): {
  saved?: SavedGroup;
  error?: string;
} {
  const all = readAll();
  const existing = Object.values(all).find((candidate) => candidate.key === group.key);

  const record: SavedGroup = {
    ...group,
    id: existing?.id ?? crypto.randomUUID(),
    savedAt: new Date().toISOString()
  };

  all[record.id] = record;
  if (!writeAll(all)) {
    return {
      error:
        "Couldn't save this group — it may be too large for your browser's storage, or storage may be unavailable (e.g. private browsing)."
    };
  }
  return { saved: record };
}

/** Returns whether the group existed and the deletion was actually persisted — same contract as
 * `deleteQuiz`. */
export function deleteSavedGroup(id: string): boolean {
  const all = readAll();
  if (!(id in all)) return false;
  delete all[id];
  return writeAll(all);
}
