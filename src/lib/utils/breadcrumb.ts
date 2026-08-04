/** Where you are inside a group, and how to get back up.
 *
 * Pure, so the trail is decided and tested here rather than assembled inline in markup — and so the
 * "where does Back go" question has one answer both the breadcrumb and the header's Back link read
 * from. Before this they disagreed: Back always went to the site root, even three folders deep.
 */

import { groupUrl } from './remoteSource';
import type { RepoRef } from './githubRef';

export interface Crumb {
  label: string;
  /** Absent on the last crumb — you're already there. */
  href?: string;
}

/** The trail for a group screen: the repository, then one crumb per folder of `path`.
 *
 * The root crumb is named after the repository rather than "Home", because that IS the thing
 * containing everything else here — a group two folders deep belongs to a repository, not to the
 * visitor's own quiz library. */
export function groupCrumbs(repo: RepoRef, rootLabel?: string): Crumb[] {
  const crumbs: Crumb[] = [
    {
      label: rootLabel || `${repo.owner}/${repo.repo}`,
      href: groupUrl({ owner: repo.owner, repo: repo.repo, ...(repo.ref ? { ref: repo.ref } : {}) })
    }
  ];

  const segments = (repo.path ?? '').split('/').filter(Boolean);
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    crumbs.push({
      label: segment,
      ...(isLast
        ? {}
        : {
            href: groupUrl(
              { owner: repo.owner, repo: repo.repo, ...(repo.ref ? { ref: repo.ref } : {}) },
              segments.slice(0, index + 1).join('/')
            )
          })
    });
  });

  // A group at the repository root is one crumb, which is a label rather than a trail — the caller
  // hides it, and gets a plain heading instead of a breadcrumb of length one.
  return crumbs;
}

/** Where "Back" should go from a group screen: up one folder, or out to the repository root, or —
 * only when already at the root — nowhere in particular, which the caller turns into the visitor's
 * own library. */
export function groupParentUrl(repo: RepoRef): string | null {
  const segments = (repo.path ?? '').split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const base: RepoRef = {
    owner: repo.owner,
    repo: repo.repo,
    ...(repo.ref ? { ref: repo.ref } : {})
  };
  const parent = segments.slice(0, -1).join('/');
  return groupUrl(base, parent || undefined);
}
