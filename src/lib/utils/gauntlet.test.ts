import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseQwizGroup, type QuizGroup } from './quizGroup';
import { groupFromTree } from './repoIndex';
import {
  GENERAL_CATEGORY,
  drawQuestions,
  gauntletCategories,
  gauntletScore,
  gauntletWon,
  hasQuestionsLeft,
  questionKey,
  questionsPerPick,
  totalRounds
} from './gauntlet';

function fromPaths(...paths: string[]): QuizGroup {
  const group = groupFromTree(paths);
  return { ...group, settings: { mode: 'gauntlet' } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gauntletCategories', () => {
  it('makes a category of each top-level subfolder', () => {
    const categories = gauntletCategories(
      fromPaths('history/a.qwiz', 'science/b.qwiz', 'science/c.qwiz')
    );
    expect(categories.map((c) => c.name)).toEqual(['history', 'science']);
    expect(categories[1].entries).toHaveLength(2);
  });

  it('groups deeper folders under their top-level parent, not as separate choices', () => {
    // A picker offering `history/tudors/wives` asks the player to navigate a filesystem when the
    // point is to pick a subject.
    const categories = gauntletCategories(
      fromPaths('history/tudors/wives.qwiz', 'history/rome.qwiz')
    );
    expect(categories.map((c) => c.name)).toEqual(['history']);
    expect(categories[0].entries).toHaveLength(2);
  });

  it('files loose quizzes under General, and puts it last', () => {
    const categories = gauntletCategories(fromPaths('loose.qwiz', 'science/b.qwiz'));
    expect(categories.map((c) => c.name)).toEqual(['science', GENERAL_CATEGORY]);
  });

  it('honours an explicit group: label over the folder', () => {
    const { group } = parseQwizGroup(
      [
        '---',
        ':mode=folders',
        '---',
        '',
        'quiz: misc/a.qwiz',
        'group: Ancient History',
        '',
        'quiz: misc/b.qwiz',
        'group: Ancient History'
      ].join('\n')
    );
    const categories = gauntletCategories(group);
    expect(categories.map((c) => c.name)).toEqual(['Ancient History']);
    expect(categories[0].entries).toHaveLength(2);
  });

  it('strips the base so a scoped group categorises by its own subfolders', () => {
    const categories = gauntletCategories(
      fromPaths('rounds/history/a.qwiz', 'rounds/science/b.qwiz'),
      'rounds'
    );
    expect(categories.map((c) => c.name)).toEqual(['history', 'science']);
  });

  it('is empty for a group with no entries', () => {
    expect(gauntletCategories(fromPaths())).toEqual([]);
  });
});

describe('settings', () => {
  function group(...frontmatter: string[]) {
    return parseQwizGroup(
      ['---', ':mode=gauntlet', ...frontmatter, '---', '', 'quiz: a.qwiz'].join('\n')
    ).group;
  }

  it('reads questions_per_pick and rounds, with their documented defaults', () => {
    expect(questionsPerPick(group())).toBe(1);
    expect(totalRounds(group())).toBe(10);
    expect(questionsPerPick(group(':questions_per_pick=3'))).toBe(3);
    expect(totalRounds(group(':rounds=5'))).toBe(5);
  });
});

describe('gauntletScore', () => {
  it('averages per-round percentages rather than totalling points', () => {
    // 100% and 50% is 75%, whatever the point values behind them — a category worth more points
    // must not count for more than one whose questions are worth less.
    const score = gauntletScore([
      { category: 'a', earned: 10, max: 10 },
      { category: 'b', earned: 1, max: 2 }
    ]);
    expect(score.percentage).toBe(75);
    expect(score.rounds).toBe(2);
  });

  it('leaves an unscorable round out of the average instead of counting it as zero', () => {
    // Punishing a player for a category the author made unscorable isn't something they chose.
    const score = gauntletScore([
      { category: 'a', earned: 4, max: 4 },
      { category: 'b', earned: 0, max: 0 }
    ]);
    expect(score.percentage).toBe(100);
    expect(score.rounds).toBe(1);
  });

  it('is zero for a run with nothing scorable at all', () => {
    expect(gauntletScore([])).toEqual({ percentage: 0, rounds: 0 });
    expect(gauntletScore([{ category: 'a', earned: 0, max: 0 }])).toEqual({
      percentage: 0,
      rounds: 0
    });
  });

  it('counts a round answered wrong as a real zero, unlike an unscorable one', () => {
    const score = gauntletScore([
      { category: 'a', earned: 0, max: 5 },
      { category: 'b', earned: 5, max: 5 }
    ]);
    expect(score.percentage).toBe(50);
    expect(score.rounds).toBe(2);
  });
});

describe('gauntletWon', () => {
  function group(...frontmatter: string[]) {
    return parseQwizGroup(
      ['---', ':mode=gauntlet', ...frontmatter, '---', '', 'quiz: a.qwiz'].join('\n')
    ).group;
  }

  it('uses percent_to_win, defaulting to 75 like every other quiz', () => {
    expect(gauntletWon(group(), 75)).toBe(true);
    expect(gauntletWon(group(), 74.9)).toBe(false);
  });

  it('honours an author-set threshold', () => {
    expect(gauntletWon(group(':percent_to_win=50'), 60)).toBe(true);
    expect(gauntletWon(group(':percent_to_win=90'), 80)).toBe(false);
  });
});

describe('drawQuestions', () => {
  const categories = gauntletCategories(fromPaths('history/a.qwiz', 'history/b.qwiz'));
  const available = new Map([
    ['a', 3],
    ['b', 2]
  ]);

  it('draws the asked-for number from across the category quizzes', () => {
    const drawn = drawQuestions(categories[0], available, new Set(), 3);
    expect(drawn).toHaveLength(3);
  });

  it('never draws a question already used in this run', () => {
    // The property that matters most here: a gauntlet deliberately returns to the same categories
    // round after round, so without this a player would see repeats.
    const used = new Set([questionKey('a', 0), questionKey('a', 1), questionKey('a', 2)]);
    const drawn = drawQuestions(categories[0], available, used, 5);
    expect(drawn.every((q) => q.entryId === 'b')).toBe(true);
    expect(drawn).toHaveLength(2);
  });

  it('returns fewer than asked once a category runs dry, rather than repeating', () => {
    const used = new Set(
      [0, 1, 2].map((i) => questionKey('a', i)).concat([0, 1].map((i) => questionKey('b', i)))
    );
    expect(drawQuestions(categories[0], available, used, 3)).toEqual([]);
  });

  it('draws at random, so two runs of the same category differ', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const drawn = drawQuestions(categories[0], available, new Set(), 1);
    // With every swap sending j to 0, the pool rotates — so the draw is provably not just the head.
    expect(drawn[0]).not.toEqual({ entryId: 'a', index: 0 });
  });
});

describe('hasQuestionsLeft', () => {
  const categories = gauntletCategories(fromPaths('history/a.qwiz'));
  const available = new Map([['a', 2]]);

  it('is true while anything is unused', () => {
    expect(hasQuestionsLeft(categories, available, new Set())).toBe(true);
    expect(hasQuestionsLeft(categories, available, new Set([questionKey('a', 0)]))).toBe(true);
  });

  it('is false once every question has been asked, which stops a run early', () => {
    const used = new Set([questionKey('a', 0), questionKey('a', 1)]);
    expect(hasQuestionsLeft(categories, available, used)).toBe(false);
  });

  it('is false for a group whose quizzes could not be read', () => {
    expect(hasQuestionsLeft(categories, new Map(), new Set())).toBe(false);
  });
});
