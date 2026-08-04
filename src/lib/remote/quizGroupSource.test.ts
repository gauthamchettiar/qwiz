import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPlayableAsRun, loadQuizGroup } from './quizGroupSource';
import { parseQwizGroup } from '@/lib/utils/quizGroup';

/** Serves a fake repository, and records which hosts were hit — the API-call count is the thing
 * most worth asserting here, since "a published group costs nothing against the rate limit" is the
 * claim the whole manifest-first design exists to make good on. */
function stubRepo(
  files: Record<string, string>,
  options: { truncated?: boolean; treeFails?: boolean } = {}
) {
  const apiCalls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'api.github.com') {
      apiCalls.push(url);
      if (options.treeFails) {
        return {
          ok: false,
          status: 403,
          headers: {
            get: (n: string) => (n.toLowerCase() === 'x-ratelimit-remaining' ? '0' : null)
          },
          text: async () => '',
          json: async () => ({})
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => '',
        json: async () => ({
          tree: Object.keys(files).map((path) => ({ path, type: 'blob' })),
          truncated: options.truncated === true
        })
      } as unknown as Response;
    }

    const path = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).slice(3).join('/'));
    const content = files[path];
    return {
      ok: content !== undefined,
      status: content === undefined ? 404 : 200,
      headers: { get: () => null },
      text: async () => content ?? '',
      json: async () => ({})
    } as unknown as Response;
  });
  return () => apiCalls.length;
}

const REF = { owner: 'o', repo: 'r' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadQuizGroup — the manifest-first promise', () => {
  it('spends ZERO api.github.com calls when a manifest lists its quizzes', async () => {
    const apiCalls = stubRepo({
      '.qwizgroup': ['---', 'title: Trail', '---', '', 'quiz: a.qwiz', '', 'quiz: b.qwiz'].join(
        '\n'
      ),
      'a.qwiz': 'A',
      'b.qwiz': 'B'
    });

    const { loaded, error } = await loadQuizGroup(REF);
    expect(error).toBeUndefined();
    expect(loaded?.fromManifest).toBe(true);
    expect(loaded?.group.entries.map((e) => e.path)).toEqual(['a.qwiz', 'b.qwiz']);
    // The headline claim, asserted rather than commented.
    expect(apiCalls()).toBe(0);
  });

  it('spends exactly one call when there is no manifest to read', async () => {
    const apiCalls = stubRepo({ 'rounds/a.qwiz': 'A', 'README.md': '#' });

    const { loaded } = await loadQuizGroup(REF);
    expect(loaded?.fromManifest).toBe(false);
    expect(loaded?.group.entries.map((e) => e.path)).toEqual(['rounds/a.qwiz']);
    expect(apiCalls()).toBe(1);
  });

  it('spends one call when a manifest opts into discovery, and keeps what it listed', async () => {
    const apiCalls = stubRepo({
      '.qwizgroup': ['---', ':discover=true', '---', '', 'quiz: a.qwiz', 'title: Named'].join('\n'),
      'a.qwiz': 'A',
      'b.qwiz': 'B'
    });

    const { loaded } = await loadQuizGroup(REF);
    expect(apiCalls()).toBe(1);
    expect(loaded?.group.entries.map((e) => e.path).sort()).toEqual(['a.qwiz', 'b.qwiz']);
    expect(loaded?.group.entries.find((e) => e.path === 'a.qwiz')?.title).toBe('Named');
  });
});

describe('loadQuizGroup — scoping and nesting', () => {
  it('resolves entry paths against the folder the manifest sits in', async () => {
    stubRepo({
      'rounds/.qwizgroup': ['---', '---', '', 'quiz: one.qwiz'].join('\n'),
      'rounds/one.qwiz': 'ONE'
    });

    const { loaded } = await loadQuizGroup({ ...REF, path: 'rounds' });
    expect(loaded?.group.entries[0].path).toBe('rounds/one.qwiz');
  });

  it('offers a nested group as its own screen instead of flattening it in', async () => {
    stubRepo({
      'top.qwiz': 'T',
      'extra/.qwizgroup': ['---', '---', '', 'quiz: four.qwiz'].join('\n'),
      'extra/four.qwiz': 'F'
    });

    const { loaded } = await loadQuizGroup(REF);
    expect(loaded?.subGroups).toEqual(['extra']);
    // extra/four.qwiz belongs to the nested group, so it isn't also listed here.
    expect(loaded?.group.entries.map((e) => e.path)).toEqual(['top.qwiz']);
  });
});

