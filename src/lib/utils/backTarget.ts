/** Where the header's Back link should actually go.
 *
 * It used to be a hardcoded `/`, which is right on exactly one screen and wrong on every other: a
 * group three folders deep, or a quiz opened out of one, both threw you back to your own library
 * rather than to where you came from.
 *
 * Pure, and driven by the URL alone, so no screen has to pass its context down into the layout —
 * the layout is static Astro and doesn't have it. Returning `null` means "there's nothing better
 * than the browser's own history", which the component turns into `history.back()`.
 */

import { parseRepoRef, dirOf, type RepoRef } from './githubRef';
import { groupUrl } from './remoteSource';
import { groupParentUrl } from './breadcrumb';

function refFrom(params: URLSearchParams): RepoRef | null {
  const raw = params.get('repo');
  if (!raw) return null;
  const parsed = parseRepoRef(raw);
  if (!parsed) return null;

  const path = params.get('path') ?? parsed.path;
  const ref = params.get('ref') || parsed.ref;
  return {
    owner: parsed.owner,
    repo: parsed.repo,
    ...(ref ? { ref } : {}),
    ...(path ? { path } : {})
  };
}

/** A concrete destination, or `null` to fall back to browser history.
 *
 * `pathname` and `search` rather than a `URL` so this is trivially callable from a test without
 * constructing one, and so it can never accidentally read anything else off `location`. */
export function backTarget(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);

  const saved = params.get('saved');
  if (saved) {
    // A quiz inside a saved group returns to that group; the group itself returns to the library
    // it belongs to, since there's no repository folder above it to climb.
    return pathname.startsWith('/play') ? `/group?saved=${encodeURIComponent(saved)}` : '/';
  }

  const ref = refFrom(params);

  // Playing a whole group returns to that group, not to the folder above it: you came from the
  // group's own screen, and its Play button is what you'd want again.
  if (pathname.startsWith('/group/play')) {
    return ref ? groupUrl(ref, ref.path) : null;
  }

  // A group screen climbs one folder, and `null` at the repository root leaves it to history —
  // which is usually the Import dialog or a link someone shared.
  if (pathname.startsWith('/group')) {
    return ref ? groupParentUrl(ref) : null;
  }

  // A quiz opened out of a repository goes back to the folder that listed it.
  if (pathname.startsWith('/play')) {
    const path = params.get('path');
    if (ref && path) {
      const folder = dirOf(path);
      return groupUrl(
        { owner: ref.owner, repo: ref.repo, ...(ref.ref ? { ref: ref.ref } : {}) },
        folder || undefined
      );
    }
    // A gist, or a quiz carried in the fragment, has no group to return to.
    return null;
  }

  return null;
}

/** Whether `referrer` is somewhere in this app, and so worth going back to. A referrer from
 * elsewhere (or none at all — a pasted link, a new tab) means history would take the visitor off
 * the site entirely, which is not what a Back link inside an app should do. */
export function canGoBack(referrer: string, origin: string): boolean {
  if (!referrer) return false;
  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
}
