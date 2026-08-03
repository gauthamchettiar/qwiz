import type { Page } from '@playwright/test';

/** Stubs every GitHub host the app can reach, so no spec ever depends on github.com being up or on
 * a public repository still containing what it did when the test was written.
 *
 * Same reasoning and the same shape as `stubExternalEmbeds` in network.ts: fulfil with a real
 * response rather than aborting, since a blocked request is itself a console error and would trade
 * one piece of noise for another. Install these in `beforeEach` BEFORE `page.goto` — a route added
 * after navigation doesn't apply to requests already in flight, the same rule
 * `simulateStorageFull` follows for `addInitScript`.
 *
 * The three hosts here are exactly the three named in `public/_headers`' `connect-src`. If a spec
 * ever sees a real network error, that list and this one have drifted apart.
 */

const API = '**://api.github.com/**';
const RAW = '**://raw.githubusercontent.com/**';
const GIST_RAW = '**://gist.githubusercontent.com/**';

/** Mirrors the CORS headers GitHub really sends, and they are not decoration.
 *
 * A cross-origin response only lets JavaScript read the CORS-safelisted headers unless the server
 * names the others in `Access-Control-Expose-Headers` — so a stub that omits this hides
 * `x-ratelimit-remaining` from the app exactly as a misconfigured server would, and the rate-limit
 * message silently degrades to the generic "GitHub refused the request". That's a stub bug that
 * looks precisely like an app bug, which is why the real header list is reproduced here verbatim
 * (confirmed against api.github.com) rather than guessed at. */
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers':
    'ETag, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset'
};

export interface GistStub {
  /** Filename to file contents. Anything not ending in `.qwiz` is served but ignored by the app,
   * which is worth stubbing so the "a gist with other files in it" case is really exercised. */
  files: Record<string, string>;
}

export interface RepoStub {
  /** Repo-relative path to file contents. Doubles as the tree listing, so a spec declares its
   * fixture repo once rather than keeping a file map and a path list in sync by hand. */
  files: Record<string, string>;
  /** Set when the spec is about GitHub capping a very large tree. */
  truncated?: boolean;
}

function json(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
  };
}

/** Serves a gist through the API exactly as GitHub does: a `files` object keyed by filename, with
 * contents inline. */
export async function stubGist(page: Page, gistId: string, stub: GistStub): Promise<void> {
  await page.route(API, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== `/gists/${gistId}`) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: '{}'
      });
    }
    return route.fulfill(
      json({
        files: Object.fromEntries(
          Object.entries(stub.files).map(([filename, content]) => [
            filename,
            { filename, content, truncated: false, size: content.length }
          ])
        )
      })
    );
  });
}

/** Serves a repository: the recursive tree endpoint for discovery, and every file over the raw
 * host. `ref` is whatever the app asks for, so this works for both a pinned ref and the `HEAD`
 * that a ref-less link resolves to. */
export async function stubRepo(
  page: Page,
  owner: string,
  repo: string,
  stub: RepoStub
): Promise<void> {
  await page.route(API, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith(`/repos/${owner}/${repo}/git/trees/`)) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: '{}'
      });
    }
    return route.fulfill(
      json({
        tree: Object.keys(stub.files).map((path) => ({ path, type: 'blob' })),
        truncated: stub.truncated === true
      })
    );
  });

  await page.route(RAW, async (route) => {
    const url = new URL(route.request().url());
    // /{owner}/{repo}/{ref}/{path…}
    const parts = url.pathname.split('/').filter(Boolean);
    const path = decodeURIComponent(parts.slice(3).join('/'));
    const content = stub.files[path];
    if (content === undefined) {
      return route.fulfill({
        status: 404,
        contentType: 'text/plain',
        headers: CORS_HEADERS,
        body: 'Not Found'
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/plain',
      headers: CORS_HEADERS,
      body: content
    });
  });
}

/** Every GitHub request comes back rate-limited, with the header the app keys its message off. */
export async function stubRateLimited(page: Page): Promise<void> {
  const reset = String(Math.floor(Date.now() / 1000) + 720);
  for (const pattern of [API, RAW, GIST_RAW]) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers: { ...CORS_HEADERS, 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset },
        body: '{}'
      })
    );
  }
}

/** Every GitHub request 404s — a deleted gist, a repo gone private, a typo'd name. */
export async function stubNotFound(page: Page): Promise<void> {
  for (const pattern of [API, RAW, GIST_RAW]) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: '{}'
      })
    );
  }
}

/** GitHub unreachable. `route.abort` is the one place aborting is right: the app's own handling of
 * a rejected fetch is precisely what's under test. */
export async function stubOffline(page: Page): Promise<void> {
  for (const pattern of [API, RAW, GIST_RAW]) {
    await page.route(pattern, (route) => route.abort('failed'));
  }
}

/** Counts requests that would have cost against GitHub's 60-per-hour unauthenticated budget.
 * `raw.githubusercontent.com` is deliberately NOT counted — it isn't metered, and the whole
 * manifest-first design exists to keep this number at zero for a repo that publishes a
 * `.qwizgroup`. That claim is the feature's headline, so it gets asserted rather than commented. */
export function countApiCalls(page: Page): () => number {
  let calls = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'api.github.com') calls += 1;
  });
  return () => calls;
}
