import type { TriviaSummary } from './types';

export type RepoTrivia = TriviaSummary & { path: string };

/** A node in the nested folder tree built from repo paths. */
export interface FolderNode {
  name: string;
  /** Full folder path (below quiz-data/), used as a stable open/closed key. '' for the root. */
  path: string;
  folders: FolderNode[];
  trivias: RepoTrivia[];
}

const PREFIX = 'quiz-data/';

/** Builds a nested folder tree from a flat list of trivias, honouring however deep the repo
 * nests them under quiz-data/. */
export function buildFolderTree(trivias: RepoTrivia[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], trivias: [] };
  for (const t of trivias) {
    const rel = t.path.startsWith(PREFIX) ? t.path.slice(PREFIX.length) : t.path;
    const parts = rel.split('/');
    parts.pop(); // drop the filename
    let node = root;
    let acc = '';
    for (const seg of parts) {
      acc = acc ? `${acc}/${seg}` : seg;
      let child = node.folders.find((f) => f.name === seg);
      if (!child) {
        child = { name: seg, path: acc, folders: [], trivias: [] };
        node.folders.push(child);
      }
      node = child;
    }
    node.trivias.push(t);
  }
  const sortNode = (n: FolderNode) => {
    n.folders.sort((a, b) => a.name.localeCompare(b.name));
    n.trivias.sort((a, b) => a.title.localeCompare(b.title));
    n.folders.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

/** Total trivias in a folder's whole subtree. */
export function countTrivias(node: FolderNode): number {
  return node.trivias.length + node.folders.reduce((sum, f) => sum + countTrivias(f), 0);
}

/** Every folder path in the tree, for expand/collapse-all. */
export function allFolderPaths(node: FolderNode): string[] {
  return node.folders.flatMap((f) => [f.path, ...allFolderPaths(f)]);
}
