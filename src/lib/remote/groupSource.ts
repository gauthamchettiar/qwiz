/** Where a group's files come from — a repository, or a copy saved to this browser.
 *
 * The pages that render and play a group shouldn't care which. Before this existed they each called
 * `loadQuizGroup` and `fetchRepoFile` directly, which meant supporting a saved copy would have
 * meant an `if (saved)` at every one of those call sites. One interface, two implementations, and
 * the screens keep exactly one code path.
 *
 * It lives under `lib/remote/` even though the saved implementation never touches the network,
 * because the interface is the same one the remote implementation defines and splitting them across
 * folders would only make the pairing harder to find.
 */

import { repoKey, type RepoRef } from '@/lib/utils/githubRef';
import { parseQwizGroup } from '@/lib/utils/quizGroup';
import { resolveGroupEntries } from '@/lib/utils/repoIndex';
import type { SavedGroup } from '@/lib/stores/savedGroups';
import { readCachedIndex, writeCachedIndex, isFresh } from '@/lib/stores/remoteCache';
import { fetchRepoFile, fetchRepoFiles, type Fetched, type FetchedRepoFiles } from './github';
import { loadQuizGroup, type LoadGroupResult, type LoadedQuizGroup } from './quizGroupSource';

export interface GroupSource {
  kind: 'remote' | 'saved';
  /** Identity, for progress keys and for matching a saved copy to its remote. */
  key: string;
  /** Present only for a remote source — what a "view on GitHub" link needs. */
  repo?: RepoRef;
  /** Present only for a saved source. */
  savedId?: string;
  /** When a saved copy was taken. Absent for a remote source, which is always current. */
  savedAt?: string;
  load(options?: { refresh?: boolean }): Promise<LoadGroupResult>;
  readFile(path: string): Promise<Fetched<string>>;
  readFiles(paths: readonly string[]): Promise<FetchedRepoFiles>;
}

/** A group read from GitHub, with its index cached.
 *
 * The cache is stale-while-revalidate ONLY in the sense that a fresh entry short-circuits the
 * fetch; it deliberately doesn't paint-then-swap, because a group screen that reshuffles itself a
 * beat after loading is worse than one that took an extra moment. `refresh` skips it entirely,
 * which is what a Refresh control wants. */
export function remoteGroupSource(ref: RepoRef): GroupSource {
  const key = repoKey(ref);

  return {
    kind: 'remote',
    key,
    repo: ref,
    async load(options = {}) {
      if (!options.refresh) {
        const cached = readCachedIndex(key);
        if (cached && isFresh(cached)) {
          return {
            loaded: {
              group: cached.group,
              subGroups: cached.subGroups,
              fromManifest: cached.fromManifest,
              warnings: cached.warnings
            }
          };
        }
      }

      const result = await loadQuizGroup(ref);
      if (result.loaded) {
        // Best-effort: a cache that can't be written just means the next visit fetches again.
        writeCachedIndex(key, {
          group: result.loaded.group,
          subGroups: result.loaded.subGroups,
          fromManifest: result.loaded.fromManifest,
          warnings: result.loaded.warnings
        });
      }
      return result;
    },
    readFile: (path) => fetchRepoFile(ref, path),
    readFiles: (paths) => fetchRepoFiles(ref, paths)
  };
}

/** A group held entirely in this browser. Every method resolves without a network request — that's
 * the whole point of having saved it. */
export function savedGroupSource(saved: SavedGroup): GroupSource {
  const files = new Map(saved.files.map((file) => [file.path, file.content]));

  return {
    kind: 'saved',
    key: saved.key,
    savedId: saved.id,
    savedAt: saved.savedAt,
    async load(): Promise<LoadGroupResult> {
      // Re-parsed rather than stored pre-parsed, so a saved copy goes through the same parser as
      // everything else — including its error messages, if the format ever moves under it.
      const parsed = parseQwizGroup(saved.manifest);
      if (parsed.errors.length > 0) {
        return {
          error: `This saved group can no longer be read:\n${parsed.errors.join('\n')}`
        };
      }

      const group = resolveGroupEntries(parsed.group, saved.path);
      const loaded: LoadedQuizGroup = {
        group,
        // A saved copy is flat by construction: saving a group saves the quizzes it lists, not the
        // sibling groups next to it in the repository.
        subGroups: [],
        fromManifest: true,
        warnings: []
      };
      return { loaded };
    },
    async readFile(path) {
      const content = files.get(path);
      return content === undefined
        ? { ok: false, error: "That quiz isn't in this saved copy of the group." }
        : { ok: true, data: content };
    },
    async readFiles(paths) {
      const found: { path: string; content: string }[] = [];
      const skipped: string[] = [];
      for (const path of paths) {
        const content = files.get(path);
        if (content === undefined) skipped.push(path);
        else found.push({ path, content });
      }
      return { files: found, skipped };
    }
  };
}
