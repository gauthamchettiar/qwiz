/** A short-lived cache of group INDEXES, so reopening a repository doesn't re-fetch it.
 *
 * Deliberately narrow, and the boundary is the point: this stores the manifest, the resolved entry
 * list and the sub-group folders — the things needed to DRAW the group screen. It never stores quiz
 * bodies. Those can be megabytes with embedded images, and keeping them is what "Save to Browser"
 * is for (`savedGroups.ts`) — a thing the visitor asked for, not something a cache should decide to
 * do with their quota.
 *
 * Stale-while-revalidate: a cached index paints immediately and a fresh fetch replaces it. So the
 * cache never makes the screen WRONG, only faster — a repository updated a minute ago shows its old
 * shape for as long as the paint takes, then corrects itself.
 */

import { z } from 'zod';

const STORAGE_KEY = 'qwiz:remote-cache';

/** How long a cached index is served before a fetch is waited on rather than merely started.
 * Chosen to sit just past `raw.githubusercontent.com`'s own ~5 minute CDN window: caching for
 * appreciably longer would only be caching GitHub's cache. */
const TTL_MS = 10 * 60 * 1000;

/** Enough repositories to make going back and forth free, few enough that a browsing session can't
 * grow the record without bound. Least-recently-fetched is evicted. */
const MAX_ENTRIES = 20;

/** A `QuizGroup` as stored. Written out rather than derived from the TS interface because this is
 * the trust boundary: anything read back from storage is untrusted input and has to be parsed, not
 * asserted (CLAUDE.md §6). Caching the RESOLVED group, rather than the manifest text, means the
 * paint path never re-runs the parser or re-derives discovery — it just renders. */
const groupSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  entries: z.array(
    z.object({
      id: z.string(),
      path: z.string(),
      title: z.string().optional(),
      group: z.string().optional(),
      requires: z.array(z.string()),
      settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    })
  )
});

const entrySchema = z.object({
  group: groupSchema,
  /** Folders below this one that have a manifest of their own. */
  subGroups: z.array(z.string()),
  fromManifest: z.boolean(),
  warnings: z.array(z.string()),
  fetchedAt: z.string()
});

const allSchema = z.record(z.string(), entrySchema);

export type CachedGroupIndex = z.infer<typeof entrySchema>;

function readAll(): Record<string, CachedGroupIndex> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = allSchema.safeParse(JSON.parse(raw));
    // A cache is the one place where dropping everything on a shape change is exactly right —
    // there is nothing to lose, and the next fetch refills it.
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeAll(entries: Record<string, CachedGroupIndex>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(evictOldest(entries)));
    return true;
  } catch {
    // A cache that can't be written is a cache that doesn't exist, and that's survivable — unlike
    // a quiz or a saved group, nothing is lost. So this stays quiet rather than surfacing.
    return false;
  }
}

/** Keeps the most recently fetched `limit` entries. Pure and exported so the eviction rule is
 * testable without a browser. */
export function evictOldest(
  entries: Record<string, CachedGroupIndex>,
  limit = MAX_ENTRIES
): Record<string, CachedGroupIndex> {
  const keys = Object.keys(entries);
  if (keys.length <= limit) return entries;

  const kept = keys
    .sort((a, b) => entries[b].fetchedAt.localeCompare(entries[a].fetchedAt))
    .slice(0, limit);
  return Object.fromEntries(kept.map((key) => [key, entries[key]]));
}

/** Whether a cached index is young enough to be treated as current. Exported, with `now` as a
 * parameter, so the expiry rule is a pure function rather than something only a fake clock can
 * check. */
export function isFresh(entry: CachedGroupIndex, now = Date.now()): boolean {
  const age = now - Date.parse(entry.fetchedAt);
  return Number.isFinite(age) && age >= 0 && age < TTL_MS;
}

export function readCachedIndex(key: string): CachedGroupIndex | null {
  return readAll()[key] ?? null;
}

export function writeCachedIndex(key: string, index: Omit<CachedGroupIndex, 'fetchedAt'>): boolean {
  const all = readAll();
  all[key] = { ...index, fetchedAt: new Date().toISOString() };
  return writeAll(all);
}

/** Drops one repository's cached index — what a Refresh control uses to force a real fetch. */
export function clearCachedIndex(key: string): void {
  const all = readAll();
  if (!(key in all)) return;
  delete all[key];
  writeAll(all);
}
