/** The only module in the app that calls `fetch`.
 *
 * Same rule, and the same reason, as `lib/stores/*` owning the one `localStorage` side effect: a
 * side effect that lives in exactly one file is one file to audit, one file to stub in tests, and
 * one place where a "wait, this app talks to the network?" question gets answered. Every decision
 * this module makes — which URL, what a status code means, whether a path is safe — is factored out
 * into `lib/utils/githubRef.ts` so it can be tested without a network; what's left here is
 * genuinely just the call and the shape of its result.
 *
 * Nothing here throws. A repository being unreachable, private, renamed or rate-limited is expected
 * input, not a programmer error — exactly the reasoning behind `decodeSharePayload` returning
 * `{ source, error }` rather than throwing on a damaged link.
 */

import {
  describeHttpFailure,
  fileNameOf,
  gistApiUrl,
  isQwizPath,
  rawFileUrl,
  NETWORK_ERROR_MESSAGE,
  type FetchSubject,
  type RepoRef
} from '@/lib/utils/githubRef';

export type Fetched<T> = { ok: true; data: T } | { ok: false; error: string };

/** How many content requests are allowed in flight at once. `raw.githubusercontent.com` isn't rate
 * limited, but a repo with fifty quizzes shouldn't open fifty sockets at once either — the browser
 * would queue them anyway, and an unbounded `Promise.all` (which is what the prototype this was
 * ported from does) makes a slow repo look like a hung page rather than a loading one. */
const CONCURRENCY = 6;

/** `Promise.all` with a ceiling on how many mappers run at once, preserving input order in the
 * output. Exported for its own unit test: the "pull the next index off a shared counter" pattern
 * is small but exactly the kind of thing that silently drops or duplicates an item. */
export async function mapWithLimit<In, Out>(
  items: readonly In[],
  limit: number,
  map: (item: In, index: number) => Promise<Out>
): Promise<Out[]> {
  const results = new Array<Out>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await map(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** How long to wait before giving up on GitHub. Without this a hung connection leaves the page on
 * its loading state indefinitely, which reads as a broken app rather than a slow network. */
const TIMEOUT_MS = 15_000;

async function request(url: string, subject: FetchSubject): Promise<Fetched<Response>> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      // The visitor's GitHub session cookie must never ride along. Everything this app reads is
      // public by definition, so credentials could only ever widen what's returned — silently
      // making a private repo readable for the person who happens to be signed in, and returning a
      // 404 for everyone they shared the link with.
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (error) {
    // A rejected fetch can't distinguish offline from DNS failure from a CORS refusal — the
    // browser deliberately doesn't say which. Worth knowing while debugging: a `connect-src`
    // violation in `public/_headers` lands here too, indistinguishable from being offline.
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { ok: false, error: 'GitHub took too long to answer. Try again in a moment.' };
    }
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
  if (!response.ok) {
    return { ok: false, error: describeHttpFailure(response.status, response.headers, subject) };
  }
  return { ok: true, data: response };
}

/** Raw text of one file. Used for every `.qwiz` read from a repository, always against
 * `raw.githubusercontent.com`, which has no rate limit — the API is only ever spent on a gist. */
export async function fetchText(
  url: string,
  subject: FetchSubject = 'file'
): Promise<Fetched<string>> {
  const response = await request(url, subject);
  if (!response.ok) return response;
  try {
    return { ok: true, data: await response.data.text() };
  } catch {
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
}

export interface GistFile {
  name: string;
  content: string;
}

interface GistApiFile {
  filename?: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

/** Every `.qwiz` file in a public gist.
 *
 * This is the one place the app spends a rate-limited API call on a single quiz, and it's worth it:
 * `gist.githubusercontent.com` needs the gist OWNER in its path, which a bare gist id doesn't give
 * us, and the API response carries the file list — which is what turns a multi-file gist into a
 * picker instead of a guess. Files over ~1MB come back `truncated` with only a prefix of their
 * content, so those are re-fetched whole from the `raw_url` the API hands us. */
export async function fetchGistQwizFiles(gistId: string): Promise<Fetched<GistFile[]>> {
  const response = await request(gistApiUrl(gistId), 'gist');
  if (!response.ok) return response;

  let payload: { files?: Record<string, GistApiFile | null> };
  try {
    payload = (await response.data.json()) as typeof payload;
  } catch {
    return { ok: false, error: 'GitHub sent back something Qwiz could not read.' };
  }

  const entries = Object.values(payload.files ?? {}).filter(
    (file): file is GistApiFile => file !== null && typeof file === 'object'
  );
  const qwizEntries = entries.filter((file) => file.filename && isQwizPath(file.filename));

  if (qwizEntries.length === 0) {
    return {
      ok: false,
      error:
        entries.length === 0
          ? 'That gist is empty.'
          : "That gist doesn't contain a .qwiz file. Qwiz can only play files ending in .qwiz."
    };
  }

  const files = await mapWithLimit(
    qwizEntries,
    CONCURRENCY,
    async (file): Promise<GistFile | null> => {
      const name = file.filename ?? '';
      if (!file.truncated && typeof file.content === 'string')
        return { name, content: file.content };
      if (!file.raw_url) return null;
      const raw = await fetchText(file.raw_url, 'gist');
      return raw.ok ? { name, content: raw.data } : null;
    }
  );

  const usable = files.filter((file): file is GistFile => file !== null);
  if (usable.length === 0) {
    return { ok: false, error: "Couldn't read the .qwiz file out of that gist." };
  }
  return { ok: true, data: usable };
}

/** A single file, by repo-relative path. */
export async function fetchRepoFile(ref: RepoRef, path: string): Promise<Fetched<string>> {
  return fetchText(rawFileUrl(ref, path), 'file');
}

/** Whether a path looks like the file a `?file=` parameter named, matching on the bare filename so
 * a gist's `?file=round-one.qwiz` works without the visitor knowing how GitHub slugs it. */
export function matchesFileName(candidate: string, wanted: string): boolean {
  return fileNameOf(candidate).toLowerCase() === fileNameOf(wanted).toLowerCase();
}
