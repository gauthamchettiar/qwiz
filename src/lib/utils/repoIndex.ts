/** Turning a repository into a `QuizGroup` — with or without a `.qwizgroup` manifest in it.
 *
 * The design point worth keeping: BOTH paths produce the same `QuizGroup` type, so everything
 * downstream (the folder tree, every mode, the player host) reads one shape and has no idea whether
 * a manifest existed. A repo with no manifest isn't a second code path, it's a synthesised manifest.
 *
 * The two paths differ only in what they cost:
 *   - a manifest that lists its quizzes  → zero `api.github.com` calls, because every path is known
 *     up front and content comes from the unmetered raw host
 *   - no manifest (or `:discover=true`)  → one recursive tree call, against a 60-per-hour limit
 *     shared by everything on the visitor's IP
 * That difference is the whole reason the manifest is worth writing, and it's what the rate-limit
 * error message points at.
 */

import { dirOf, isGroupManifestPath, isQwizPath, resolveEntryPath } from './githubRef';
import {
  emptyQuizGroup,
  groupMode,
  slugFromPath,
  type QuizGroup,
  type QuizGroupEntry
} from './quizGroup';

/** Whether this group needs the tree API at all. `folders` with `:discover=true` asks for it
 * explicitly; a manifest with no entries has nothing to show without it. */
export function needsDiscovery(group: QuizGroup): boolean {
  if (group.settings.discover === true) return true;
  return group.entries.length === 0 && groupMode(group) === 'folders';
}

/** Resolves every entry's manifest-relative path against the folder the manifest sits in, dropping
 * any that escape the repository root (`resolveEntryPath` returns null for those — the parser has
 * already rejected the obvious cases, so this is the belt to that braces). */
export function resolveGroupEntries(group: QuizGroup, manifestDir: string): QuizGroup {
  const entries: QuizGroupEntry[] = [];
  for (const entry of group.entries) {
    const resolved = resolveEntryPath(manifestDir, entry.path);
    if (resolved) entries.push({ ...entry, path: resolved });
  }
  return { ...group, entries };
}

/** A group synthesised from whatever `.qwiz` files a repository actually contains.
 *
 * `base` scopes it to a subfolder. Files are sorted by path so the result is stable — the tree API
 * makes no ordering promise, and an unstable order would reshuffle a lobby between two loads of the
 * same unchanged repo. */
export function groupFromTree(paths: readonly string[], base = ''): QuizGroup {
  const prefix = base ? `${base.replace(/\/+$/, '')}/` : '';
  const quizPaths = paths
    .filter((path) => isQwizPath(path) && path.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b));

  const group = emptyQuizGroup();
  group.settings = { mode: 'folders' };
  group.entries = quizPaths.map((path) => ({
    id: uniqueId(path, quizPaths),
    path,
    requires: [],
    settings: {}
  }));
  return group;
}

/** Two files in different folders can share a filename, and the slug is derived from the filename —
 * so `rounds/one.qwiz` and `extra/one.qwiz` would both want to be `one`. Where that happens, the id
 * falls back to the full path, which is unique by construction. Only the colliding entries pay the
 * uglier id, so the common case still reads well. */
function uniqueId(path: string, allPaths: readonly string[]): string {
  const slug = slugFromPath(path);
  const collides = allPaths.filter((other) => slugFromPath(other) === slug).length > 1;
  return collides ? path.replace(/\.qwiz$/i, '') : slug;
}

/** Merges a manifest's own entries with the ones discovery found, manifest first and winning on
 * path — so `:discover=true` means "everything I listed, plus anything I forgot", never a set of
 * duplicates where the manifest's titles and settings are silently lost. */
export function mergeDiscovered(group: QuizGroup, discovered: QuizGroup): QuizGroup {
  const known = new Set(group.entries.map((entry) => entry.path));
  const ids = new Set(group.entries.map((entry) => entry.id));

  const extra = discovered.entries
    .filter((entry) => !known.has(entry.path))
    .map((entry) => {
      if (!ids.has(entry.id)) {
        ids.add(entry.id);
        return entry;
      }
      const fallback = entry.path.replace(/\.qwiz$/i, '');
      ids.add(fallback);
      return { ...entry, id: fallback };
    });

  return { ...group, entries: [...group.entries, ...extra] };
}

/** The `.qwizgroup` that governs a file: the nearest one at or above its folder.
 *
 * Deepest-root-wins, so a repository can hold several groups — a manifest in `rounds/` owns
 * everything under `rounds/`, and one at the root owns whatever's left. Only reachable on the
 * discovery path, since that's the only time the full list of manifests is known. */
export function governingManifest(
  filePath: string,
  manifestPaths: readonly string[]
): string | null {
  const candidates = manifestPaths
    .filter((manifest) => {
      const dir = dirOf(manifest);
      return dir === '' || filePath === dir || filePath.startsWith(`${dir}/`);
    })
    .sort((a, b) => dirOf(b).length - dirOf(a).length);
  return candidates[0] ?? null;
}

/** Every manifest in a tree, so a folders lobby can offer a nested group as its own screen rather
 * than flattening its contents into the parent's list. */
export function manifestPathsIn(paths: readonly string[], base = ''): string[] {
  const prefix = base ? `${base.replace(/\/+$/, '')}/` : '';
  return paths
    .filter((path) => isGroupManifestPath(path) && path.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b));
}

/** Manifests strictly BELOW this group's own folder — the ones a folders lobby links to as
 * sub-groups. Excludes the group's own manifest, which is the one being rendered. */
export function subGroupDirs(paths: readonly string[], base = ''): string[] {
  const baseDir = base.replace(/\/+$/, '');
  return manifestPathsIn(paths, baseDir)
    .map(dirOf)
    .filter((dir) => dir !== baseDir);
}
