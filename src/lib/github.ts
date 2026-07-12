import type { Trivia } from './types';
import { toSummary } from './types';
import type { RepoTrivia } from './folderTree';
import { validateTriviaImport } from './triviaSchema';

const QUIZ_DATA_PREFIX = 'quiz-data/';

export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  const source = urlMatch ? `${urlMatch[1]}/${urlMatch[2]}` : trimmed;
  const parts = source.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return { owner, repo };
}

interface GithubTreeEntry {
  path: string;
  type: string;
}

async function fetchJson<T>(
  url: string
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    return { ok: false, error: 'Network error — check your connection and try again.' };
  }
  if (!res.ok) {
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
      return { ok: false, error: 'GitHub API rate limit exceeded. Try again in a few minutes.' };
    }
    if (res.status === 404) {
      return { ok: false, error: 'Repository not found (or private).' };
    }
    return { ok: false, error: `GitHub request failed (${res.status}).` };
  }
  return { ok: true, data: (await res.json()) as T };
}

/** One trivia in a journey, keyed to a trivia file and gated behind prerequisite nodes. */
export interface JourneyNode {
  id: string;
  /** Path of the trivia this node plays. In a description.json it's written relative to that
   * file's folder; once loaded it's resolved to a full repo path matching a fetched trivia. */
  path: string;
  /** Node ids that must be satisfied before this one unlocks. Empty = a starting node. */
  requires: string[];
  /** Overrides the journey default: must prerequisites be *won* (cracked) or merely completed? */
  requireWin?: boolean;
}

/** A `description.json` in journey mode — turns its folder subtree into a guided journey, a
 * timeline/tree the player unlocks one trivia at a time. */
export interface JourneyConfig {
  mode: 'journey';
  title?: string;
  description?: string;
  /** Default for every node: must prerequisites be won to unlock, or just completed? */
  requireWin: boolean;
  nodes: JourneyNode[];
}

/** A `description.json` in category mode — a pick-your-topic challenge where the player chooses a
 * subfolder every few questions and is scored on the average across rounds. */
export interface CategoryConfig {
  mode: 'category';
  title?: string;
  description?: string;
  /** How many questions to answer before choosing the next category. Default 1. */
  questionsPerPick: number;
  /** How many category picks make up a full run. */
  rounds: number;
}

/** A `description.json` with no special mode — just an optional heading over a plain folder view.
 * Also the implicit config for any trivias not owned by a journey/category section. */
export interface FlatConfig {
  mode: 'flat';
  title?: string;
  description?: string;
}

export type SectionConfig = FlatConfig | JourneyConfig | CategoryConfig;

/** One rendered slice of a repo, rooted at the folder that holds its description.json (or the
 * implicit top-level area). A repo can mix modes: several sections side by side. */
export interface RepoSection {
  /** Folder path below quiz-data/ this section covers; '' = the top-level area. */
  root: string;
  config: SectionConfig;
  /** Trivias owned by this section (deepest matching root wins), with full repo paths. */
  trivias: RepoTrivia[];
}

export interface RepoQuizResult {
  owner: string;
  repo: string;
  ref: string;
  skipped: string[];
  /** The repo split into sections by the description.json files it ships (in render order). */
  sections: RepoSection[];
  fetchedAt: string;
}

const DESCRIPTION_FILE = 'description.json';

/** True for a `quiz-data/**​/description.json` config file (at any depth), so it's treated as
 * section config rather than a playable trivia. */
function isDescriptionFile(path: string): boolean {
  return path === `${QUIZ_DATA_PREFIX}${DESCRIPTION_FILE}` || path.endsWith(`/${DESCRIPTION_FILE}`);
}

/** The section root (folder below quiz-data/) a description.json defines; '' for the top-level. */
function sectionRootOf(descPath: string): string {
  const rel = descPath.slice(QUIZ_DATA_PREFIX.length);
  return rel === DESCRIPTION_FILE ? '' : rel.slice(0, -(`/${DESCRIPTION_FILE}`.length));
}

/** Leniently parses a repo's description.json into a JourneyConfig, or null (→ folder mode)
 * when it's absent, malformed, or not in journey mode. */
