import { describe, expect, it } from 'vitest';
import {
  buildGroupFiles,
  buildQuizGroup,
  draftFromQuizGroup,
  emptyGroupDraft,
  groupFilePaths,
  groupZipName,
  modeSummary,
  modeUsesFolders,
  type GroupDraft,
  type GroupEntryDraft
} from './groupBuilder';
import { GROUP_MODES, groupMode, parseQwizGroup, type QuizGroupMode } from './quizGroup';
import { parseQwizFile, type QuizScriptSettings } from './quizScript';
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

function entry(overrides: Partial<GroupEntryDraft> = {}): GroupEntryDraft {
  return { quizId: 'a', folder: '', title: '', requires: [], settings: {}, ...overrides };
}

function draft(overrides: Partial<GroupDraft> = {}): GroupDraft {
  return {
    ...emptyGroupDraft(),
    title: 'The Qwiz Trail',
    description: 'A set of quizzes.',
    entries: [entry({ quizId: 'a' }), entry({ quizId: 'b' })],
    ...overrides
  };
}

/** A draft in `mode`, since the mode is now one key in a settings bag rather than a field. */
function inMode(mode: QuizGroupMode, overrides: Partial<GroupDraft> = {}): GroupDraft {
  const settings: QuizScriptSettings = { mode, ...(overrides.settings ?? {}) };
  return draft({ ...overrides, settings });
}

describe('groupFilePaths', () => {
  it('derives a filename from each quiz title', () => {
    const paths = groupFilePaths(draft().entries, LIBRARY);
    expect(paths.get(0)).toBe('world-capitals.qwiz');
    expect(paths.get(1)).toBe('spelling-bee.qwiz');
  });

  it('puts a file in its folder', () => {
    const paths = groupFilePaths([entry({ folder: 'history' })], LIBRARY);
    expect(paths.get(0)).toBe('history/world-capitals.qwiz');
  });

  it('tolerates stray slashes around a folder', () => {
    const paths = groupFilePaths([entry({ folder: '/history/' })], LIBRARY);
    expect(paths.get(0)).toBe('history/world-capitals.qwiz');
  });

  it('deduplicates across the WHOLE group, not per folder', () => {
    // Two quizzes with the same title in different folders would otherwise share a filename slug,
    // and therefore a manifest id — which the parser rejects as a duplicate.
    const library = new Map<string, Quiz>([
      ['x', quiz('x', 'Round One')],
      ['y', quiz('y', 'Round One')]
    ]);
    const paths = groupFilePaths(
      [entry({ quizId: 'x', folder: 'history' }), entry({ quizId: 'y', folder: 'science' })],
      library
    );
    expect(paths.get(0)).toBe('history/round-one.qwiz');
    expect(paths.get(1)).toBe('science/round-one-2.qwiz');
  });

  it('gives two entries pointing at the SAME quiz two distinct files', () => {
    // Keyed by position rather than quizId: the per-card quiz picker can name one quiz twice, and
    // collapsing both onto one path would publish a single file for two visible entries.
    const paths = groupFilePaths(
      [entry({ quizId: 'a', folder: 'warmup' }), entry({ quizId: 'a', folder: 'finale' })],
      LIBRARY
    );
    expect(paths.get(0)).toBe('warmup/world-capitals.qwiz');
    expect(paths.get(1)).toBe('finale/world-capitals-2.qwiz');
  });

  it('skips an entry whose quiz is no longer in the library', () => {
    expect(groupFilePaths([entry({ quizId: 'gone' })], LIBRARY).size).toBe(0);
  });

  it('skips an entry with no quiz chosen yet, without shifting the others', () => {
    const paths = groupFilePaths([entry({ quizId: '' }), entry({ quizId: 'b' })], LIBRARY);
    expect(paths.get(0)).toBeUndefined();
    expect(paths.get(1)).toBe('spelling-bee.qwiz');
  });
});

