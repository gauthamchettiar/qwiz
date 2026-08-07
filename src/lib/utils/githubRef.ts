/** Everything about talking to GitHub that doesn't actually touch the network: parsing what a
 * visitor pasted or what a link carried, building the URLs to fetch, and turning a failed response
 * into a sentence worth reading.
 *
 * Split from `lib/remote/github.ts` (the only module allowed to call `fetch`) for the same reason
 * `toBase64Url` is split out of `encodeSharePayload`: these are the parts with an off-by-one or a
 * wrong-host to get wrong, and they're only testable on their own if no network is involved.
 */

/** The ref used whenever a link doesn't pin one. Git resolves `HEAD` to the repository's default
 * branch server-side on `raw.githubusercontent.com`, so a durable (ref-less) link keeps working
 * after the default branch is renamed, with no `GET /repos` call needed to look it up. Verified
 * against a repo whose default branch is neither `main` nor `master`. */
export const DEFAULT_REF = 'HEAD';

export interface GistRef {
  gistId: string;
  /** A specific file within the gist. Absent means "the only `.qwiz` in it", and a gist holding
   * several without one named becomes a picker rather than an error. */
  file?: string;
}

export interface RepoRef {
  owner: string;
  repo: string;
  /** Branch, tag or commit. Absent means `DEFAULT_REF` — links the app generates deliberately
   * leave this off so they keep working after the default branch is renamed. */
  ref?: string;
  /** A path WITHIN the repo that the ref itself carried (a pasted `/tree/main/quizzes` URL), used
   * as the starting directory. Not to be confused with the file path passed to `rawFileUrl`. */
  path?: string;
}

/** Gist ids are hex — long ones on modern gists, short decimal ones on gists old enough to
 * predate them. Both are covered by "hex, at least five characters", which is tight enough to
 * reject a pasted username or a truncated URL. */
const GIST_ID = /^[0-9a-f]{5,}$/i;

/** Owner and repo names: GitHub allows letters, digits, hyphen, underscore and dot, nothing else.
 * Anchored per segment rather than applied to the whole string, so a path can't smuggle a slash
 * through into the host portion of a built URL. */
const NAME_SEGMENT = /^[\w.-]+$/;

/** Accepts a bare gist id, a `gist.github.com` URL with or without the owner segment, and either
 * with a trailing `#file-…` anchor — all three are things people actually copy out of a browser.
 * Returns null rather than throwing: a mistyped id is expected input, not a programmer error. */
export function parseGistRef(input: string): GistRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(
    /^https?:\/\/gist\.github\.com\/(?:[\w.-]+\/)?([0-9a-f]{5,})(?:\.git)?\/?(?:#.*)?$/i
  );
  const candidate = urlMatch ? urlMatch[1] : trimmed;

  return GIST_ID.test(candidate) ? { gistId: candidate.toLowerCase() } : null;
}

/** Accepts `owner/repo`, `owner/repo@ref`, a plain `github.com` URL (with or without `.git`), and
 * a `/tree/<ref>/<path>` URL — the last because that's what the address bar holds when someone is
 * looking at the folder they want to share, and refusing it would be pedantry.
 *
 * A branch name may itself contain slashes (`feature/x`), which is unresolvable against a trailing
 * path in the `/tree/` form without asking GitHub which is which. The first segment is taken as
 * the ref and the rest as the path — correct for the overwhelmingly common case, and a wrong guess
 * surfaces as an ordinary "not found" rather than as anything silent. */
export function parseRepoRef(input: string): RepoRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/(.+)$/i);
  let rest = urlMatch ? urlMatch[1] : trimmed;
  rest = rest.replace(/\/+$/, '');

  // `owner/repo@ref` — only meaningful on the shorthand form, since a URL carries its ref in the
  // path instead.
  let ref: string | undefined;
  const atIndex = rest.indexOf('@');
  if (!urlMatch && atIndex > 0) {
    ref = rest.slice(atIndex + 1) || undefined;
    rest = rest.slice(0, atIndex);
  }

  const segments = rest.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const [owner, rawRepo, ...tail] = segments;
  const repo = rawRepo.replace(/\.git$/i, '');
  if (!NAME_SEGMENT.test(owner) || !NAME_SEGMENT.test(repo)) return null;

  let path: string | undefined;
  if (tail.length > 0) {
    // `/tree/<ref>/<path…>` and `/blob/<ref>/<path…>` are the two forms GitHub's own UI produces.
    if ((tail[0] === 'tree' || tail[0] === 'blob') && tail.length >= 2) {
      ref = tail[1];
      path = tail.slice(2).join('/') || undefined;
    } else {
      return null;
    }
  }

  if (ref !== undefined && !isSafeRef(ref)) return null;
  if (path !== undefined && !isSafePath(path)) return null;

  return { owner, repo, ...(ref ? { ref } : {}), ...(path ? { path } : {}) };
}

