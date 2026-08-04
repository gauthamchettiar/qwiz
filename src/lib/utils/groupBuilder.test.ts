import { describe, expect, it } from 'vitest';
import {
  buildGroupFiles,
  buildQuizGroup,
  emptyGroupDraft,
  groupFilePaths,
  groupZipName,
  modeSummary,
  modeUsesFolders,
  type GroupDraft
} from './groupBuilder';
import { GROUP_MODES, groupMode, parseQwizGroup } from './quizGroup';
import { parseQwizFile } from './quizScript';
import type { Quiz } from '@/lib/schemas/quiz';

function quiz(id: string, title: string): Quiz {
  const now = '2025-01-01T00:00:00.000Z';
  return {
    id,
    title,
    description: `About ${title}`,
    category: 'general knowledge',
    tags: ['sample'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      { id: `${id}-q1`, code: ['pick_one: Which one?', '{', '=Right', '~Wrong', '}'].join('\n') }
    ]
  };
}

const LIBRARY = new Map<string, Quiz>([
  ['a', quiz('a', 'World Capitals')],
  ['b', quiz('b', 'Spelling Bee')],
  ['c', quiz('c', 'Grand Finale')]
]);

function draft(overrides: Partial<GroupDraft> = {}): GroupDraft {
  return {
    ...emptyGroupDraft(),
    title: 'The Qwiz Trail',
    description: 'A set of quizzes.',
    entries: [
      { quizId: 'a', folder: '', title: '' },
      { quizId: 'b', folder: '', title: '' }
    ],
    ...overrides
  };
}

describe('groupFilePaths', () => {
  it('derives a filename from each quiz title', () => {
    const paths = groupFilePaths(draft().entries, LIBRARY);
    expect(paths.get('a')).toBe('world-capitals.qwiz');
    expect(paths.get('b')).toBe('spelling-bee.qwiz');
  });

  it('puts a file in its folder', () => {
    const paths = groupFilePaths([{ quizId: 'a', folder: 'history', title: '' }], LIBRARY);
    expect(paths.get('a')).toBe('history/world-capitals.qwiz');
  });

  it('tolerates stray slashes around a folder', () => {
    const paths = groupFilePaths([{ quizId: 'a', folder: '/history/', title: '' }], LIBRARY);
    expect(paths.get('a')).toBe('history/world-capitals.qwiz');
  });

  it('deduplicates across the WHOLE group, not per folder', () => {
    // Two quizzes with the same title in different folders would otherwise share a filename slug,
    // and therefore a manifest id — which the parser rejects as a duplicate.
    const library = new Map<string, Quiz>([
      ['x', quiz('x', 'Round One')],
      ['y', quiz('y', 'Round One')]
    ]);
    const paths = groupFilePaths(
      [
        { quizId: 'x', folder: 'history', title: '' },
        { quizId: 'y', folder: 'science', title: '' }
      ],
      library
    );
    expect(paths.get('x')).toBe('history/round-one.qwiz');
    expect(paths.get('y')).toBe('science/round-one-2.qwiz');
  });

  it('skips an entry whose quiz is no longer in the library', () => {
    const paths = groupFilePaths([{ quizId: 'gone', folder: '', title: '' }], LIBRARY);
    expect(paths.size).toBe(0);
  });
});

describe('buildQuizGroup — mode-scoped settings', () => {
  it('writes only the settings its mode accepts', () => {
    const journey = buildQuizGroup(
      draft({ mode: 'journey', requireWin: true, rounds: 9 }),
      LIBRARY
    );
    expect(journey.settings).toEqual({ mode: 'journey', require_win: true });

    const gauntlet = buildQuizGroup(
      draft({ mode: 'gauntlet', questionsPerPick: 2, rounds: 4 }),
      LIBRARY
    );
    expect(gauntlet.settings).toEqual({
      mode: 'gauntlet',
      questions_per_pick: 2,
      rounds: 4
    });
  });

  it('omits a false boolean rather than writing its default', () => {
    expect(buildQuizGroup(draft({ mode: 'journey', requireWin: false }), LIBRARY).settings).toEqual(
      {
        mode: 'journey'
      }
    );
  });

  it('treats questions_per_run of 0 as unset', () => {
    expect(buildQuizGroup(draft({ mode: 'merge', questionsPerRun: 0 }), LIBRARY).settings).toEqual({
      mode: 'merge'
    });
    expect(
      buildQuizGroup(draft({ mode: 'merge', questionsPerRun: 5 }), LIBRARY).settings
    ).toMatchObject({ questions_per_run: 5 });
  });

  it('chains a journey in the order the entries were listed', () => {
    const group = buildQuizGroup(draft({ mode: 'journey' }), LIBRARY);
    expect(group.entries[0].requires).toEqual([]);
    expect(group.entries[1].requires).toEqual([group.entries[0].id]);
  });

  it('never writes requires: outside a journey, where it is a parse error', () => {
    for (const mode of ['folders', 'merge', 'gauntlet'] as const) {
      const group = buildQuizGroup(draft({ mode }), LIBRARY);
      expect(
        group.entries.every((e) => e.requires.length === 0),
        mode
      ).toBe(true);
    }
  });

  it('writes group: only in folders mode, where the key is legal', () => {
    const folders = buildQuizGroup(
      draft({ mode: 'folders', entries: [{ quizId: 'a', folder: 'Week 1', title: '' }] }),
      LIBRARY
    );
    expect(folders.entries[0].group).toBe('Week 1');

    const gauntlet = buildQuizGroup(
      draft({
        mode: 'gauntlet',
        entries: [
          { quizId: 'a', folder: 'history', title: '' },
          { quizId: 'b', folder: 'science', title: '' }
        ]
      }),
      LIBRARY
    );
    expect(gauntlet.entries[0].group).toBeUndefined();
  });

  it('includes a title override only when one was given', () => {
    const group = buildQuizGroup(
      draft({
        entries: [
          { quizId: 'a', folder: '', title: '  Opening Round  ' },
          { quizId: 'b', folder: '', title: '   ' }
        ]
      }),
      LIBRARY
    );
    expect(group.entries[0].title).toBe('Opening Round');
    expect(group.entries[1].title).toBeUndefined();
  });
});