function parseJourney(data: unknown): JourneyConfig | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.mode !== 'journey' || !Array.isArray(d.nodes)) return null;
  const nodes: JourneyNode[] = [];
  for (const raw of d.nodes) {
    if (!raw || typeof raw !== 'object') continue;
    const n = raw as Record<string, unknown>;
    if (typeof n.id !== 'string' || typeof n.path !== 'string') continue;
    nodes.push({
      id: n.id,
      path: n.path,
      requires: Array.isArray(n.requires) ? n.requires.filter((x): x is string => typeof x === 'string') : [],
      requireWin: typeof n.requireWin === 'boolean' ? n.requireWin : undefined
    });
  }
  if (nodes.length === 0) return null;
  return {
    mode: 'journey',
    title: typeof d.title === 'string' ? d.title : undefined,
    description: typeof d.description === 'string' ? d.description : undefined,
    requireWin: typeof d.requireWin === 'boolean' ? d.requireWin : false,
    nodes
  };
}

function parseCategory(data: unknown): CategoryConfig | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.mode !== 'category') return null;
  const qpp = typeof d.questionsPerPick === 'number' && d.questionsPerPick >= 1 ? Math.floor(d.questionsPerPick) : 1;
  const rounds = typeof d.rounds === 'number' && d.rounds >= 1 ? Math.floor(d.rounds) : 10;
  return {
    mode: 'category',
    title: typeof d.title === 'string' ? d.title : undefined,
    description: typeof d.description === 'string' ? d.description : undefined,
    questionsPerPick: qpp,
    rounds
  };
}

/** A description.json with neither journey nor category mode — a plain (optionally titled) folder
 * section. Also used as the implicit config for trivias no section claims. */
function parseFlat(data: unknown): FlatConfig {
  const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return {
    mode: 'flat',
    title: typeof d.title === 'string' ? d.title : undefined,
    description: typeof d.description === 'string' ? d.description : undefined
  };
}

/** Parses any description.json into its section config, falling back to a flat section. */
function parseSection(data: unknown): SectionConfig {
  return parseJourney(data) ?? parseCategory(data) ?? parseFlat(data);
}

/** Rewrites a journey's node paths (written relative to the description.json's folder) into full
 * repo paths, so they line up with the fetched trivia paths. */
function resolveJourneyPaths(journey: JourneyConfig, root: string): JourneyConfig {
  const base = `${QUIZ_DATA_PREFIX}${root ? `${root}/` : ''}`;
  return { ...journey, nodes: journey.nodes.map((n) => ({ ...n, path: base + n.path })) };
}

function cacheKey(owner: string, repo: string): string {
  return `qwiz:repo-cache:${owner}/${repo}`;
}

export function getCachedRepoQuizData(owner: string, repo: string): RepoQuizResult | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(owner, repo));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RepoQuizResult;
    // Ignore caches written by an older result shape (no sections) so they don't crash the render.
    return Array.isArray(parsed?.sections) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a repo's default branch — cache-first (reuses a previous Browse-page fetch for this
 * repo, if any, with no network call), otherwise a single GitHub API call. Used so a shared
 * `?github=owner/repo&id=path` link (with no `ref`) still works standalone.
 */
export async function resolveDefaultBranch(owner: string, repo: string): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const cached = getCachedRepoQuizData(owner, repo);
  if (cached) return { ok: true, ref: cached.ref };
  const repoInfo = await fetchJson<{ default_branch: string }>(`https://api.github.com/repos/${owner}/${repo}`);
  return repoInfo.ok ? { ok: true, ref: repoInfo.data.default_branch } : { ok: false, error: repoInfo.error };
}

function cacheRepoQuizData(result: RepoQuizResult): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(cacheKey(result.owner, result.repo), JSON.stringify(result));
}

const BROWSED_REPOS_KEY = 'qwiz:browsed-repos';

/** Repos the user has loaded on the Browse page, most-recently-added first — lets that page
 * restore what was on screen after a refresh instead of starting empty. */
