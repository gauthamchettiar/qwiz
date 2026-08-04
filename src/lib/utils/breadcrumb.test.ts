import { describe, expect, it } from 'vitest';
import { groupCrumbs, groupParentUrl } from './breadcrumb';

const REPO = { owner: 'owner', repo: 'name' };

describe('groupCrumbs', () => {
  it('is a single crumb at the repository root', () => {
    // One crumb is a label, not a trail — the caller hides it and shows a plain heading.
    expect(groupCrumbs(REPO)).toEqual([{ label: 'owner/name', href: '/group?repo=owner%2Fname' }]);
  });

  it('adds one crumb per folder, the last of them unlinked', () => {
    const crumbs = groupCrumbs({ ...REPO, path: 'examples/groups/journey' });
    expect(crumbs.map((c) => c.label)).toEqual(['owner/name', 'examples', 'groups', 'journey']);
    expect(crumbs.at(-1)?.href).toBeUndefined();
  });

  it('links each ancestor to its own folder, not to the whole path', () => {
    const crumbs = groupCrumbs({ ...REPO, path: 'examples/groups/journey' });
    expect(crumbs[1].href).toBe('/group?repo=owner%2Fname&path=examples');
    expect(crumbs[2].href).toBe('/group?repo=owner%2Fname&path=examples%2Fgroups');
  });

  it('carries a pinned ref through every crumb, so the trail stays on that version', () => {
    const crumbs = groupCrumbs({ ...REPO, ref: 'v2', path: 'a/b' });
    for (const crumb of crumbs) {
      if (crumb.href) expect(crumb.href).toContain('ref=v2');
    }
  });

  it('lets the caller name the root, since a group has a title and a repo does not', () => {
    expect(groupCrumbs(REPO, 'The Qwiz Trail')[0].label).toBe('The Qwiz Trail');
  });

  it('ignores stray slashes in the path', () => {
    expect(groupCrumbs({ ...REPO, path: '/a//b/' }).map((c) => c.label)).toEqual([
      'owner/name',
      'a',
      'b'
    ]);
  });
});

describe('groupParentUrl', () => {
  it('is null at the repository root, where there is no parent to go up to', () => {
    expect(groupParentUrl(REPO)).toBeNull();
  });

  it('goes up one folder', () => {
    expect(groupParentUrl({ ...REPO, path: 'examples/groups/journey' })).toBe(
      '/group?repo=owner%2Fname&path=examples%2Fgroups'
    );
  });

  it('goes to the repository root from one folder down', () => {
    expect(groupParentUrl({ ...REPO, path: 'examples' })).toBe('/group?repo=owner%2Fname');
  });

  it('keeps a pinned ref', () => {
    expect(groupParentUrl({ ...REPO, ref: 'v2', path: 'a/b' })).toContain('ref=v2');
  });
});
