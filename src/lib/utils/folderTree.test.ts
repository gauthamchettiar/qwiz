import { describe, expect, it } from 'vitest';
import { allFolderPaths, buildFolderTree, countEntries, entryLabel } from './folderTree';
import { groupFromTree } from './repoIndex';
import type { QuizGroupEntry } from './quizGroup';

function entries(...paths: string[]): QuizGroupEntry[] {
  return groupFromTree(paths).entries;
}

describe('buildFolderTree', () => {
  it('nests folders and files the way a file browser would', () => {
    const tree = buildFolderTree(entries('rounds/one.qwiz', 'rounds/deep/three.qwiz', 'top.qwiz'));

    expect(tree.entries.map((e) => e.path)).toEqual(['top.qwiz']);
    expect(tree.folders.map((f) => f.name)).toEqual(['rounds']);

    const rounds = tree.folders[0];
    expect(rounds.path).toBe('rounds');
    expect(rounds.entries.map((e) => e.path)).toEqual(['rounds/one.qwiz']);
    expect(rounds.folders[0].name).toBe('deep');
    expect(rounds.folders[0].path).toBe('rounds/deep');
  });

  it('strips the base so a scoped group is not a chain of single-child folders', () => {
    const tree = buildFolderTree(entries('rounds/one.qwiz', 'rounds/deep/two.qwiz'), 'rounds');

    // Without the base, this would be one "rounds" folder wrapping everything.
    expect(tree.folders.map((f) => f.name)).toEqual(['deep']);
    expect(tree.entries.map((e) => e.path)).toEqual(['rounds/one.qwiz']);
  });

  it('lets an explicit group: label override the directory', () => {
    // The point: a flat folder of files can present as named sections without moving any files.
    const tree = buildFolderTree([
      { id: 'a', path: 'a.qwiz', group: 'Week 2', requires: [], settings: {} },
      { id: 'b', path: 'b.qwiz', group: 'Week 1', requires: [], settings: {} },
      { id: 'c', path: 'c.qwiz', requires: [], settings: {} }
    ]);

    expect(tree.folders.map((f) => f.name)).toEqual(['Week 1', 'Week 2']);
    expect(tree.entries.map((e) => e.id)).toEqual(['c']);
  });

  it('sorts folders before files, each alphabetically', () => {
    const tree = buildFolderTree(entries('zebra.qwiz', 'apple.qwiz', 'sub/x.qwiz', 'alpha/y.qwiz'));
    expect(tree.folders.map((f) => f.name)).toEqual(['alpha', 'sub']);
    expect(tree.entries.map((e) => entryLabel(e))).toEqual(['apple', 'zebra']);
  });

  it('handles an empty group without inventing a folder', () => {
    const tree = buildFolderTree([]);
    expect(tree.folders).toEqual([]);
    expect(tree.entries).toEqual([]);
    expect(countEntries(tree)).toBe(0);
  });
});

describe('entryLabel', () => {
  it('prefers the manifest title, which is what avoids fetching every quiz to draw a list', () => {
    expect(
      entryLabel({ id: 'a', path: 'a.qwiz', title: 'The Good One', requires: [], settings: {} })
    ).toBe('The Good One');
  });

  it('falls back to the filename without its extension', () => {
    expect(
      entryLabel({ id: 'a', path: 'rounds/world-capitals.qwiz', requires: [], settings: {} })
    ).toBe('world-capitals');
  });
});

describe('tree helpers', () => {
  const tree = buildFolderTree(
    entries('rounds/one.qwiz', 'rounds/deep/two.qwiz', 'extra/three.qwiz', 'top.qwiz')
  );

  it('lists every folder path for an expand-all control', () => {
    expect(allFolderPaths(tree).sort()).toEqual(['extra', 'rounds', 'rounds/deep']);
  });

  it('counts quizzes at and below a node', () => {
    expect(countEntries(tree)).toBe(4);
    expect(countEntries(tree.folders.find((f) => f.name === 'rounds')!)).toBe(2);
  });
});
