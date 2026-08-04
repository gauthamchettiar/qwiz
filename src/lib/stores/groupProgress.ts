/** How far a visitor has got through a journey, kept in their own browser exactly like their
 * quizzes are.
 *
 * The third module allowed to touch `localStorage` (see CLAUDE.md §4), alongside `quizzes.ts` and
 * `theme.ts`. It stays separate for the same reason those two are separate: this is progress
 * against a REMOTE group, keyed by repository rather than by quiz id, and putting it behind
 * `quizSchema`'s contract would mean nothing.
 *
 * Keyed by `owner/repo[:path]` + the manifest's own entry id, deliberately NOT by the quiz's id —
 * a fetched quiz gets a fresh `crypto.randomUUID()` on every load, so a quiz id would reset
 * progress on every visit. The ref is also deliberately excluded from the key (see `repoKey`), so
 * progress survives the repository being updated. The cost, stated because it's real: a quiz that
 * gets rewritten keeps its old "cleared" mark. Keying by content hash would be worse — every typo
 * fix would wipe everyone's progress.
 */

import { z } from 'zod';
import type { JourneyProgress } from '@/lib/utils/journey';

const STORAGE_KEY = 'qwiz:group-progress';

/** How many groups to remember. Each is a few hundred bytes, so this is nowhere near a quota
 * problem — the cap exists so a visitor who browses a lot of repositories doesn't accumulate an
 * unbounded record forever. Least-recently-updated is evicted first. */
const MAX_GROUPS = 50;

const playSchema = z.object({
  completed: z.boolean(),
  won: z.boolean()
});

const groupSchema = z.object({
  plays: z.record(z.string(), playSchema),
  updatedAt: z.string()
});

const allSchema = z.record(z.string(), groupSchema);

type StoredGroup = z.infer<typeof groupSchema>;

/** Same parse-don't-validate contract as `quizzes.ts`: anything that doesn't match the schema is
 * dropped rather than handed downstream, so a hand-edited or stale-shape value can't crash a map. */
function readAll(): Record<string, StoredGroup> {
  // Checked via `window` rather than `localStorage` for the reason quizzes.ts documents at length:
  // Node 22+ defines a global `localStorage` that throws on use.
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = allSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('Dropping unreadable group progress:', parsed.error.message);
      return {};
    }
    return parsed.data;
  } catch {
    return {};
  }
}

/** Returns whether the write actually landed — same contract, and same reasoning, as `saveQuiz`.
 * Progress is less precious than a quiz, but a caller that wants to say "saved" still has to be
 * able to tell. */
function writeAll(all: Record<string, StoredGroup>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(evictOldest(all)));
    return true;
  } catch (error) {
    console.error('Failed to persist group progress to localStorage:', error);
    return false;
  }
}

/** Keeps the most recently updated `MAX_GROUPS`. Pure and exported so the eviction rule is testable
 * without a browser. */
export function evictOldest(
  all: Record<string, StoredGroup>,
  limit = MAX_GROUPS
): Record<string, StoredGroup> {
  const keys = Object.keys(all);
  if (keys.length <= limit) return all;

  const kept = keys
    .sort((a, b) => all[b].updatedAt.localeCompare(all[a].updatedAt))
    .slice(0, limit);
  return Object.fromEntries(kept.map((key) => [key, all[key]]));
}

export function readJourneyProgress(groupKey: string): JourneyProgress {
  return readAll()[groupKey]?.plays ?? {};
}

/** Records a finished run.
 *
 * `won` is sticky: once a quiz has been cleared it stays cleared, so replaying it and doing worse
 * can never re-lock the quizzes it already opened. That's the difference between a journey that
 * rewards exploration and one that punishes it. */
export function recordJourneyPlay(groupKey: string, entryId: string, won: boolean): boolean {
  const all = readAll();
  const group = all[groupKey] ?? { plays: {}, updatedAt: '' };
  const previous = group.plays[entryId];

  all[groupKey] = {
    plays: {
      ...group.plays,
      [entryId]: { completed: true, won: (previous?.won ?? false) || won }
    },
    updatedAt: new Date().toISOString()
  };
  return writeAll(all);
}

/** Clears one group's progress — the "start over" a journey needs, scoped so it can't touch any
 * other group the visitor has played. */
export function resetJourneyProgress(groupKey: string): boolean {
  const all = readAll();
  if (!(groupKey in all)) return true;
  delete all[groupKey];
  return writeAll(all);
}
