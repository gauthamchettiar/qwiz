import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeSharePayload } from '@/lib/utils/shareLink';
import { resolveQuizSource } from './quizSource';

function stubGist(files: Record<string, string>) {
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => '',
    json: async () => ({
      files: Object.fromEntries(
        Object.entries(files).map(([name, content]) => [name, { filename: name, content }])
      )
    })
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveQuizSource', () => {
  it('decodes a fragment without touching the network', async () => {
    // No fetch stub is installed: if this branch reached the network the test would throw.
    const payload = await encodeSharePayload('---\ntitle: A\n---');
    const result = await resolveQuizSource({ kind: 'fragment', payload });
    expect(result).toEqual({ source: '---\ntitle: A\n---' });
  });

  it('passes a damaged fragment through with the share link decoder own message', async () => {
    const result = await resolveQuizSource({ kind: 'fragment', payload: '9.nonsense' });
    expect(result.error).toMatch(/version of Qwiz/);
  });

  it('plays a single-quiz gist straight through', async () => {
    stubGist({ 'round.qwiz': 'QUIZ' });
    expect(await resolveQuizSource({ kind: 'gist', gistId: 'abc' })).toEqual({ source: 'QUIZ' });
  });

  it('offers a choice rather than guessing when a gist holds several quizzes', async () => {
    stubGist({ 'a.qwiz': 'A', 'b.qwiz': 'B' });
    const result = await resolveQuizSource({ kind: 'gist', gistId: 'abc' });
    expect(result.source).toBeUndefined();
    expect(result.choices?.map((file) => file.name)).toEqual(['a.qwiz', 'b.qwiz']);
  });

  it('picks the named file out of a multi-quiz gist', async () => {
    stubGist({ 'a.qwiz': 'A', 'b.qwiz': 'B' });
    expect(await resolveQuizSource({ kind: 'gist', gistId: 'abc', file: 'b.qwiz' })).toEqual({
      source: 'B'
    });
  });

  it('lists what the gist does contain when the named file is not in it', async () => {
    stubGist({ 'a.qwiz': 'A' });
    const result = await resolveQuizSource({ kind: 'gist', gistId: 'abc', file: 'missing.qwiz' });
    expect(result.error).toContain('missing.qwiz');
    expect(result.error).toContain('a.qwiz');
  });

  it('fetches one file out of a repository', async () => {
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: url.endsWith('/HEAD/rounds/one.qwiz'),
      status: url.endsWith('/HEAD/rounds/one.qwiz') ? 200 : 404,
      headers: { get: () => null },
      text: async () => 'REPO QUIZ',
      json: async () => ({})
    }));
    expect(
      await resolveQuizSource({
        kind: 'repo',
        repo: { owner: 'o', repo: 'r' },
        path: 'rounds/one.qwiz'
      })
    ).toEqual({ source: 'REPO QUIZ' });
  });

  it('reports a missing repo file as moved-or-renamed', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => '',
      json: async () => ({})
    }));
    const result = await resolveQuizSource({
      kind: 'repo',
      repo: { owner: 'o', repo: 'r' },
      path: 'gone.qwiz'
    });
    expect(result.error).toMatch(/moved, renamed/);
  });
});
