import type { Trivia } from './types';
import { slugify } from './download';
import type { ZipFile } from './zip';

export type RepoMode = 'folder' | 'journey' | 'category';

export interface RepoEntry {
  id: string;
  /** Folder path under the section's root, e.g. "mammals" or "sub/sub2". Empty = section root. */
  folder: string;
  /** File name without the .json extension. */
  filename: string;
  /** Embedded snapshot of the trivia this file holds. */
  trivia: Trivia;
  /** Journey mode: ids of other entries *in this section* that must be cleared before this one
   * unlocks (prerequisites only ever come from the same section — a journey/category is scoped
   * to its own folder). */
  requires: string[];
  /** Journey mode: this node's prerequisites must be won (not just completed). */
  requireWin?: boolean;
}

/** One slice of the exported repo: a folder under quiz-data/ with its own mode. A repo can mix
 * several — e.g. a plain top-level folder alongside a journey subfolder and a category subfolder
 * — matching how Qwiz reads a description.json in any folder, scoped to that subtree. */
export interface RepoSection {
  id: string;
  /** Folder path under quiz-data/ this section owns. '' = the top-level area. */
  root: string;
  mode: RepoMode;
  /** Journey/category title + description written into this section's description.json. */
  title: string;
  description: string;
  /** Journey default: must prerequisites be won to unlock? */
  requireWin: boolean;
  /** Category: questions per category pick, and number of rounds. */
  questionsPerPick: number;
  rounds: number;
  entries: RepoEntry[];
}

export interface RepoBuilderState {
  sections: RepoSection[];
}

const KEY = 'qwiz:repo-builder';

export function defaultSection(root = ''): RepoSection {
  return {
    id: crypto.randomUUID(),
    root,
    mode: 'folder',
    title: '',
    description: '',
    requireWin: false,
    questionsPerPick: 1,
    rounds: 10,
    entries: []
  };
}

export function defaultRepoState(): RepoBuilderState {
  return { sections: [defaultSection()] };
}

export function loadRepoState(): RepoBuilderState {
  if (typeof localStorage === 'undefined') return defaultRepoState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultRepoState();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.sections) && parsed.sections.length > 0 ? (parsed as RepoBuilderState) : defaultRepoState();
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

/** Full repo path (from quiz-data/) for an entry, combining its section's root with its own
 * folder field. */
export function pathOf(section: RepoSection, entry: RepoEntry): string {
  const parts = [sanitizeFolder(section.root), sanitizeFolder(entry.folder)].filter(Boolean);
  const file = slugify(entry.filename || entry.trivia.title);
  return `quiz-data/${parts.length ? parts.join('/') + '/' : ''}${file}.json`;
}

/** Where a section's description.json (if any) is written. */
export function descriptionPathOf(section: RepoSection): string {
  const root = sanitizeFolder(section.root);
  return `quiz-data/${root ? `${root}/` : ''}description.json`;
}

/** Unique, human-readable node ids for journey mode, derived from filenames. */
function assignNodeIds(entries: RepoEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const e of entries) {
    const base = slugify(e.filename || e.trivia.title);
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    map.set(e.id, id);
  }
  return map;
}

/** A section's description.json object, or null when it's plain folder mode with no title or
 * description worth writing — Qwiz treats an unconfigured folder as implicitly flat. */
export function buildDescription(section: RepoSection): object | null {
  if (section.mode === 'category') {
    return {
      mode: 'category',
      ...(section.title ? { title: section.title } : {}),
      ...(section.description ? { description: section.description } : {}),
      questionsPerPick: Math.max(1, Math.round(section.questionsPerPick) || 1),
      rounds: Math.max(1, Math.round(section.rounds) || 1)
    };
  }
  if (section.mode === 'journey') {
    const ids = assignNodeIds(section.entries);
    return {
      mode: 'journey',
      ...(section.title ? { title: section.title } : {}),
      ...(section.description ? { description: section.description } : {}),
      requireWin: section.requireWin,
      nodes: section.entries.map((e) => ({
        id: ids.get(e.id),
        // Journey node paths are written relative to the description.json's own folder.
        path: [sanitizeFolder(e.folder), `${slugify(e.filename || e.trivia.title)}.json`].filter(Boolean).join('/'),
        requires: e.requires.map((rid) => ids.get(rid)).filter((x): x is string => !!x),
        ...(e.requireWin ? { requireWin: true } : {})
      }))
    };
  }
  if (section.title || section.description) {
    return {
      mode: 'flat',
      ...(section.title ? { title: section.title } : {}),
      ...(section.description ? { description: section.description } : {})
    };
  }
  return null;
}

/** All files that make up the exported quiz-data/ folder, across every section. */
export function buildFiles(state: RepoBuilderState): ZipFile[] {
  const files: ZipFile[] = [];
  for (const section of state.sections) {
    for (const e of section.entries) {
      files.push({ name: pathOf(section, e), content: JSON.stringify(e.trivia, null, 2) + '\n' });
    }
    const desc = buildDescription(section);
    if (desc) files.push({ name: descriptionPathOf(section), content: JSON.stringify(desc, null, 2) + '\n' });
  }
  return files;
}

/** Problems that would make the exported repo confusing or broken. */
export function repoWarnings(state: RepoBuilderState): string[] {
  const warnings: string[] = [];
  const allEntries = state.sections.flatMap((s) => s.entries);
  if (allEntries.length === 0) warnings.push('Add at least one trivia.');

  // Trivia file paths must be unique across the whole repo, not just within a section.
  const pathList = state.sections.flatMap((s) => s.entries.map((e) => pathOf(s, e)));
  const dupePaths = pathList.filter((p, i) => pathList.indexOf(p) !== i);
  for (const p of [...new Set(dupePaths)]) warnings.push(`Two files share the path ${p} — give them different folders or names.`);

  // Two sections at the same root would collide on their description.json (and likely their
  // trivia paths too).
  const roots = state.sections.map((s) => sanitizeFolder(s.root));
  const dupeRoots = roots.filter((r, i) => roots.indexOf(r) !== i);
  for (const r of [...new Set(dupeRoots)]) {
    warnings.push(
      r ? `Two sections both use the folder "${r}" — give them different folders.` : 'Two sections are both set to the top level — move one into a folder.'
    );
  }

  for (const section of state.sections) {
    if (section.mode !== 'journey' || section.entries.length === 0) continue;
    const label = section.title || (section.root || 'Top level');

    if (!section.entries.some((e) => e.requires.length === 0)) {
      warnings.push(`“${label}” needs at least one starting trivia (one with no prerequisites).`);
    }
    const byId = new Map(section.entries.map((e) => [e.id, e]));
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
    for (const e of section.entries) walk(e.id);
    if (cycle) warnings.push(`“${label}” has a prerequisite loop — a trivia can’t (directly or indirectly) require itself.`);
  }
  return warnings;
}