describe('buildQuizGroup', () => {
  it('passes every setting through, mode-relevant or not', () => {
    // `settingsFor` used to drop keys the mode didn't accept, which silently published a manifest
    // missing what the author had set. The round-trip check reports the mismatch instead.
    const group = buildQuizGroup(inMode('journey', { settings: { require_win: true } }), LIBRARY);
    expect(group.settings).toEqual({ mode: 'journey', require_win: true });

    const stray = buildQuizGroup(inMode('folders', { settings: { rounds: 9 } }), LIBRARY);
    expect(stray.settings).toEqual({ mode: 'folders', rounds: 9 });
  });

  it('chains a journey in the order the entries were listed', () => {
    const group = buildQuizGroup(inMode('journey'), LIBRARY);
    expect(group.entries[0].requires).toEqual([]);
    expect(group.entries[1].requires).toEqual([group.entries[0].id]);
  });

  it('leaves a hand-authored journey DAG alone rather than flattening it into a chain', () => {
    const group = buildQuizGroup(
      inMode('journey', {
        entries: [
          entry({ quizId: 'a' }),
          entry({ quizId: 'b' }),
          entry({ quizId: 'c', requires: ['world-capitals', 'spelling-bee'] })
        ]
      }),
      LIBRARY
    );
    expect(group.entries[2].requires).toEqual(['world-capitals', 'spelling-bee']);
    // The inference is all-or-nothing, so the untouched entries stay untouched too.
    expect(group.entries[1].requires).toEqual([]);
  });

  it('never writes requires: outside a journey, where it is a parse error', () => {
    for (const mode of ['folders', 'merge', 'gauntlet'] as const) {
      const group = buildQuizGroup(inMode(mode), LIBRARY);
      expect(
        group.entries.every((e) => e.requires.length === 0),
        mode
      ).toBe(true);
    }
  });

  it('writes group: only in folders mode, where the key is legal', () => {
    const folders = buildQuizGroup(
      inMode('folders', { entries: [entry({ quizId: 'a', folder: 'Week 1' })] }),
      LIBRARY
    );
    expect(folders.entries[0].group).toBe('Week 1');

    const gauntlet = buildQuizGroup(
      inMode('gauntlet', {
        entries: [
          entry({ quizId: 'a', folder: 'history' }),
          entry({ quizId: 'b', folder: 'science' })
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
          entry({ quizId: 'a', title: '  Opening Round  ' }),
          entry({ quizId: 'b', title: '   ' })
        ]
      }),
      LIBRARY
    );
    expect(group.entries[0].title).toBe('Opening Round');
    expect(group.entries[1].title).toBeUndefined();
  });

  it('carries an entry’s own settings through', () => {
    const group = buildQuizGroup(
      draft({ entries: [entry({ quizId: 'a', settings: { timer_seconds: 30 } })] }),
      LIBRARY
    );
    expect(group.entries[0].settings).toEqual({ timer_seconds: 30 });
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
      folders: inMode('folders'),
      journey: inMode('journey'),
      merge: inMode('merge', { settings: { questions_per_run: 5 } }),
      gauntlet: inMode('gauntlet', {
        entries: [
          entry({ quizId: 'a', folder: 'history' }),
          entry({ quizId: 'b', folder: 'science' })
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

  it('reports a setting written under a mode that has no use for it', () => {
    // The whole reason `settingsFor` could be deleted: the round-trip already says this.
    const built = buildGroupFiles(inMode('folders', { settings: { rounds: 5 } }), LIBRARY);
    expect(built.errors.join()).toMatch(/"rounds" only applies to gauntlet/);
    expect(built.files).toEqual([]);
  });

  it('emits quiz files that themselves parse', () => {
    const built = buildGroupFiles(draft(), LIBRARY);
    for (const file of built.files.filter((f) => f.name.endsWith('.qwiz'))) {
      expect(parseQwizFile(file.content).errors, file.name).toEqual([]);
    }
  });

  it('lines the manifest paths up with the files actually in the archive', () => {
    const built = buildGroupFiles(
      inMode('gauntlet', {
        entries: [
          entry({ quizId: 'a', folder: 'history' }),
          entry({ quizId: 'b', folder: 'science' })
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

  it('refuses an entry card with no quiz chosen', () => {
    const built = buildGroupFiles(
      draft({ entries: [entry({ quizId: 'a' }), entry({ quizId: '' })] }),
      LIBRARY
    );
    expect(built.errors.join()).toMatch(/Every entry needs a quiz/);
    expect(built.files).toEqual([]);
  });

  it('refuses a gauntlet whose quizzes are not in categories', () => {
    const built = buildGroupFiles(inMode('gauntlet'), LIBRARY);
    expect(built.errors.join()).toMatch(/category folder/);
    expect(built.files).toEqual([]);
  });

  it('refuses a gauntlet with only one category to choose between', () => {
    const built = buildGroupFiles(
      inMode('gauntlet', {
        entries: [
          entry({ quizId: 'a', folder: 'history' }),
          entry({ quizId: 'b', folder: 'history' })
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
      draft({ entries: [entry({ quizId: 'x' }), entry({ quizId: 'y' })] }),
      library
    );
    expect(built.errors).toEqual([]);
    expect(parseQwizGroup(built.manifest).errors).toEqual([]);
  });

  it('gives one quiz added twice two files, not one', () => {
    const built = buildGroupFiles(
      draft({ entries: [entry({ quizId: 'a' }), entry({ quizId: 'a' })] }),
      LIBRARY
    );
    expect(built.errors).toEqual([]);
    expect(built.files.map((f) => f.name)).toEqual([
      '.qwizgroup',
      'world-capitals.qwiz',
      'world-capitals-2.qwiz'
    ]);
  });
});

describe('draftFromQuizGroup — what code mode applies back', () => {
  /** Serialize a draft and read it straight back, which is the whole round-trip in one line. */
  function roundTrip(source: GroupDraft, edit: (manifest: string) => string = (m) => m) {
    const manifest = edit(buildGroupFiles(source, LIBRARY).manifest);
    const parsed = parseQwizGroup(manifest);
    expect(parsed.errors).toEqual([]);
    return draftFromQuizGroup(parsed.group, source, LIBRARY);
  }

  it('returns the same draft it was built from', () => {
    const source = draft();
    const { draft: next, errors } = roundTrip(source);
    expect(errors).toEqual([]);
    expect(next.title).toBe(source.title);
    expect(next.description).toBe(source.description);
    expect(next.settings).toEqual(source.settings);
    expect(next.entries.map((e) => e.quizId)).toEqual(['a', 'b']);
  });

  it('follows a quiz moved to a different folder, since the stem is the key', () => {
    const { draft: next, errors } = roundTrip(inMode('folders'), (manifest) =>
      manifest.replace('quiz: world-capitals.qwiz', 'quiz: week-1/world-capitals.qwiz')
    );
    expect(errors).toEqual([]);
    expect(next.entries[0]).toMatchObject({ quizId: 'a', folder: 'week-1' });
  });

  it('names a path it cannot resolve rather than dropping the entry silently', () => {
    const { draft: next, errors } = roundTrip(draft(), (manifest) =>
      manifest.replace('quiz: spelling-bee.qwiz', 'quiz: not-in-my-library.qwiz')
    );
    expect(errors.join()).toMatch(/not-in-my-library\.qwiz/);
    expect(next.entries.map((e) => e.quizId)).toEqual(['a']);
  });

  it('keeps a requires: written by hand, so applying does not flatten a DAG', () => {
    const source = inMode('journey', {
      entries: [entry({ quizId: 'a' }), entry({ quizId: 'b' }), entry({ quizId: 'c' })]
    });
    const { draft: next } = roundTrip(source, (manifest) =>
      manifest.replace('requires: [spelling-bee]', 'requires: [world-capitals]')
    );
    expect(next.entries[2].requires).toEqual(['world-capitals']);
    // …and building it again preserves what was applied, rather than re-chaining it.
    expect(buildQuizGroup(next, LIBRARY).entries[2].requires).toEqual(['world-capitals']);
  });

  it('keeps a per-entry setting the form has no field for', () => {
    const { draft: next } = roundTrip(draft(), (manifest) =>
      manifest.replace('quiz: world-capitals.qwiz', 'quiz: world-capitals.qwiz\n:timer_seconds=45')
    );
    expect(next.entries[0].settings).toEqual({ timer_seconds: 45 });
  });

  it('resolves both entries when one quiz was added twice', () => {
    const source = draft({ entries: [entry({ quizId: 'a' }), entry({ quizId: 'a' })] });
    const { draft: next, errors } = roundTrip(source);
    expect(errors).toEqual([]);
    expect(next.entries.map((e) => e.quizId)).toEqual(['a', 'a']);
  });
});

describe('draftFromQuizGroup — reopening a saved group', () => {
  /** What the builder does with `?id=`: it has no previous draft at all, so everything has to
   * resolve against the library by the filename the builder would have generated. */
  function reopen(manifest: string, library = LIBRARY) {
    const parsed = parseQwizGroup(manifest);
    expect(parsed.errors).toEqual([]);
    return draftFromQuizGroup(parsed.group, emptyGroupDraft(), library);
  }

  it('rebuilds the whole draft from an empty starting point', () => {
    const manifest = buildGroupFiles(inMode('folders'), LIBRARY).manifest;
    const { draft: next, errors } = reopen(manifest);

    expect(errors).toEqual([]);
    expect(next.title).toBe('The Qwiz Trail');
    expect(next.settings).toEqual({ mode: 'folders' });
    expect(next.entries.map((e) => e.quizId)).toEqual(['a', 'b']);
  });

  it('resolves a quiz sitting in a folder, since the folder is not part of the key', () => {
    const manifest = buildGroupFiles(
      inMode('gauntlet', {
        entries: [
          entry({ quizId: 'a', folder: 'history' }),
          entry({ quizId: 'b', folder: 'science' })
        ]
      }),
      LIBRARY
    ).manifest;

    const { draft: next, errors } = reopen(manifest);
    expect(errors).toEqual([]);
    expect(next.entries).toMatchObject([
      { quizId: 'a', folder: 'history' },
      { quizId: 'b', folder: 'science' }
    ]);
  });

  it('resolves a -2 suffix back to the quiz it disambiguates', () => {
    // `groupFilePaths` appends the suffix when a title is reused, so the same quiz added twice
    // produces `world-capitals.qwiz` and `world-capitals-2.qwiz` — both mean quiz "a".
    const manifest = buildGroupFiles(
      draft({ entries: [entry({ quizId: 'a' }), entry({ quizId: 'a' })] }),
      LIBRARY
    ).manifest;

    const { draft: next, errors } = reopen(manifest);
    expect(errors).toEqual([]);
    expect(next.entries.map((e) => e.quizId)).toEqual(['a', 'a']);
  });

  it('prefers an exact stem over stripping a numeric suffix', () => {
    // A quiz genuinely called "Round 2" slugifies to `round-2`; reading that as a second "Round"
    // would be wrong, so the unmodified stem is tried first.
    const library = new Map<string, Quiz>([
      ['r1', quiz('r1', 'Round')],
      ['r2', quiz('r2', 'Round 2')]
    ]);
    const manifest = buildGroupFiles(
      draft({ entries: [entry({ quizId: 'r2' })] }),
      library
    ).manifest;

    const { draft: next, errors } = reopen(manifest, library);
    expect(errors).toEqual([]);
    expect(next.entries[0].quizId).toBe('r2');
  });

  it('names a quiz deleted from the library since, and keeps the rest', () => {
    const manifest = buildGroupFiles(draft(), LIBRARY).manifest;
    const shrunk = new Map<string, Quiz>([['a', LIBRARY.get('a')!]]);

    const { draft: next, errors } = reopen(manifest, shrunk);
    expect(errors.join()).toMatch(/spelling-bee\.qwiz/);
    // The point of reporting rather than refusing: what's left is still editable.
    expect(next.entries.map((e) => e.quizId)).toEqual(['a']);
    expect(next.title).toBe('The Qwiz Trail');
  });
});

describe('helpers', () => {
  it('names the archive after the group', () => {
    expect(groupZipName(draft())).toBe('the-qwiz-trail.zip');
    expect(groupZipName(draft({ title: '' }))).toBe('quiz-group.zip');
  });

  it('starts a new group in folders mode, with the key already visible', () => {
    expect(emptyGroupDraft().settings).toEqual({ mode: 'folders' });
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
