import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REF,
  describeHttpFailure,
  fileNameOf,
  gistApiUrl,
  isQwizPath,
  isSafePath,
  isSafeRef,
  parseGistRef,
  parseRepoRef,
  rawFileUrl,
  type HeaderReader
} from './githubRef';

/** A stand-in for `Response.headers`, so the failure taxonomy is testable without a Response. */
function headers(values: Record<string, string> = {}): HeaderReader {
  return { get: (name) => values[name.toLowerCase()] ?? null };
}

describe('parseGistRef', () => {
  it('accepts a bare gist id', () => {
    expect(parseGistRef('aa5f1c1b8d0d0a3e0e6e9c9a0b1c2d3e')).toEqual({
      gistId: 'aa5f1c1b8d0d0a3e0e6e9c9a0b1c2d3e'
    });
  });

  it('accepts the short decimal ids of older gists', () => {
    expect(parseGistRef('6011986')).toEqual({ gistId: '6011986' });
  });

  it('accepts a gist URL with and without the owner segment', () => {
    expect(parseGistRef('https://gist.github.com/minrk/6011986')).toEqual({ gistId: '6011986' });
    expect(parseGistRef('https://gist.github.com/6011986')).toEqual({ gistId: '6011986' });
  });

  it('tolerates the trailing #file- anchor a browser leaves on a copied URL', () => {
    expect(parseGistRef('https://gist.github.com/minrk/6011986#file-notes-qwiz')).toEqual({
      gistId: '6011986'
    });
  });

  it('lower-cases the id so two spellings share one cache key', () => {
    expect(parseGistRef('AA5F1C1B')).toEqual({ gistId: 'aa5f1c1b' });
  });

  it.each(['', '   ', 'not-a-gist', 'https://github.com/owner/repo', 'abcd', 'zzzzzz'])(
    'rejects %o',
    (input) => {
      expect(parseGistRef(input)).toBeNull();
    }
  );
});

describe('parseRepoRef', () => {
  it('accepts the owner/repo shorthand', () => {
    expect(parseRepoRef('gauthamchettiar/qwiz')).toEqual({
      owner: 'gauthamchettiar',
      repo: 'qwiz'
    });
  });

  it('accepts a github.com URL, with or without .git and a trailing slash', () => {
    expect(parseRepoRef('https://github.com/gauthamchettiar/qwiz')).toEqual({
      owner: 'gauthamchettiar',
      repo: 'qwiz'
    });
    expect(parseRepoRef('https://github.com/gauthamchettiar/qwiz.git')).toEqual({
      owner: 'gauthamchettiar',
      repo: 'qwiz'
    });
    expect(parseRepoRef('https://github.com/gauthamchettiar/qwiz/')).toEqual({
      owner: 'gauthamchettiar',
      repo: 'qwiz'
    });
  });

  it('reads a ref off the owner/repo@ref shorthand', () => {
    expect(parseRepoRef('owner/repo@v2')).toEqual({ owner: 'owner', repo: 'repo', ref: 'v2' });
  });

  it('reads ref and path out of a pasted /tree/ URL', () => {
    expect(parseRepoRef('https://github.com/owner/repo/tree/main/quizzes/pub')).toEqual({
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      path: 'quizzes/pub'
    });
  });

  it('reads a pasted /blob/ URL, which is what the address bar holds on a single file', () => {
    expect(parseRepoRef('https://github.com/owner/repo/blob/main/round.qwiz')).toEqual({
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      path: 'round.qwiz'
    });
  });

  it.each([
    ['', 'empty'],
    ['owner', 'no repo'],
    ['https://gitlab.com/owner/repo', 'wrong host'],
    ['owner/repo/extra', 'a path that is not tree/ or blob/'],
    ['own er/repo', 'a space in the owner'],
    ['owner/repo@../../etc', 'a traversing ref']
  ])('rejects %o (%s)', (input) => {
    expect(parseRepoRef(input)).toBeNull();
  });
});

