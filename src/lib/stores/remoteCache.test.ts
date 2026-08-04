// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCachedIndex,
  evictOldest,
  isFresh,
  readCachedIndex,
  writeCachedIndex,
  type CachedGroupIndex
} from './remoteCache';

const KEY = 'qwiz:remote-cache';

const GROUP = {
  title: 'The Trail',
  description: '',
  category: '',
  tags: [],
  settings: { mode: 'journey' },
  entries: [{ id: 'a', path: 'a.qwiz', requires: [], settings: {} }]
};

function index(overrides: Partial<Omit<CachedGroupIndex, 'fetchedAt'>> = {}) {
  return { group: GROUP, subGroups: [], fromManifest: true, warnings: [], ...overrides };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('writeCachedIndex / readCachedIndex', () => {
  it('round-trips the resolved group, so a repaint needs no re-parse', () => {
    expect(writeCachedIndex('owner/repo', index())).toBe(true);
    const read = readCachedIndex('owner/repo')!;
    expect(read.group).toEqual(GROUP);
    expect(read.fromManifest).toBe(true);
  });

  it('is null for a repository never fetched', () => {
    expect(readCachedIndex('never/fetched')).toBeNull();
  });

  it('keeps repositories apart', () => {
    writeCachedIndex('a/a', index({ subGroups: ['x'] }));
    writeCachedIndex('b/b', index({ subGroups: ['y'] }));
    expect(readCachedIndex('a/a')!.subGroups).toEqual(['x']);
    expect(readCachedIndex('b/b')!.subGroups).toEqual(['y']);
  });

  it('drops everything on a shape change rather than half-reading it', () => {
    // Right for a cache specifically: there's nothing to lose, and the next fetch refills it.
    localStorage.setItem(KEY, JSON.stringify({ 'a/a': { nonsense: true } }));
    expect(readCachedIndex('a/a')).toBeNull();
  });

  it('survives garbage in storage', () => {
    localStorage.setItem(KEY, 'not json');
    expect(readCachedIndex('a/a')).toBeNull();
  });

  it('stays quiet when it cannot be written — a cache that fails is survivable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    // Unlike a quiz or a saved group, nothing is lost, so this reports rather than throwing.
    expect(writeCachedIndex('a/a', index())).toBe(false);
  });
});

describe('isFresh', () => {
  const now = Date.parse('2026-08-04T12:00:00Z');

  it('is true just inside the window and false just outside it', () => {
    const at = (iso: string) => ({ ...index(), fetchedAt: iso }) as CachedGroupIndex;
    expect(isFresh(at('2026-08-04T11:51:00Z'), now)).toBe(true); // 9 minutes
    expect(isFresh(at('2026-08-04T11:49:00Z'), now)).toBe(false); // 11 minutes
  });

  it('rejects a timestamp from the future, which means a clock changed under us', () => {
    const future = { ...index(), fetchedAt: '2026-08-04T13:00:00Z' } as CachedGroupIndex;
    expect(isFresh(future, now)).toBe(false);
  });

  it('rejects an unparseable timestamp rather than treating it as ancient or current', () => {
    const bad = { ...index(), fetchedAt: 'whenever' } as CachedGroupIndex;
    expect(isFresh(bad, now)).toBe(false);
  });
});

describe('clearCachedIndex', () => {
  it('drops one repository, which is what a Refresh control needs', () => {
    writeCachedIndex('a/a', index());
    writeCachedIndex('b/b', index());
    clearCachedIndex('a/a');
    expect(readCachedIndex('a/a')).toBeNull();
    expect(readCachedIndex('b/b')).not.toBeNull();
  });

  it('is a no-op for something not cached', () => {
    expect(() => clearCachedIndex('never/cached')).not.toThrow();
  });
});

describe('evictOldest', () => {
  function entry(fetchedAt: string) {
    return { ...index(), fetchedAt } as CachedGroupIndex;
  }

  it('keeps everything under the limit', () => {
    const all = { a: entry('2026-01-01'), b: entry('2026-01-02') };
    expect(evictOldest(all, 5)).toBe(all);
  });

  it('keeps the most recently fetched when over', () => {
    const all = {
      old: entry('2026-01-01T00:00:00Z'),
      newer: entry('2026-06-01T00:00:00Z'),
      newest: entry('2026-08-01T00:00:00Z')
    };
    expect(Object.keys(evictOldest(all, 2)).sort()).toEqual(['newer', 'newest']);
  });
});
