// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evictOldest,
  readJourneyProgress,
  recordJourneyPlay,
  resetJourneyProgress
} from './groupProgress';

const KEY = 'qwiz:group-progress';
const GROUP = 'owner/repo';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('recordJourneyPlay', () => {
  it('records a finished run and reads it back', () => {
    expect(recordJourneyPlay(GROUP, 'capitals', true)).toBe(true);
    expect(readJourneyProgress(GROUP)).toEqual({ capitals: { completed: true, won: true } });
  });

  it('keeps a win sticky, so a worse replay cannot re-lock what it opened', () => {
    recordJourneyPlay(GROUP, 'capitals', true);
    recordJourneyPlay(GROUP, 'capitals', false);
    expect(readJourneyProgress(GROUP).capitals).toEqual({ completed: true, won: true });
  });

  it('lets a later run upgrade a completion into a win', () => {
    recordJourneyPlay(GROUP, 'capitals', false);
    expect(readJourneyProgress(GROUP).capitals).toEqual({ completed: true, won: false });
    recordJourneyPlay(GROUP, 'capitals', true);
    expect(readJourneyProgress(GROUP).capitals).toEqual({ completed: true, won: true });
  });

  it('keeps groups apart, so playing one never touches another', () => {
    recordJourneyPlay(GROUP, 'a', true);
    recordJourneyPlay('other/repo', 'a', false);
    expect(readJourneyProgress(GROUP).a.won).toBe(true);
    expect(readJourneyProgress('other/repo').a.won).toBe(false);
  });

  it('reports a failed write rather than claiming success', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(recordJourneyPlay(GROUP, 'capitals', true)).toBe(false);
  });
});

describe('readJourneyProgress', () => {
  it('is empty for a group never played', () => {
    expect(readJourneyProgress('never/played')).toEqual({});
  });

  it('drops a stored value that does not match the schema instead of handing it on', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(KEY, JSON.stringify({ [GROUP]: { plays: 'not an object' } }));
    expect(readJourneyProgress(GROUP)).toEqual({});
  });

  it('survives outright garbage in storage', () => {
    localStorage.setItem(KEY, 'not json at all');
    expect(readJourneyProgress(GROUP)).toEqual({});
  });
});

describe('resetJourneyProgress', () => {
  it('clears one group and leaves the rest alone', () => {
    recordJourneyPlay(GROUP, 'a', true);
    recordJourneyPlay('other/repo', 'a', true);

    expect(resetJourneyProgress(GROUP)).toBe(true);
    expect(readJourneyProgress(GROUP)).toEqual({});
    expect(readJourneyProgress('other/repo').a.won).toBe(true);
  });

  it('is a no-op for a group with nothing stored', () => {
    expect(resetJourneyProgress('never/played')).toBe(true);
  });
});

describe('evictOldest', () => {
  function group(updatedAt: string) {
    return { plays: {}, updatedAt };
  }

  it('keeps everything under the limit', () => {
    const all = { a: group('2026-01-01'), b: group('2026-01-02') };
    expect(evictOldest(all, 5)).toBe(all);
  });

  it('keeps the most recently updated when over', () => {
    const all = {
      old: group('2026-01-01T00:00:00Z'),
      newer: group('2026-06-01T00:00:00Z'),
      newest: group('2026-08-01T00:00:00Z')
    };
    expect(Object.keys(evictOldest(all, 2)).sort()).toEqual(['newer', 'newest']);
  });
});
