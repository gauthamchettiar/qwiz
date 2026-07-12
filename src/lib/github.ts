import type { Trivia, TriviaSummary } from './types';
import { toSummary } from './types';
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

export interface RepoQuizGroup {
  name: string;
  trivias: (TriviaSummary & { path: string })[];
}

/** One trivia in a journey, keyed to a trivia file and gated behind prerequisite nodes. */
export interface JourneyNode {
  id: string;
  /** Repo-relative path of the trivia this node plays (must match a fetched trivia). */
  path: string;
  /** Node ids that must be satisfied before this one unlocks. Empty = a starting node. */
  requires: string[];
  /** Overrides the journey default: must prerequisites be *won* (cracked) or merely completed? */
  requireWin?: boolean;
}

/** Optional `quiz-data/description.json` that turns a repo's flat folder list into a guided
 * journey — a timeline/tree the player unlocks one trivia at a time. */
export interface JourneyConfig {
  mode: 'journey';
  title?: string;
  description?: string;
  /** Default for every node: must prerequisites be won to unlock, or just completed? */
  requireWin: boolean;
  nodes: JourneyNode[];
}

/** Optional `quiz-data/description.json` with "mode":"category" — a pick-your-topic challenge
 * where the player chooses a folder every few questions and is scored on the average. */
export interface CategoryConfig {
  mode: 'category';
  title?: string;
  description?: string;
  /** How many questions to answer before choosing the next category. Default 1. */
  questionsPerPick: number;
  /** How many category picks make up a full run. */
  rounds: number;
}

export interface RepoQuizResult {
  owner: string;
  repo: string;
  ref: string;
  groups: RepoQuizGroup[];
  skipped: string[];
  /** Present when the repo ships a journey description.json; otherwise the folder view is used. */
  journey: JourneyConfig | null;
  /** Present when the repo's description.json is in category mode. */
  category: CategoryConfig | null;
  fetchedAt: string;
}

const DESCRIPTION_PATH = `${QUIZ_DATA_PREFIX}description.json`;

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

function cacheKey(owner: string, repo: string): string {
  return `qwiz:repo-cache:${owner}/${repo}`;
}

export function getCachedRepoQuizData(owner: string, repo: string): RepoQuizResult | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(owner, repo));
    return raw ? (JSON.parse(raw) as RepoQuizResult) : null;
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

/** Fetches and groups every valid trivia JSON under quiz-data/ in a public GitHub repo. */
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

  const jsonPaths = tree.data.tree.filter(
    (e) => e.type === 'blob' && e.path.startsWith(QUIZ_DATA_PREFIX) && e.path.endsWith('.json') && e.path !== DESCRIPTION_PATH
  );

  if (jsonPaths.length === 0) {
    return { ok: false, error: `No quiz-data/ folder with JSON files found in ${owner}/${repo}.` };
  }

  const skipped: string[] = [];
  const byGroup = new Map<string, (TriviaSummary & { path: string })[]>();

  await Promise.all(
    jsonPaths.map(async (entry) => {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${entry.path}`;
      try {
        const res = await fetch(rawUrl);
        if (!res.ok) {
          skipped.push(entry.path);
          return;
        }
        const data = await res.json();
        const { valid } = validateTriviaImport(data);
        if (!valid) {
          skipped.push(entry.path);
          return;
        }
        const trivia = data as Trivia;
        const rest = entry.path.slice(QUIZ_DATA_PREFIX.length);
        const lastSlash = rest.lastIndexOf('/');
        const group = lastSlash === -1 ? 'General' : rest.slice(0, lastSlash);
        const list = byGroup.get(group) ?? [];
        list.push({ ...toSummary(trivia), path: entry.path });
        byGroup.set(group, list);
      } catch {
        skipped.push(entry.path);
      }
    })
  );

  if (byGroup.size === 0) {
    return { ok: false, error: `Found ${jsonPaths.length} file(s) under quiz-data/, but none were valid trivia JSON.` };
  }

  const groups: RepoQuizGroup[] = Array.from(byGroup.entries())
    .sort(([a], [b]) => (a === 'General' ? -1 : b === 'General' ? 1 : a.localeCompare(b)))
    .map(([name, trivias]) => ({ name, trivias: trivias.sort((a, b) => a.title.localeCompare(b.title)) }));

  // A repo can opt into journey or category mode by shipping quiz-data/description.json.
  let journey: JourneyConfig | null = null;
  let category: CategoryConfig | null = null;
  if (tree.data.tree.some((e) => e.path === DESCRIPTION_PATH)) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${DESCRIPTION_PATH}`);
      if (res.ok) {
        const data = await res.json();
        journey = parseJourney(data);
        category = parseCategory(data);
      }
    } catch {
      // A broken description.json just falls back to the folder view.
    }
  }

  const result: RepoQuizResult = { owner, repo, ref, groups, skipped, journey, category, fetchedAt: new Date().toISOString() };
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
