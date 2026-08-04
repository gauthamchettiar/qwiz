/** Where the quiz on `/play` is coming from, read off the URL.
 *
 * `/play` has always meant "play a quiz that isn't in this browser's library". Until now there was
 * exactly one way to be that — a compressed document in the fragment — so the page read the
 * fragment directly. There are three now, and which one applies is a decision worth having in one
 * pure, tested place rather than spread through an `onMount`.
 *
 * On the privacy tradeoff, since it's a real one: `shareLink.ts` uses the FRAGMENT specifically
 * because a fragment is never sent to the server, which keeps a shared quiz as private as a stored
 * one. A `?gist=` / `?repo=` query string doesn't have that property — the host's access log learns
 * which quiz was opened. That's accepted here, and only here, because a gist or repo pointer names
 * something already public on GitHub: there's no private document to leak, only a public one to
 * name. A quiz that lives in the link itself still goes in the fragment, unchanged.
 */

import { isSafePath, parseGistRef, parseRepoRef, type RepoRef } from './githubRef';
import { readSharePayload } from './shareLink';

export type QuizSourceRef =
  /** The whole document, compressed into `#q=` — the original share link. */
  | { kind: 'fragment'; payload: string }
  /** A public gist. `file` names one of several `.qwiz` files in it; without it, a gist holding
   * more than one becomes a picker. */
  | { kind: 'gist'; gistId: string; file?: string }
  /** One `.qwiz` file in a public repository. */
  | { kind: 'repo'; repo: RepoRef; path: string }
  /** One `.qwiz` inside a group saved to this browser — read from the saved copy, never fetched. */
  | { kind: 'saved'; savedId: string; path: string };

/** `{}` means "this link carries no quiz at all", which the page reports differently from a
 * malformed pointer — the first is usually a truncated link, the second a typo. */
export function readQuizSourceRef(
  search: string,
  hash: string
): { ref?: QuizSourceRef; error?: string } {
  const params = new URLSearchParams(search);

  // A quiz inside a saved group. Checked first: a saved group records the repository it came from,
  // and reading THAT would put this straight back on the network, which is the one thing saving it
  // was meant to avoid.
  const saved = params.get('saved');
  if (saved !== null) {
    const path = params.get('path');
    if (!path) return { error: 'That link points at a saved group but not at a quiz inside it.' };
    return { ref: { kind: 'saved', savedId: saved, path } };
  }

  const gist = params.get('gist');
  if (gist !== null) {
    const parsed = parseGistRef(gist);
    if (!parsed) {
      return {
        error:
          "That doesn't look like a gist. Use the gist's id, or the whole gist.github.com address."
      };
    }
    const file = params.get('file');
    return { ref: { kind: 'gist', gistId: parsed.gistId, ...(file ? { file } : {}) } };
  }

  const repo = params.get('repo');
  if (repo !== null) {
    const parsed = parseRepoRef(repo);
    if (!parsed) {
      return {
        error:
          "That doesn't look like a repository. Use owner/name, or the whole github.com address."
      };
    }
    // A `/blob/<ref>/<path>` URL already carries the file, so `?path=` is optional when the repo
    // was pasted in that form — one less thing to assemble by hand when sharing.
    const path = params.get('path') ?? parsed.path;
    if (!path) {
      return { error: 'That link points at a repository but not at a quiz file inside it.' };
    }
    if (!isSafePath(path) || !path.toLowerCase().endsWith('.qwiz')) {
      return { error: "That doesn't look like a path to a .qwiz file." };
    }
    const ref = pinnedRef(params, parsed);
    return { ref: { kind: 'repo', repo: ref, path } };
  }

  const payload = readSharePayload(hash);
  return payload ? { ref: { kind: 'fragment', payload } } : {};
}

/** An explicit `?ref=` wins over one embedded in a pasted `/tree/<ref>/…` URL, since it's the more
 * deliberate of the two. Neither being present is the normal case: links the app generates leave
 * the ref off so they keep working when a default branch is renamed. */
export function pinnedRef(params: URLSearchParams, repo: RepoRef): RepoRef {
  const explicit = params.get('ref');
  const ref = explicit || repo.ref;
  return { owner: repo.owner, repo: repo.repo, ...(ref ? { ref } : {}) };
}

/** The `/play` link for one quiz inside a repository. Deliberately omits the ref unless one was
 * pinned — a durable link re-resolves the default branch every time it's opened. */
export function repoQuizUrl(repo: RepoRef, path: string): string {
  const params = new URLSearchParams({ repo: `${repo.owner}/${repo.repo}`, path });
  if (repo.ref) params.set('ref', repo.ref);
  return `/play?${params.toString()}`;
}

/** The `/play` link for one quiz inside a group saved to this browser. */
export function savedQuizUrl(savedId: string, path: string): string {
  return `/play?${new URLSearchParams({ saved: savedId, path }).toString()}`;
}

/** The `/group` link for a repository, optionally scoped to a folder inside it. */
export function groupUrl(repo: RepoRef, path?: string): string {
  const params = new URLSearchParams({ repo: `${repo.owner}/${repo.repo}` });
  if (path) params.set('path', path);
  if (repo.ref) params.set('ref', repo.ref);
  return `/group?${params.toString()}`;
}

/** How a folders group is being played this time round.
 *
 * Carried in the URL rather than held in component state so a run is linkable and survives a
 * reload — the same reason `?path=` and `?ref=` are there. `merge` and `shuffle` used to be modes
 * an author chose in the manifest; they're player choices now. */
export interface GroupRunOptions {
  merge: boolean;
  shuffle: boolean;
}

export function readGroupRunOptions(search: string): GroupRunOptions {
  const params = new URLSearchParams(search);
  return { merge: params.get('merge') === '1', shuffle: params.get('shuffle') === '1' };
}

/** The `/group/play` link for a repository, carrying how it should be played. */
export function groupPlayUrl(
  repo: RepoRef,
  path: string | undefined,
  options: Partial<GroupRunOptions> = {}
): string {
  const params = new URLSearchParams({ repo: `${repo.owner}/${repo.repo}` });
  if (path) params.set('path', path);
  if (repo.ref) params.set('ref', repo.ref);
  if (options.merge) params.set('merge', '1');
  if (options.shuffle) params.set('shuffle', '1');
  return `/group/play?${params.toString()}`;
}