export function getBrowsedRepos(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BROWSED_REPOS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function addBrowsedRepo(owner: string, repo: string): void {
  if (typeof localStorage === 'undefined') return;
  const key = `${owner}/${repo}`;
  const rest = getBrowsedRepos().filter((r) => r !== key);
  localStorage.setItem(BROWSED_REPOS_KEY, JSON.stringify([key, ...rest]));
}

/** Fetches every valid trivia JSON under quiz-data/ in a public GitHub repo and splits it into
 * sections by the description.json files present — a repo can mix journey/category/flat. */
export async function fetchRepoQuizData(
  owner: string,
  repo: string
): Promise<{ ok: true; result: RepoQuizResult } | { ok: false; error: string }> {
  const repoInfo = await fetchJson<{ default_branch: string }>(`https://api.github.com/repos/${owner}/${repo}`);
  if (!repoInfo.ok) return { ok: false, error: repoInfo.error };
  const ref = repoInfo.data.default_branch;

  const tree = await fetchJson<{ tree: GithubTreeEntry[] }>(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`
  );
  if (!tree.ok) return { ok: false, error: tree.error };

  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/`;
  const jsonPaths = tree.data.tree.filter(
    (e) => e.type === 'blob' && e.path.startsWith(QUIZ_DATA_PREFIX) && e.path.endsWith('.json') && !isDescriptionFile(e.path)
  );

  if (jsonPaths.length === 0) {
    return { ok: false, error: `No quiz-data/ folder with JSON files found in ${owner}/${repo}.` };
  }

  const skipped: string[] = [];
  const trivias: RepoTrivia[] = [];

  await Promise.all(
    jsonPaths.map(async (entry) => {
      try {
        const res = await fetch(rawBase + entry.path);
        if (!res.ok) {
          skipped.push(entry.path);
          return;
        }
        const data = await res.json();
        if (!validateTriviaImport(data).valid) {
          skipped.push(entry.path);
          return;
        }
        trivias.push({ ...toSummary(data as Trivia), path: entry.path });
      } catch {
        skipped.push(entry.path);
      }
    })
  );

  if (trivias.length === 0) {
    return { ok: false, error: `Found ${jsonPaths.length} file(s) under quiz-data/, but none were valid trivia JSON.` };
  }

  // Every description.json (at any depth) defines a section rooted at its folder.
  const descPaths = tree.data.tree.filter(
    (e) => e.type === 'blob' && e.path.startsWith(QUIZ_DATA_PREFIX) && isDescriptionFile(e.path)
  );
  const configByRoot = new Map<string, SectionConfig>();
  await Promise.all(
    descPaths.map(async (entry) => {
      try {
        const res = await fetch(rawBase + entry.path);
        if (res.ok) configByRoot.set(sectionRootOf(entry.path), parseSection(await res.json()));
      } catch {
        // A broken description.json is ignored; its subtree falls back to the flat view.
      }
    })
  );

  // Assign every trivia to the deepest section root that contains it (longest matching prefix).
  const roots = [...configByRoot.keys()].sort((a, b) => b.length - a.length);
  const byRoot = new Map<string, RepoTrivia[]>();
  for (const t of trivias) {
    const rel = t.path.slice(QUIZ_DATA_PREFIX.length);
    const ownedRoot = roots.find((r) => r === '' || rel === r || rel.startsWith(`${r}/`)) ?? '';
    const list = byRoot.get(ownedRoot) ?? [];
    list.push(t);
    byRoot.set(ownedRoot, list);
  }

  // One section per non-empty root, resolving journey node paths and sorting trivias by title.
  const sections: RepoSection[] = [];
  for (const [root, ts] of byRoot) {
    let config = configByRoot.get(root) ?? { mode: 'flat' as const };
    if (config.mode === 'journey') config = resolveJourneyPaths(config, root);
    sections.push({ root, config, trivias: ts.sort((a, b) => a.title.localeCompare(b.title)) });
  }
  // Top-level area first, then configured subtrees in folder order.
  sections.sort((a, b) => (a.root === '' ? -1 : b.root === '' ? 1 : a.root.localeCompare(b.root)));

  const result: RepoQuizResult = { owner, repo, ref, skipped, sections, fetchedAt: new Date().toISOString() };
  cacheRepoQuizData(result);
  return { ok: true, result };
}

/**
 * Fetches and validates a single trivia file from a public GitHub repo. `ref` (branch) is
 * optional — omit it for a durable, shareable link; it's resolved cache-first, falling back to
 * one API call. Pass it when already known (e.g. navigating from the Browse page) to skip that
 * lookup entirely.
 */
export async function fetchGithubTrivia(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<{ ok: true; trivia: Trivia; ref: string } | { ok: false; error: string }> {
  let resolvedRef = ref;
  if (!resolvedRef) {
    const branch = await resolveDefaultBranch(owner, repo);
    if (!branch.ok) return { ok: false, error: branch.error };
    resolvedRef = branch.ref;
  }
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${resolvedRef}/${path}`;
  let res: Response;
  try {
    res = await fetch(rawUrl);
  } catch {
    return { ok: false, error: 'Network error — check your connection and try again.' };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 404 ? 'File not found in this repository.' : `Fetch failed (${res.status}).`
    };
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  const { valid, errors } = validateTriviaImport(data);
  if (!valid) return { ok: false, error: `Trivia JSON failed validation: ${errors[0] ?? 'unknown error'}` };
  return { ok: true, trivia: data as Trivia, ref: resolvedRef };
}