describe('isSafeRef / isSafePath', () => {
  it('accepts ordinary refs including slashes', () => {
    expect(isSafeRef('main')).toBe(true);
    expect(isSafeRef('feature/new-quizzes')).toBe(true);
    expect(isSafeRef('v1.2.3')).toBe(true);
  });

  it('rejects traversal and anything that is not a ref name', () => {
    expect(isSafeRef('..')).toBe(false);
    expect(isSafeRef('main/../../etc')).toBe(false);
    expect(isSafeRef('main;rm')).toBe(false);
    expect(isSafeRef('')).toBe(false);
  });

  it('rejects absolute paths and traversal in a repo path', () => {
    expect(isSafePath('quizzes/round.qwiz')).toBe(true);
    expect(isSafePath('/etc/passwd')).toBe(false);
    expect(isSafePath('quizzes/../../secret')).toBe(false);
    expect(isSafePath('quizzes//round.qwiz')).toBe(false);
    expect(isSafePath('')).toBe(false);
  });
});

describe('path helpers', () => {
  it('recognises .qwiz files case-insensitively', () => {
    expect(isQwizPath('a/b/round.qwiz')).toBe(true);
    expect(isQwizPath('ROUND.QWIZ')).toBe(true);
    expect(isQwizPath('readme.md')).toBe(false);
  });

  it('gets the filename off a path', () => {
    expect(fileNameOf('a/b/c.qwiz')).toBe('c.qwiz');
    expect(fileNameOf('c.qwiz')).toBe('c.qwiz');
  });
});

describe('URL building', () => {
  it('defaults to HEAD, which git resolves to the default branch with no API call', () => {
    expect(rawFileUrl({ owner: 'o', repo: 'r' }, 'a/b.qwiz')).toBe(
      `https://raw.githubusercontent.com/o/r/${DEFAULT_REF}/a/b.qwiz`
    );
  });

  it('uses a pinned ref when one was given', () => {
    expect(rawFileUrl({ owner: 'o', repo: 'r', ref: 'v2' }, 'b.qwiz')).toBe(
      'https://raw.githubusercontent.com/o/r/v2/b.qwiz'
    );
  });

  it('encodes each path segment but not the separators', () => {
    expect(rawFileUrl({ owner: 'o', repo: 'r' }, 'general knowledge/round one.qwiz')).toBe(
      `https://raw.githubusercontent.com/o/r/${DEFAULT_REF}/general%20knowledge/round%20one.qwiz`
    );
  });

  it('builds the gist endpoint', () => {
    expect(gistApiUrl('abc123')).toBe('https://api.github.com/gists/abc123');
  });
});

describe('describeHttpFailure', () => {
  it('names the rate limit and points at the fix that avoids the API entirely', () => {
    const message = describeHttpFailure(403, headers({ 'x-ratelimit-remaining': '0' }), 'gist');
    expect(message).toContain('rate-limiting');
    expect(message).toContain('never does');
  });

  it('says when the limit resets, when GitHub said so', () => {
    const now = 1_700_000_000_000;
    const message = describeHttpFailure(
      403,
      headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 720) }),
      'gist',
      now
    );
    expect(message).toContain('resets in about 12 minutes');
  });

  it('omits the reset clause rather than guessing when the header is missing or stale', () => {
    const now = 1_700_000_000_000;
    expect(
      describeHttpFailure(403, headers({ 'x-ratelimit-remaining': '0' }), 'gist', now)
    ).not.toContain('resets in');
    // A reset already in the past would otherwise read as "resets in about -3 minutes".
    expect(
      describeHttpFailure(
        403,
        headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 - 180) }),
        'gist',
        now
      )
    ).not.toContain('resets in');
  });

  it('treats 429 as rate limiting even without the remaining header', () => {
    expect(describeHttpFailure(429, headers(), 'gist')).toContain('rate-limiting');
  });

  it('distinguishes a plain 403 from a rate limit', () => {
    const message = describeHttpFailure(403, headers({ 'x-ratelimit-remaining': '57' }), 'gist');
    expect(message).toContain('refused');
    expect(message).not.toContain('rate-limiting');
  });

  it('says something different for each thing a 404 can mean', () => {
    expect(describeHttpFailure(404, headers(), 'gist')).toContain('gist');
    expect(describeHttpFailure(404, headers(), 'file')).toContain('file');
  });

  it('falls back to the status code for anything unrecognised', () => {
    expect(describeHttpFailure(500, headers(), 'file')).toBe('GitHub returned an error (500).');
  });
});