describe('loadQuizGroup — failure and degradation', () => {
  it('reports a manifest that does not parse, rather than degrading past it', async () => {
    stubRepo({ '.qwizgroup': ['---', ':mode=carousel', '---', '', 'quiz: a.qwiz'].join('\n') });

    const { error, loaded } = await loadQuizGroup(REF);
    expect(loaded).toBeUndefined();
    expect(error).toMatch(/\.qwizgroup file has/);
    expect(error).toMatch(/must be one of/);
  });

  it('keeps what a manifest listed when discovery is refused, instead of losing everything', async () => {
    stubRepo(
      {
        '.qwizgroup': ['---', ':discover=true', '---', '', 'quiz: a.qwiz'].join('\n'),
        'a.qwiz': 'A'
      },
      { treeFails: true }
    );

    const { loaded, error } = await loadQuizGroup(REF);
    expect(error).toBeUndefined();
    expect(loaded?.group.entries.map((e) => e.path)).toEqual(['a.qwiz']);
    // Degraded, but the reader is told why the list may be short.
    expect(loaded?.warnings.join()).toMatch(/rate-limiting/);
  });

  it('fails outright when there is no manifest and discovery is refused', async () => {
    stubRepo({ 'a.qwiz': 'A' }, { treeFails: true });
    const { error } = await loadQuizGroup(REF);
    expect(error).toMatch(/rate-limiting/);
  });

  it('warns about a truncated tree rather than showing a quietly partial list', async () => {
    stubRepo({ 'a.qwiz': 'A' }, { truncated: true });
    const { loaded } = await loadQuizGroup(REF);
    expect(loaded?.warnings.join()).toMatch(/too large/);
    expect(loaded?.warnings.join()).toMatch(/\.qwizgroup/);
  });

  it('says so when a repository holds no quizzes at all', async () => {
    stubRepo({ 'README.md': '#' });
    const { error } = await loadQuizGroup(REF);
    expect(error).toMatch(/doesn't contain any \.qwiz files/);
  });

  it('distinguishes an empty subfolder from an empty repository', async () => {
    stubRepo({ 'rounds/a.qwiz': 'A' });
    const { error } = await loadQuizGroup({ ...REF, path: 'empty' });
    expect(error).toMatch(/No \.qwiz files in "empty"/);
  });
});

describe('isPlayableAsRun', () => {
  it('is false for the browsing modes, where the player chooses what to open next', () => {
    const folders = parseQwizGroup(['---', '---', '', 'quiz: a.qwiz'].join('\n')).group;
    expect(isPlayableAsRun(folders)).toBe(false);

    // A journey's ORDER is the content — playing it as one run would skip every gate it exists to
    // impose, so the lobby must not offer that.
    const journey = parseQwizGroup(
      ['---', ':mode=journey', '---', '', 'quiz: a.qwiz', 'id: a'].join('\n')
    ).group;
    expect(isPlayableAsRun(journey)).toBe(false);
  });

  it('is true for a mode that chains or merges', () => {
    for (const mode of ['merge', 'playlist', 'shuffle', 'gauntlet']) {
      const { group } = parseQwizGroup(
        ['---', `:mode=${mode}`, '---', '', 'quiz: a.qwiz'].join('\n')
      );
      expect(isPlayableAsRun(group), mode).toBe(true);
    }
  });

  it('is false for an empty group whatever its mode', () => {
    const { group } = parseQwizGroup(['---', ':mode=merge', '---'].join('\n'));
    expect(isPlayableAsRun(group)).toBe(false);
  });
});
