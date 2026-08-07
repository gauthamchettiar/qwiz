import { describe, expect, it } from 'vitest';
import { readQuizSourceRef, repoQuizUrl } from './remoteSource';

describe('readQuizSourceRef', () => {
  it('reads a share-link fragment, the original and still the only private form', () => {
    expect(readQuizSourceRef('', '#q=1.abc')).toEqual({
      ref: { kind: 'fragment', payload: '1.abc' }
    });
  });

  it('reads a gist id, with and without a named file', () => {
    expect(readQuizSourceRef('?gist=6011986', '')).toEqual({
      ref: { kind: 'gist', gistId: '6011986' }
    });
    expect(readQuizSourceRef('?gist=6011986&file=round.qwiz', '')).toEqual({
      ref: { kind: 'gist', gistId: '6011986', file: 'round.qwiz' }
    });
  });

  it('accepts a whole gist URL in the parameter', () => {
    expect(readQuizSourceRef('?gist=https%3A%2F%2Fgist.github.com%2Fu%2F6011986', '')).toEqual({
      ref: { kind: 'gist', gistId: '6011986' }
    });
  });

  it('reads a repo pointer with an explicit path', () => {
    expect(readQuizSourceRef('?repo=owner%2Frepo&path=rounds%2Fone.qwiz', '')).toEqual({
      ref: { kind: 'repo', repo: { owner: 'owner', repo: 'repo' }, path: 'rounds/one.qwiz' }
    });
  });

  it('takes the path from a pasted /blob/ URL when no path parameter was given', () => {
    const { ref } = readQuizSourceRef(
      '?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo%2Fblob%2Fmain%2Fround.qwiz',
      ''
    );
    expect(ref).toEqual({
      kind: 'repo',
      repo: { owner: 'owner', repo: 'repo', ref: 'main' },
      path: 'round.qwiz'
    });
  });

  it('lets an explicit ref win over one embedded in a pasted URL', () => {
    const { ref } = readQuizSourceRef(
      '?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo%2Ftree%2Fmain&path=a.qwiz&ref=v2',
      ''
    );
    expect(ref).toMatchObject({ repo: { ref: 'v2' } });
  });

  it('prefers a pointer over a fragment, so a link can carry both without ambiguity', () => {
    const { ref } = readQuizSourceRef('?gist=6011986', '#q=1.abc');
    expect(ref).toMatchObject({ kind: 'gist' });
  });

  it('reports an empty link differently from a malformed one', () => {
    // Nothing at all: almost always a link that got cut short in transit.
    expect(readQuizSourceRef('', '')).toEqual({});
    // Present but wrong: almost always a typo, and worth saying so.
    expect(readQuizSourceRef('?gist=nonsense', '').error).toMatch(/gist/i);
    expect(readQuizSourceRef('?repo=nonsense', '').error).toMatch(/repository/i);
  });

  it('rejects a repo pointer with no file to play', () => {
    expect(readQuizSourceRef('?repo=owner%2Frepo', '').error).toMatch(/not at a quiz file/i);
  });

  it('refuses a path that is not a .qwiz file, or that tries to climb out', () => {
    expect(readQuizSourceRef('?repo=owner%2Frepo&path=README.md', '').error).toBeDefined();
    expect(
      readQuizSourceRef('?repo=owner%2Frepo&path=..%2F..%2Fsecret.qwiz', '').error
    ).toBeDefined();
  });
});

describe('link building', () => {
  it('omits the ref so a link keeps working when a default branch is renamed', () => {
    expect(repoQuizUrl({ owner: 'o', repo: 'r' }, 'a.qwiz')).toBe('/play?repo=o%2Fr&path=a.qwiz');
  });

  it('keeps a ref that was deliberately pinned', () => {
    expect(repoQuizUrl({ owner: 'o', repo: 'r', ref: 'v2' }, 'a.qwiz')).toContain('ref=v2');
  });

  it('round-trips through readQuizSourceRef', () => {
    const url = repoQuizUrl({ owner: 'o', repo: 'r' }, 'rounds/one.qwiz');
    const { ref } = readQuizSourceRef(url.slice(url.indexOf('?')), '');
    expect(ref).toEqual({
      kind: 'repo',
      repo: { owner: 'o', repo: 'r' },
      path: 'rounds/one.qwiz'
    });
  });
});
