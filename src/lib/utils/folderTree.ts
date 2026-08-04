/** A flat list of repo paths as the nested folder tree a reader expects to browse.
 *
 * Pure and framework-free (CLAUDE.md §3), so the recursive component that renders it owns no logic
 * of its own — the shape of the tree is decided and tested here, and `FolderTree.svelte` only draws
 * whatever it's handed.
 */

import type { QuizGroupEntry } from './quizGroup';

export interface FolderNode {
  /** Segment name, e.g. `rounds`. Empty only for the root. */
  name: string;
  /** Full path from the group root, so a node has a stable identity for `{#each}` keys and for
   * expand/collapse state that survives a re-render. */
  path: string;
  folders: FolderNode[];
  /** The quizzes filed directly in this folder, not in its subfolders. */
  entries: QuizGroupEntry[];
}

function emptyNode(name: string, path: string): FolderNode {
  return { name, path, folders: [], entries: [] };
}

/** Builds the tree from entries whose `path` is already resolved to a full repo path.
 *
 * `base` is stripped from the front of each path first, so a group scoped to a subfolder shows its
 * own contents at the top level rather than a chain of single-child folders leading down to them.
 *
 * An explicit `group:` label on an entry overrides its directory, which is what lets a manifest
 * present a flat folder of files as several named sections without moving any files around. Those
 * labelled entries are grouped as if the label were a top-level folder name. */
export function buildFolderTree(entries: readonly QuizGroupEntry[], base = ''): FolderNode {
  const root = emptyNode('', '');
  const prefix = base ? `${base.replace(/\/+$/, '')}/` : '';

  for (const entry of entries) {
    const relative = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path;
    const segments = entry.group ? [entry.group] : relative.split('/').filter(Boolean).slice(0, -1);

    let node = root;
    for (const segment of segments) {
      let next = node.folders.find((folder) => folder.name === segment);
      if (!next) {
        next = emptyNode(segment, node.path ? `${node.path}/${segment}` : segment);
        node.folders.push(next);
      }
      node = next;
    }
    node.entries.push(entry);
  }

  sortNode(root);
  return root;
}

/** Folders before files, each alphabetical — the ordering every file browser uses, so nobody has to
 * learn this one. `localeCompare` rather than `<` so accented names sort where a reader expects. */
function sortNode(node: FolderNode): void {
  node.folders.sort((a, b) => a.name.localeCompare(b.name));
  node.entries.sort((a, b) => entryLabel(a).localeCompare(entryLabel(b)));
  for (const folder of node.folders) sortNode(folder);
}

/** What to call an entry in a list: the manifest's `title:` if it gave one, else the filename.
 *
 * The fallback is deliberately the filename rather than the quiz's real title, because knowing the
 * real title means fetching every quiz in the group before anything can be drawn. That's the entire
 * reason `title:` exists in the manifest, and it's worth saying so where the tradeoff is visible. */
export function entryLabel(entry: QuizGroupEntry): string {
  if (entry.title) return entry.title;
  const file = entry.path.slice(entry.path.lastIndexOf('/') + 1);
  return file.replace(/\.qwiz$/i, '');
}

/** Every folder path in the tree — what an "expand all" control toggles against. */
export function allFolderPaths(node: FolderNode): string[] {
  return node.folders.flatMap((folder) => [folder.path, ...allFolderPaths(folder)]);
}

/** How many quizzes sit at or below a node, for the "12 quizzes" count beside a collapsed folder. */
export function countEntries(node: FolderNode): number {
  return node.entries.length + node.folders.reduce((sum, folder) => sum + countEntries(folder), 0);
}