/** A ref goes into a URL path unencoded-looking but must not be able to climb out of it. Rejects
 * traversal and anything that isn't plausibly a git ref name. */
export function isSafeRef(ref: string): boolean {
  return ref.length > 0 && !ref.includes('..') && /^[\w./-]+$/.test(ref);
}

/** A repo-relative file path. Rejects absolute paths and any `..` segment: these come from a query
 * string, and while GitHub would simply 404 a traversal attempt, building a URL that tries is not
 * something this app should be doing in the first place. */
export function isSafePath(path: string): boolean {
  if (path.length === 0 || path.startsWith('/')) return false;
  return path.split('/').every((segment) => segment !== '..' && segment !== '.' && segment !== '');
}

/** `.qwiz` documents only — the tree of a repo that also holds code shouldn't offer its source
 * files as quizzes. */
export function isQwizPath(path: string): boolean {
  return path.toLowerCase().endsWith('.qwiz');
}

export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Percent-encodes each path segment but not the separators, so a quiz filed under
 * `general knowledge/round one.qwiz` resolves instead of 404ing on the space. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function rawFileUrl(ref: RepoRef, path: string): string {
  const gitRef = ref.ref ?? DEFAULT_REF;
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(gitRef)}/${encodePath(path)}`;
}

export function gistApiUrl(gistId: string): string {
  return `https://api.github.com/gists/${encodeURIComponent(gistId)}`;
}

/** What was being fetched, so a 404 can say something more useful than "not found". */
export type FetchSubject = 'gist' | 'file';

/** The minimum of `Headers` this module needs, so a unit test can pass a plain object instead of
 * constructing a `Response`. */
export interface HeaderReader {
  get(name: string): string | null;
}

/** " — it resets in about 12 minutes" when GitHub told us when, and nothing at all when it didn't.
 * `now` is a parameter rather than a `Date.now()` call so this stays a pure function of its inputs
 * and the wording is testable without freezing a clock. */
function describeRateLimitReset(headers: HeaderReader, now: number): string {
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (!Number.isFinite(reset) || reset <= 0) return '';
  const minutes = Math.ceil((reset * 1000 - now) / 60_000);
  if (minutes <= 0 || minutes > 60) return '';
  return minutes === 1
    ? ' — it resets in about a minute'
    : ` — it resets in about ${minutes} minutes`;
}

/** Turns a failed response into one sentence, in the same register as `decodeSharePayload`'s three
 * messages: each one tells the reader a DIFFERENT thing to do next, which is the whole reason
 * they're separate rather than one generic "couldn't load".
 *
 * The rate-limit case is the one worth the extra clause. It's the only failure here that isn't the
 * link's fault and isn't permanent, and the fix is something the reader can't be expected to
 * guess: only a gist spends the rate-limited API (`fetchGistQwizFiles` calls `api.github.com`) — a
 * link to a file in a public repository is read straight off the unmetered raw host and never
 * touches it. */
export function describeHttpFailure(
  status: number,
  headers: HeaderReader,
  subject: FetchSubject,
  now: number = Date.now()
): string {
  if (status === 403 || status === 429) {
    if (headers.get('x-ratelimit-remaining') === '0' || status === 429) {
      return `GitHub is rate-limiting this browser${describeRateLimitReset(headers, now)}. The limit is 60 requests an hour, shared by everything on this network. Only loading a gist spends it — a link to a file in a public repository never does.`;
    }
    return "GitHub refused the request. If this is a private repository or gist, Qwiz can't read it — only public ones.";
  }
  if (status === 404) {
    if (subject === 'gist') {
      return "That gist doesn't exist, or it's private. Qwiz can only load public gists.";
    }
    return "That file isn't in this repository. It may have been moved, renamed, or not pushed yet.";
  }
  return `GitHub returned an error (${status}).`;
}

/** A rejected `fetch` — offline, DNS, or a CORS preflight refusal. Indistinguishable from each
 * other in the browser by design, so they share one message. */
export const NETWORK_ERROR_MESSAGE = "Couldn't reach GitHub — check your connection and try again.";
