// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSavedGroup,
  findSavedGroupByKey,
  getSavedGroup,
  listSavedGroups,
  saveGroup,
  type NewSavedGroup
} from './savedGroups';

const KEY = 'qwiz:saved-groups';

function group(overrides: Partial<NewSavedGroup> = {}): NewSavedGroup {
  return {
    key: 'owner/repo',
    title: 'The Qwiz Trail',
    description: 'Clear one to unlock the next.',
    mode: 'journey',
    owner: 'owner',
    repo: 'repo',
    path: '',
    ref: '',
    manifest: '---\ntitle: The Qwiz Trail\n:mode=journey\n---\n\nquiz: a.qwiz\nid: a',
    files: [{ path: 'a.qwiz', content: '---\ntitle: A\n---\n\nQ?\n{\n=A\n~B\n}' }],
    ...overrides
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('origin', () => {
  it('defaults a record written before the field existed, rather than dropping it', () => {
    // `readAll` discards anything failing safeParse, so a REQUIRED `origin` would have silently
    // deleted every group already saved in someone's browser. Everything stored up to now came
    // from a repository, which is exactly what the default says.
    const legacy = {
      ...group(),
      id: 'old-1',
      savedAt: '2025-01-01T00:00:00.000Z'
    };
    localStorage.setItem(KEY, JSON.stringify({ 'old-1': legacy }));

    const read = getSavedGroup('old-1');
    expect(read).not.toBeNull();
    expect(read!.origin).toBe('remote');
  });

  it('defaults on write too, so only the group builder has to say "local"', () => {
    expect(saveGroup(group()).saved!.origin).toBe('remote');
    expect(saveGroup(group({ key: 'local:1', origin: 'local' })).saved!.origin).toBe('local');
  });

  it('keeps a local group and a repo group apart in the same list', () => {
    saveGroup(group({ key: 'owner/repo' }));
    saveGroup(group({ key: 'local:1', origin: 'local', owner: '', repo: '', title: 'Mine' }));

    const byOrigin = Object.fromEntries(listSavedGroups().map((g) => [g.title, g.origin]));
    expect(byOrigin).toEqual({ 'The Qwiz Trail': 'remote', Mine: 'local' });
  });
});

describe('saveGroup', () => {
  it('stores the manifest and every file, so the group opens with no network', () => {
    const { saved } = saveGroup(group());
    expect(saved).toBeDefined();

    const read = getSavedGroup(saved!.id)!;
    expect(read.manifest).toContain(':mode=journey');
    expect(read.files).toEqual([
      { path: 'a.qwiz', content: '---\ntitle: A\n---\n\nQ?\n{\n=A\n~B\n}' }
    ]);
  });

  it('re-saving the same group replaces it and keeps its id', () => {
    // Otherwise a refresh would leave two copies in the list, and any link to the first would
    // point at a stale one.
    const first = saveGroup(group()).saved!;
    const second = saveGroup(group({ title: 'Renamed' })).saved!;

    expect(second.id).toBe(first.id);
    expect(listSavedGroups()).toHaveLength(1);
    expect(getSavedGroup(first.id)!.title).toBe('Renamed');
  });

  it('keeps groups from different repositories apart', () => {
    saveGroup(group());
    saveGroup(group({ key: 'other/repo', owner: 'other', title: 'Other' }));
    expect(listSavedGroups()).toHaveLength(2);
  });

  it('treats a subfolder of the same repo as its own group', () => {
    saveGroup(group());
    saveGroup(group({ key: 'owner/repo:rounds', path: 'rounds', title: 'Rounds' }));
    expect(listSavedGroups()).toHaveLength(2);
  });

  it('reports a failed write instead of claiming success', () => {
    // The live risk here, unlike a theme preference: a group of image-heavy quizzes really can
    // exceed the quota.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const result = saveGroup(group());
    expect(result.saved).toBeUndefined();
    expect(result.error).toMatch(/too large|unavailable/);
  });
});

describe('listSavedGroups', () => {
  it('is empty to begin with', () => {
    expect(listSavedGroups()).toEqual([]);
  });

  it('puts the most recently saved first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveGroup(group({ key: 'a/a', title: 'Older' }));
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    saveGroup(group({ key: 'b/b', title: 'Newer' }));
    vi.useRealTimers();

    expect(listSavedGroups().map((entry) => entry.title)).toEqual(['Newer', 'Older']);
  });

  it('drops a record that no longer matches the schema rather than handing it on', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    saveGroup(group());
    const all = JSON.parse(localStorage.getItem(KEY)!);
    const id = Object.keys(all)[0];
    delete all[id].files;
    localStorage.setItem(KEY, JSON.stringify(all));

    expect(listSavedGroups()).toEqual([]);
  });

  it('survives outright garbage in storage', () => {
    localStorage.setItem(KEY, 'not json');
    expect(listSavedGroups()).toEqual([]);
  });
});

describe('findSavedGroupByKey', () => {
  it('finds the copy of a remote group, so the screen can say it is already saved', () => {
    const saved = saveGroup(group()).saved!;
    expect(findSavedGroupByKey('owner/repo')?.id).toBe(saved.id);
  });

  it('is null for a group never saved', () => {
    expect(findSavedGroupByKey('never/saved')).toBeNull();
  });
});

describe('deleteSavedGroup', () => {
  it('removes one and leaves the rest', () => {
    const first = saveGroup(group()).saved!;
    saveGroup(group({ key: 'other/repo', owner: 'other' }));

    expect(deleteSavedGroup(first.id)).toBe(true);
    expect(getSavedGroup(first.id)).toBeNull();
    expect(listSavedGroups()).toHaveLength(1);
  });

  it('is false for something that was never there', () => {
    expect(deleteSavedGroup('nope')).toBe(false);
  });

  it('reports a failed write', () => {
    const saved = saveGroup(group()).saved!;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('nope');
    });
    expect(deleteSavedGroup(saved.id)).toBe(false);
  });
});
