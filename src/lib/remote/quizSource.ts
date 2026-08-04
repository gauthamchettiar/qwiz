/** Turns a `QuizSourceRef` into the `.qwiz` document it points at.
 *
 * Lives under `lib/remote/` rather than beside `remoteSource.ts` in `lib/utils/` because two of the
 * three branches touch the network, and `lib/utils/` is pure by contract (CLAUDE.md §6). The
 * decision of WHICH branch applies is the pure part and stays in `remoteSource.ts`; this is the
 * part that goes and gets it.
 *
 * Returns `{ source, error, choices }` rather than throwing, matching `decodeSharePayload` — every
 * failure here is something about the link or the network, never a bug.
 */

import { decodeSharePayload } from '@/lib/utils/shareLink';
import type { QuizSourceRef } from '@/lib/utils/remoteSource';
import { getSavedGroup } from '@/lib/stores/savedGroups';
import { fetchGistQwizFiles, fetchRepoFile, matchesFileName, type GistFile } from './github';

export interface ResolvedQuizSource {
  source?: string;
  /** Set only when a gist holds several `.qwiz` files and the link didn't name one. The page shows
   * a picker rather than guessing — picking the first would silently play the wrong quiz, and
   * refusing outright would make a perfectly good gist unplayable. */
  choices?: GistFile[];
  error?: string;
}

export async function resolveQuizSource(ref: QuizSourceRef): Promise<ResolvedQuizSource> {
  if (ref.kind === 'fragment') {
    const decoded = await decodeSharePayload(ref.payload);
    return decoded.source
      ? { source: decoded.source }
      : { error: decoded.error ?? "This link couldn't be read." };
  }

  if (ref.kind === 'gist') {
    const fetched = await fetchGistQwizFiles(ref.gistId);
    if (!fetched.ok) return { error: fetched.error };

    const files = fetched.data;
    if (ref.file) {
      const wanted = files.find((file) => matchesFileName(file.name, ref.file as string));
      return wanted
        ? { source: wanted.content }
        : {
            error: `That gist has no file called "${ref.file}". It contains: ${files
              .map((file) => file.name)
              .join(', ')}.`
          };
    }

    if (files.length === 1) return { source: files[0].content };
    return { choices: files };
  }

  if (ref.kind === 'saved') {
    const group = getSavedGroup(ref.savedId);
    if (!group) return { error: "That saved group isn't in this browser any more." };

    const file = group.files.find((candidate) => candidate.path === ref.path);
    return file
      ? { source: file.content }
      : { error: "That quiz isn't in this saved copy of the group." };
  }

  const fetched = await fetchRepoFile(ref.repo, ref.path);
  return fetched.ok ? { source: fetched.data } : { error: fetched.error };
}
