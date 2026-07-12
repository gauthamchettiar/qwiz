import type { Trivia } from './types';
import { slugify } from './download';
import type { ZipFile } from './zip';

export type RepoMode = 'folder' | 'journey' | 'category';

export interface RepoEntry {
  id: string;
  /** Folder path under quiz-data/, e.g. "01-basics" or "animals/mammals". Empty = repo root. */
  folder: string;
  /** File name without the .json extension. */
  filename: string;
  /** Embedded snapshot of the trivia this file holds. */
  trivia: Trivia;
  /** Journey mode: ids of entries that must be cleared before this one unlocks. */
  requires: string[];
  /** Journey mode: this node's prerequisites must be won (not just completed). */
  requireWin?: boolean;
}

export interface RepoBuilderState {
  mode: RepoMode;
  /** Journey/category title + description written into description.json. */
  title: string;
  description: string;
  /** Journey default: must prerequisites be won to unlock? */
  requireWin: boolean;
  /** Category: questions per category pick, and number of rounds. */
  questionsPerPick: number;
  rounds: number;
  entries: RepoEntry[];
}

const KEY = 'qwiz:repo-builder';

export function defaultRepoState(): RepoBuilderState {
  return {
    mode: 'folder',
    title: '',
    description: '',
    requireWin: false,
    questionsPerPick: 1,
    rounds: 10,
    entries: []
  };
}

export function loadRepoState(): RepoBuilderState {
  if (typeof localStorage === 'undefined') return defaultRepoState();
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaultRepoState(), ...(JSON.parse(raw) as RepoBuilderState) } : defaultRepoState();
  } catch {
    return defaultRepoState();
  }
}

export function saveRepoState(state: RepoBuilderState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** A folder path can nest, so slugify each segment and drop empties. */
export function sanitizeFolder(folder: string): string {
  return folder
    .split('/')
    .map((seg) => slugify(seg))
    .filter((seg) => seg && seg !== 'trivia')
    .join('/');
}

export function pathOf(entry: RepoEntry): string {
  const folder = sanitizeFolder(entry.folder);
  const file = slugify(entry.filename || entry.trivia.title);
  return `quiz-data/${folder ? folder + '/' : ''}${file}.json`;
}

/** Unique, human-readable node ids for journey mode, derived from filenames. */
function assignNodeIds(entries: RepoEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const e of entries) {
    let base = slugify(e.filename || e.trivia.title);
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    map.set(e.id, id);
  }
  return map;
}

/** The description.json object for the current mode, or null for plain folder mode. */
export function buildDescription(state: RepoBuilderState): object | null {
  if (state.mode === 'category') {
    return {
      mode: 'category',
      ...(state.title ? { title: state.title } : {}),
      ...(state.description ? { description: state.description } : {}),
      questionsPerPick: Math.max(1, Math.round(state.questionsPerPick) || 1),
      rounds: Math.max(1, Math.round(state.rounds) || 1)
    };
  }
  if (state.mode === 'journey') {
    const ids = assignNodeIds(state.entries);
    return {
      mode: 'journey',
      ...(state.title ? { title: state.title } : {}),
      ...(state.description ? { description: state.description } : {}),
      requireWin: state.requireWin,
      nodes: state.entries.map((e) => ({
        id: ids.get(e.id),
        path: pathOf(e),
        requires: e.requires.map((rid) => ids.get(rid)).filter((x): x is string => !!x),
        ...(e.requireWin ? { requireWin: true } : {})
      }))
    };
  }
  return null;
}

/** All files that make up the exported quiz-data/ folder. */
export function buildFiles(state: RepoBuilderState): ZipFile[] {
  const files: ZipFile[] = state.entries.map((e) => ({
    name: pathOf(e),
    content: JSON.stringify(e.trivia, null, 2) + '\n'
  }));
  const desc = buildDescription(state);
  if (desc) files.push({ name: 'quiz-data/description.json', content: JSON.stringify(desc, null, 2) + '\n' });
  return files;
}

/** Problems that would make the exported repo confusing or broken. */
export function repoWarnings(state: RepoBuilderState): string[] {
  const warnings: string[] = [];
  if (state.entries.length === 0) warnings.push('Add at least one trivia.');

  const paths = state.entries.map(pathOf);
  const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
  for (const p of [...new Set(dupes)]) warnings.push(`Two files share the path ${p} — give them different folders or names.`);

  if (state.mode === 'journey') {
    // A start node (no prerequisites) is needed, and there must be no dependency cycle.
    if (state.entries.length > 0 && !state.entries.some((e) => e.requires.length === 0)) {
      warnings.push('A journey needs at least one starting trivia (one with no prerequisites).');
    }
    const byId = new Map(state.entries.map((e) => [e.id, e]));
    const visiting = new Set<string>();
    const done = new Set<string>();
    let cycle = false;
    const walk = (id: string) => {
      if (done.has(id)) return;
      if (visiting.has(id)) {
        cycle = true;
        return;
      }
      visiting.add(id);
      for (const r of byId.get(id)?.requires ?? []) if (byId.has(r)) walk(r);
      visiting.delete(id);
      done.add(id);
    };
    for (const e of state.entries) walk(e.id);
    if (cycle) warnings.push('The journey has a prerequisite loop — a trivia can’t (directly or indirectly) require itself.');
  }
  return warnings;
}
