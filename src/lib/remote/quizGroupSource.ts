/** Loading a `.qwizgroup` out of a repository — the manifest-first sequence that keeps a published
 * group off the rate-limited API entirely.
 *
 * The order matters and is the whole design:
 *   1. Try `raw.githubusercontent.com/{owner}/{repo}/HEAD/{dir}/.qwizgroup`. Unmetered, and `HEAD`
 *      resolves to the default branch server-side, so this needs no call to look the branch up.
 *   2. Got one, and it lists its quizzes? Done — **zero `api.github.com` calls**.
 *   3. No manifest, or one asking to `:discover=true`? Now, and only now, spend one recursive tree
 *      call against the 60-per-hour limit shared by everything on this visitor's IP.
 *
 * A repo with no manifest still works; it just costs the call. That is exactly the trade the
 * rate-limit error message names, and it's the reason to write a manifest at all.
 */

import { GROUP_MANIFEST_NAME, isQwizPath, rawFileUrl, type RepoRef } from '@/lib/utils/githubRef';
import { groupMode, parseQwizGroup, type QuizGroup } from '@/lib/utils/quizGroup';
import {
  groupFromTree,
  mergeDiscovered,
  needsDiscovery,
  resolveGroupEntries,
  subGroupDirs
} from '@/lib/utils/repoIndex';
import { TREE_TRUNCATED_MESSAGE } from '@/lib/utils/githubRef';
import { fetchRepoTree, fetchText } from './github';

export interface LoadedQuizGroup {
  group: QuizGroup;
  /** Folders below this one that have a manifest of their own, offered as their own screens rather
   * than flattened into this list — that's what keeps a nested group at one manifest fetch. */
  subGroups: string[];
  /** Whether a `.qwizgroup` was actually found, as opposed to the group being synthesised from
   * whatever `.qwiz` files the repo contains. The lobby says which, since it changes what an
   * author should do next. */
  fromManifest: boolean;
  /** Non-fatal things the reader should still know — a truncated tree, a manifest that didn't
   * parse. The group renders anyway. */
  warnings: string[];
}

export interface LoadGroupResult {
  loaded?: LoadedQuizGroup;
  error?: string;
}

/** The manifest path for a repo folder — `.qwizgroup` at the root, or inside `dir`. */
function manifestPath(dir: string): string {
  return dir ? `${dir.replace(/\/+$/, '')}/${GROUP_MANIFEST_NAME}` : GROUP_MANIFEST_NAME;
}

export async function loadQuizGroup(ref: RepoRef): Promise<LoadGroupResult> {
  const dir = ref.path ?? '';
  const warnings: string[] = [];

  const manifest = await fetchText(rawFileUrl(ref, manifestPath(dir)), 'file');

  let group: QuizGroup | null = null;
  if (manifest.ok) {
    const parsed = parseQwizGroup(manifest.data);
    if (parsed.errors.length > 0) {
      // A manifest that doesn't parse is reported in full rather than degraded past — the whole
      // point of the strict parser is that an author hears about a typo. There's nothing sensible
      // to render from a half-understood manifest, so this is fatal rather than a warning.
      return {
        error: `This group's .qwizgroup file has ${parsed.errors.length === 1 ? 'a problem' : 'problems'}:\n${parsed.errors.join('\n')}`
      };
    }
    group = resolveGroupEntries(parsed.group, dir);
  }

  const discovering = group === null || needsDiscovery(group);

  if (!discovering && group) {
    return { loaded: { group, subGroups: [], fromManifest: true, warnings } };
  }

  const tree = await fetchRepoTree(ref);
  if (!tree.ok) {
    // A listed manifest that merely ASKED to discover shouldn't lose everything it did list just
    // because the API refused — fall back to exactly what it named.
    if (group && group.entries.length > 0) {
      warnings.push(tree.error);
      return { loaded: { group, subGroups: [], fromManifest: true, warnings } };
    }
    return { error: tree.error };
  }

  if (tree.data.truncated) warnings.push(TREE_TRUNCATED_MESSAGE);

  const discovered = groupFromTree(tree.data.paths, dir);
  const subGroups = subGroupDirs(tree.data.paths, dir);

  // A discovered file that belongs to a nested group is left to that group's own screen rather than
  // listed twice — otherwise a repo with a manifest per folder shows every quiz at the top level as
  // well as inside its group.
  const owned = {
    ...discovered,
    entries: discovered.entries.filter(
      (entry) => !subGroups.some((sub) => entry.path.startsWith(`${sub}/`))
    )
  };

  const merged = group ? mergeDiscovered(group, owned) : owned;

  if (merged.entries.length === 0 && subGroups.length === 0) {
    return {
      error: hasAnyQwiz(tree.data.paths)
        ? `No .qwiz files in "${dir}". Check the folder, or drop the path to browse the whole repository.`
        : "This repository doesn't contain any .qwiz files."
    };
  }

  return {
    loaded: { group: merged, subGroups, fromManifest: group !== null, warnings }
  };
}

function hasAnyQwiz(paths: readonly string[]): boolean {
  return paths.some((path) => isQwizPath(path));
}

/** Whether this group can be played as a single run, which decides whether the lobby offers a
 * "Play all" action at all. Kept here beside the loader because it's the one thing a caller needs
 * to know about a loaded group before it renders anything. */
export function isPlayableAsRun(group: QuizGroup): boolean {
  const mode = groupMode(group);
  return mode !== 'folders' && group.entries.length > 0;
}