describe('buildGroupFiles — the output is validated by being parsed back', () => {
  it('produces a manifest and one file per quiz', () => {
    const built = buildGroupFiles(draft(), LIBRARY);
    expect(built.errors).toEqual([]);
    expect(built.files.map((f) => f.name)).toEqual([
      '.qwizgroup',
      'world-capitals.qwiz',
      'spelling-bee.qwiz'
    ]);
  });

  it('emits a manifest the real parser accepts, for every mode', () => {
    const byMode = {
      folders: draft({ mode: 'folders' }),
      journey: draft({ mode: 'journey' }),
      merge: draft({ mode: 'merge', questionsPerRun: 5 }),
      gauntlet: draft({
        mode: 'gauntlet',
        entries: [
          { quizId: 'a', folder: 'history', title: '' },
          { quizId: 'b', folder: 'science', title: '' }
        ]
      })
    };

    for (const [mode, value] of Object.entries(byMode)) {
      const built = buildGroupFiles(value, LIBRARY);
      expect(built.errors, mode).toEqual([]);

      const parsed = parseQwizGroup(built.manifest);
      expect(parsed.errors, mode).toEqual([]);
      expect(groupMode(parsed.group), mode).toBe(mode);
      expect(parsed.group.entries.length, mode).toBe(2);
    }
  });

  it('emits quiz files that themselves parse', () => {
    const built = buildGroupFiles(draft(), LIBRARY);
    for (const file of built.files.filter((f) => f.name.endsWith('.qwiz'))) {
      expect(parseQwizFile(file.content).errors, file.name).toEqual([]);
    }
  });

  it('lines the manifest paths up with the files actually in the archive', () => {
    const built = buildGroupFiles(
      draft({
        mode: 'gauntlet',
        entries: [
          { quizId: 'a', folder: 'history', title: '' },
          { quizId: 'b', folder: 'science', title: '' }
        ]
      }),
      LIBRARY
    );
    const { group } = parseQwizGroup(built.manifest);
    const names = new Set(built.files.map((f) => f.name));
    for (const entry of group.entries) expect(names).toContain(entry.path);
  });

  it('refuses an empty group, and one with no title', () => {
    expect(buildGroupFiles(draft({ entries: [] }), LIBRARY).errors.join()).toMatch(
      /at least one quiz/
    );
    expect(buildGroupFiles(draft({ title: '  ' }), LIBRARY).errors.join()).toMatch(/a title/);
  });

  it('refuses a gauntlet whose quizzes are not in categories', () => {
    const built = buildGroupFiles(draft({ mode: 'gauntlet' }), LIBRARY);
    expect(built.errors.join()).toMatch(/category folder/);
    expect(built.files).toEqual([]);
  });

  it('refuses a gauntlet with only one category to choose between', () => {
    const built = buildGroupFiles(
      draft({
        mode: 'gauntlet',
        entries: [
          { quizId: 'a', folder: 'history', title: '' },
          { quizId: 'b', folder: 'history', title: '' }
        ]
      }),
      LIBRARY
    );
    expect(built.errors.join()).toMatch(/at least two categories/);
  });

  it('produces no files at all when anything is wrong', () => {
    expect(buildGroupFiles(draft({ title: '' }), LIBRARY).files).toEqual([]);
  });

  it('survives two quizzes sharing a title, which would otherwise collide on id', () => {
    const library = new Map<string, Quiz>([
      ['x', quiz('x', 'Round One')],
      ['y', quiz('y', 'Round One')]
    ]);
    const built = buildGroupFiles(
      draft({
        entries: [
          { quizId: 'x', folder: '', title: '' },
          { quizId: 'y', folder: '', title: '' }
        ]
      }),
      library
    );
    expect(built.errors).toEqual([]);
    expect(parseQwizGroup(built.manifest).errors).toEqual([]);
  });
});

describe('helpers', () => {
  it('names the archive after the group', () => {
    expect(groupZipName(draft())).toBe('the-qwiz-trail.zip');
    expect(groupZipName(draft({ title: '' }))).toBe('quiz-group.zip');
  });

  it('describes every mode, so the picker never shows a blank explanation', () => {
    for (const mode of GROUP_MODES) {
      expect(modeSummary(mode), mode).not.toBe('');
    }
    // Each one says something different — a shared summary would be worse than none.
    expect(new Set(GROUP_MODES.map(modeSummary)).size).toBe(GROUP_MODES.length);
  });

  it('knows which modes actually use folders', () => {
    expect(modeUsesFolders('folders')).toBe(true);
    expect(modeUsesFolders('gauntlet')).toBe(true);
    for (const mode of ['journey', 'merge'] as const) {
      expect(modeUsesFolders(mode), mode).toBe(false);
    }
  });
});
