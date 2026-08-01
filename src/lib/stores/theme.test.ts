// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, isKnownTheme, readTheme, saveTheme, SYSTEM_THEME, THEMES } from './theme';

const STORAGE_KEY = 'qwiz:theme';

/** jsdom has no real `matchMedia`, and `applyTheme` asks it whether the OS prefers dark. */
function stubPrefersDark(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: prefersDark && query.includes('dark') }) as MediaQueryList
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
});

describe('isKnownTheme', () => {
  it('accepts every shipped theme and the system option', () => {
    expect(isKnownTheme(SYSTEM_THEME)).toBe(true);
    for (const theme of THEMES) expect(isKnownTheme(theme.id)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isKnownTheme('not-a-theme-we-ship')).toBe(false);
    expect(isKnownTheme('')).toBe(false);
  });
});

describe('readTheme', () => {
  it('defaults to following the system when nothing is stored', () => {
    expect(readTheme()).toBe(SYSTEM_THEME);
  });

  it('returns a stored theme', () => {
    localStorage.setItem(STORAGE_KEY, 'solarized-dark');
    expect(readTheme()).toBe('solarized-dark');
  });

  it('falls back to system for a theme that is no longer shipped', () => {
    // The same "drop anything that doesn't match" rule quizzes.ts applies to its own records —
    // a theme removed in a later release must not leave a visitor stuck on an unstyled page.
    localStorage.setItem(STORAGE_KEY, 'a-theme-we-dropped');
    expect(readTheme()).toBe(SYSTEM_THEME);
  });
});

describe('saveTheme', () => {
  it('persists and reports success', () => {
    expect(saveTheme('vscode-dark')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('vscode-dark');
  });

  it('reports failure instead of throwing when storage is unavailable', () => {
    // Safari's private mode throws on every write. Losing a theme preference is survivable, so
    // this reports rather than surfacing an error — but it must not take the page down.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(saveTheme('dark')).toBe(false);
    setItem.mockRestore();
  });
});

describe('applyTheme', () => {
  it('writes a concrete theme straight onto the document', () => {
    stubPrefersDark(false);
    applyTheme('solarized-light');
    expect(document.documentElement.dataset.theme).toBe('solarized-light');
  });

  it('resolves `system` through the OS preference, both ways', () => {
    stubPrefersDark(true);
    applyTheme(SYSTEM_THEME);
    expect(document.documentElement.dataset.theme).toBe('dark');

    stubPrefersDark(false);
    applyTheme(SYSTEM_THEME);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('THEMES', () => {
  it('has a unique id per theme, since the id IS the data-theme selector', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ships both a light and a dark option, so `system` can resolve either way', () => {
    expect(THEMES.some((t) => t.id === 'light' && t.mode === 'light')).toBe(true);
    expect(THEMES.some((t) => t.id === 'dark' && t.mode === 'dark')).toBe(true);
  });
});
