import { describe, expect, it } from 'vitest';
import { parseQwizGroup } from './quizGroup';
import {
  governingManifest,
  groupFromTree,
  manifestPathsIn,
  mergeDiscovered,
  needsDiscovery,
  resolveGroupEntries,
  subGroupDirs
} from './repoIndex';

const TREE = [
  '.qwizgroup',
  'README.md',
  'rounds/one.qwiz',
  'rounds/two.qwiz',
  'rounds/deep/three.qwiz',
  'extra/.qwizgroup',
  'extra/four.qwiz',
  'src/index.ts'
];

describe('needsDiscovery', () => {
  it('is false for a manifest that lists its quizzes — the zero-API-call path', () => {
    const { group } = parseQwizGroup(['---', '---', '', 'quiz: a.qwiz'].join('\n'));
    expect(needsDiscovery(group)).toBe(false);
  });

  it('is true when a folders manifest lists nothing, since there would be nothing to show', () => {
    const { group } = parseQwizGroup(['---', 'title: Empty', '---'].join('\n'));
    expect(needsDiscovery(group)).toBe(true);
  });

  it('is true when discover is asked for explicitly, even alongside listed entries', () => {
    const { group } = parseQwizGroup(
      ['---', ':discover=true', '---', '', 'quiz: a.qwiz'].join('\n')
    );
    expect(needsDiscovery(group)).toBe(true);
  });

  it('is false for a mode that cannot discover, so a journey never spends an API call', () => {
    const { group } = parseQwizGroup(['---', ':mode=journey', '---'].join('\n'));
    expect(needsDiscovery(group)).toBe(false);
  });
});

describe('groupFromTree', () => {
  it('picks out only .qwiz files, ignoring code and docs', () => {
    const group = groupFromTree(TREE);
    expect(group.entries.map((e) => e.path)).toEqual([
      'extra/four.qwiz',
      'rounds/deep/three.qwiz',
      'rounds/one.qwiz',
      'rounds/two.qwiz'
    ]);
  });

  it('scopes to a subfolder when asked', () => {
    const group = groupFromTree(TREE, 'rounds');
    expect(group.entries.map((e) => e.path)).toEqual([
      'rounds/deep/three.qwiz',
      'rounds/one.qwiz',
      'rounds/two.qwiz'
    ]);
  });

  it('produces a real folders group, so nothing downstream knows a manifest was missing', () => {
    expect(groupFromTree(TREE).settings.mode).toBe('folders');
  });

  it('sorts by path, so an unchanged repo never reshuffles between two loads', () => {
    const forwards = groupFromTree(TREE).entries.map((e) => e.path);
    const backwards = groupFromTree([...TREE].reverse()).entries.map((e) => e.path);
    expect(backwards).toEqual(forwards);
  });

  it('falls back to a path-based id only where two filenames would collide', () => {
    const group = groupFromTree(['rounds/one.qwiz', 'extra/one.qwiz', 'solo.qwiz']);
    const ids = Object.fromEntries(group.entries.map((e) => [e.path, e.id]));
    expect(ids['solo.qwiz']).toBe('solo');
    expect(ids['rounds/one.qwiz']).toBe('rounds/one');
    expect(ids['extra/one.qwiz']).toBe('extra/one');
  });
});

describe('resolveGroupEntries', () => {
  it('resolves entry paths against the folder the manifest sits in', () => {
    const { group } = parseQwizGroup(
      ['---', '---', '', 'quiz: one.qwiz', '', 'quiz: deep/two.qwiz'].join('\n')
    );
    const resolved = resolveGroupEntries(group, 'rounds');
    expect(resolved.entries.map((e) => e.path)).toEqual([
      'rounds/one.qwiz',
      'rounds/deep/two.qwiz'
    ]);
  });

  it('keeps a root manifest paths as-is', () => {
    const { group } = parseQwizGroup(['---', '---', '', 'quiz: one.qwiz'].join('\n'));
    expect(resolveGroupEntries(group, '').entries[0].path).toBe('one.qwiz');
  });
});

describe('mergeDiscovered', () => {
  it('keeps the manifest entry when both name the same file, so titles are never lost', () => {
    const { group } = parseQwizGroup(
      ['---', ':discover=true', '---', '', 'quiz: rounds/one.qwiz', 'title: The Good One'].join(
        '\n'
      )
    );
    const merged = mergeDiscovered(resolveGroupEntries(group, ''), groupFromTree(TREE));

    const one = merged.entries.filter((e) => e.path === 'rounds/one.qwiz');
    expect(one).toHaveLength(1);
    expect(one[0].title).toBe('The Good One');
  });

  it('appends the files the manifest did not mention', () => {
    const { group } = parseQwizGroup(
      ['---', ':discover=true', '---', '', 'quiz: rounds/one.qwiz'].join('\n')
    );
    const merged = mergeDiscovered(resolveGroupEntries(group, ''), groupFromTree(TREE));
    expect(merged.entries.map((e) => e.path)).toContain('rounds/two.qwiz');
  });

  it('renames a discovered entry whose id would clash with a manifest one', () => {
    const { group } = parseQwizGroup(
      ['---', ':discover=true', '---', '', 'quiz: extra/one.qwiz', 'id: one'].join('\n')
    );
    const merged = mergeDiscovered(
      resolveGroupEntries(group, ''),
      groupFromTree(['extra/one.qwiz', 'rounds/one.qwiz'])
    );
    expect(new Set(merged.entries.map((e) => e.id)).size).toBe(merged.entries.length);
  });
});

describe('governingManifest — deepest root wins', () => {
  it('gives a file the nearest manifest at or above it', () => {
    const manifests = ['.qwizgroup', 'extra/.qwizgroup'];
    expect(governingManifest('extra/four.qwiz', manifests)).toBe('extra/.qwizgroup');
    expect(governingManifest('rounds/one.qwiz', manifests)).toBe('.qwizgroup');
  });

  it('returns null when nothing governs the file', () => {
    expect(governingManifest('rounds/one.qwiz', ['extra/.qwizgroup'])).toBeNull();
  });

  it('prefers the deeper of two nested manifests', () => {
    const manifests = ['.qwizgroup', 'a/.qwizgroup', 'a/b/.qwizgroup'];
    expect(governingManifest('a/b/c.qwiz', manifests)).toBe('a/b/.qwizgroup');
  });
});

describe('manifest discovery in a tree', () => {
  it('finds every manifest, ignoring lookalike filenames', () => {
    expect(manifestPathsIn([...TREE, 'notes.qwizgroup'])).toEqual([
      '.qwizgroup',
      'extra/.qwizgroup'
    ]);
  });

  it('lists sub-groups without listing the group own manifest', () => {
    expect(subGroupDirs(TREE, '')).toEqual(['extra']);
    expect(subGroupDirs(TREE, 'extra')).toEqual([]);
  });
});
