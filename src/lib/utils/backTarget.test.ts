import { describe, expect, it } from 'vitest';
import { backTarget, canGoBack } from './backTarget';

describe('backTarget — group screens', () => {
  it('climbs one folder', () => {
    expect(backTarget('/group', '?repo=o%2Fr&path=examples/groups/journey')).toBe(
      '/group?repo=o%2Fr&path=examples%2Fgroups'
    );
  });

  it('reaches the repository root from one folder down', () => {
    expect(backTarget('/group', '?repo=o%2Fr&path=examples')).toBe('/group?repo=o%2Fr');
  });

  it('leaves the repository root to history, since there is nothing above it in the app', () => {
    expect(backTarget('/group', '?repo=o%2Fr')).toBeNull();
  });

  it('keeps a pinned ref while climbing', () => {
    expect(backTarget('/group', '?repo=o%2Fr&path=a%2Fb&ref=v2')).toContain('ref=v2');
  });
});

describe('backTarget — playing', () => {
  it('returns from a whole-group run to that group, not to the folder above it', () => {
    // You came from the group's own screen, and its Play button is what you'd want again.
    expect(backTarget('/group/play', '?repo=o%2Fr&path=rounds')).toBe(
      '/group?repo=o%2Fr&path=rounds'
    );
  });

  it('ignores the run toggles when going back', () => {
    expect(backTarget('/group/play', '?repo=o%2Fr&merge=1&shuffle=1')).toBe('/group?repo=o%2Fr');
  });

  it('returns from a repo quiz to the folder that listed it', () => {
    expect(backTarget('/play', '?repo=o%2Fr&path=rounds%2Fone.qwiz')).toBe(
      '/group?repo=o%2Fr&path=rounds'
    );
  });

  it('returns from a root-level repo quiz to the repository root', () => {
    expect(backTarget('/play', '?repo=o%2Fr&path=one.qwiz')).toBe('/group?repo=o%2Fr');
  });

  it('has nowhere better than history for a gist or a shared link', () => {
    expect(backTarget('/play', '?gist=abc123')).toBeNull();
    expect(backTarget('/play', '')).toBeNull();
  });
});

describe('backTarget — everything else', () => {
  it('sends a saved group back to the library it belongs to', () => {
    expect(backTarget('/group', '?saved=abc')).toBe('/');
  });

  it('leaves a local quiz to history', () => {
    expect(backTarget('/local/play', '?id=abc')).toBeNull();
  });

  it('leaves an unparseable repo pointer to history rather than guessing', () => {
    expect(backTarget('/group', '?repo=not%20a%20repo&path=a')).toBeNull();
  });
});

describe('canGoBack', () => {
  it('is true only for a referrer inside this app', () => {
    expect(canGoBack('https://qwiz.test/group?repo=o%2Fr', 'https://qwiz.test')).toBe(true);
    expect(canGoBack('https://elsewhere.test/', 'https://qwiz.test')).toBe(false);
  });

  it('is false with no referrer at all — a pasted link or a new tab', () => {
    // Going back there would take the visitor off the site, which a Back link inside an app
    // should never do.
    expect(canGoBack('', 'https://qwiz.test')).toBe(false);
  });

  it('is false for a referrer that is not a URL', () => {
    expect(canGoBack('nonsense', 'https://qwiz.test')).toBe(false);
  });
});
