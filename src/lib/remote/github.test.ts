import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGistQwizFiles, fetchText, mapWithLimit, matchesFileName } from './github';

/** Stubs `fetch` with a lookup from URL to response, so these tests exercise this module's own
 * decisions (which file, which error, how many at once) without a network. Anything not in the map
 * 404s, which is exactly what GitHub would do. */
function stubFetch(
  routes: Record<string, { status?: number; body?: unknown; headers?: Record<string, string> }>
) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    const route = routes[url] ?? { status: 404 };
    const status = route.status ?? 200;
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => route.headers?.[name.toLowerCase()] ?? null },
      text: async () => body,
      json: async () => JSON.parse(body)
    } as unknown as Response;
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mapWithLimit', () => {
  it('preserves input order regardless of completion order', async () => {
    const result = await mapWithLimit([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms / 10));
      return ms;
    });
    expect(result).toEqual([30, 10, 20]);
  });

  it('never runs more than `limit` at once', async () => {
    let live = 0;
    let peak = 0;
    await mapWithLimit(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async (n) => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((resolve) => setTimeout(resolve, 1));
        live -= 1;
        return n;
      }
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('visits every item exactly once — the failure mode this helper exists to rule out', async () => {
    const seen: number[] = [];
    await mapWithLimit(
      Array.from({ length: 50 }, (_, i) => i),
      6,
      async (n) => {
        seen.push(n);
        return n;
      }
    );
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('handles an empty list without hanging', async () => {
    expect(await mapWithLimit([], 6, async (n) => n)).toEqual([]);
  });
});

describe('fetchText', () => {
  it('returns the body of a successful response', async () => {
    stubFetch({ 'https://x/a.qwiz': { body: '---\ntitle: A\n---' } });
    const result = await fetchText('https://x/a.qwiz');
    expect(result).toEqual({ ok: true, data: '---\ntitle: A\n---' });
  });

  it('never attaches the visitor GitHub session cookie', async () => {
    const init: RequestInit[] = [];
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
      init.push(options);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => ''
      } as unknown as Response;
    });
    await fetchText('https://x/a.qwiz');
    expect(init[0].credentials).toBe('omit');
  });

  it('reports a rejected fetch as unreachable rather than throwing', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await fetchText('https://x/a.qwiz');
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.error).toMatch(/Couldn't reach GitHub/);
  });

  it('distinguishes a timeout, which is worth waiting out, from being offline', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('The operation was aborted', 'TimeoutError');
    });
    const result = await fetchText('https://x/a.qwiz');
    expect(result.ok === false && result.error).toMatch(/took too long/);
  });
});

describe('fetchGistQwizFiles', () => {
  const gistUrl = 'https://api.github.com/gists/abc';

  it('returns the .qwiz files inline, without a second request', async () => {
    const calls = stubFetch({
      [gistUrl]: {
        body: {
          files: {
            'round.qwiz': { filename: 'round.qwiz', content: 'QUIZ', truncated: false },
            'notes.md': { filename: 'notes.md', content: '# notes' }
          }
        }
      }
    });
    const result = await fetchGistQwizFiles('abc');
    expect(result).toEqual({ ok: true, data: [{ name: 'round.qwiz', content: 'QUIZ' }] });
    expect(calls).toEqual([gistUrl]);
  });

  it('re-fetches a file GitHub truncated, which it only does past about a megabyte', async () => {
    stubFetch({
      [gistUrl]: {
        body: {
          files: {
            'big.qwiz': {
              filename: 'big.qwiz',
              content: 'PREFIX ONLY',
              truncated: true,
              raw_url: 'https://gist.githubusercontent.com/u/abc/raw/big.qwiz'
            }
          }
        }
      },
      'https://gist.githubusercontent.com/u/abc/raw/big.qwiz': { body: 'THE WHOLE THING' }
    });
    const result = await fetchGistQwizFiles('abc');
    expect(result).toEqual({ ok: true, data: [{ name: 'big.qwiz', content: 'THE WHOLE THING' }] });
  });

  it('returns every .qwiz when there are several, so the caller can offer a choice', async () => {
    stubFetch({
      [gistUrl]: {
        body: {
          files: {
            'a.qwiz': { filename: 'a.qwiz', content: 'A' },
            'b.qwiz': { filename: 'b.qwiz', content: 'B' }
          }
        }
      }
    });
    const result = await fetchGistQwizFiles('abc');
    expect(result.ok === true && result.data).toHaveLength(2);
  });

  it('says a gist without a .qwiz differently from an empty one', async () => {
    stubFetch({
      [gistUrl]: { body: { files: { 'notes.md': { filename: 'notes.md', content: '' } } } }
    });
    const withoutQwiz = await fetchGistQwizFiles('abc');
    expect(withoutQwiz.ok === false && withoutQwiz.error).toMatch(/doesn't contain a \.qwiz/);

    stubFetch({ [gistUrl]: { body: { files: {} } } });
    const empty = await fetchGistQwizFiles('abc');
    expect(empty.ok === false && empty.error).toMatch(/empty/);
  });

  it('reports a missing gist as private-or-gone', async () => {
    stubFetch({});
    const result = await fetchGistQwizFiles('abc');
    expect(result.ok === false && result.error).toMatch(/gist doesn't exist, or it's private/);
  });

  it('reports the rate limit with its own message', async () => {
    stubFetch({ [gistUrl]: { status: 403, headers: { 'x-ratelimit-remaining': '0' } } });
    const result = await fetchGistQwizFiles('abc');
    expect(result.ok === false && result.error).toMatch(/rate-limiting/);
  });
});

describe('matchesFileName', () => {
  it('matches on the bare filename, case-insensitively', () => {
    expect(matchesFileName('rounds/Round One.qwiz', 'round one.qwiz')).toBe(true);
    expect(matchesFileName('rounds/a.qwiz', 'b.qwiz')).toBe(false);
  });
});
