import { describe, expect, it } from 'vitest';
import type {
  QuizScriptOption,
  QuizScriptOptionContent,
  QuizScriptQuestion,
  QuizScriptSettings
} from './quizScript';
import {
  answerVerdict,
  blankDraft,
  boxAnswer,
  characterInputLetterBank,
  characterInputLetterFullyRevealed,
  characterInputLetterInAnswer,
  characterInputNormalizeGuess,
  characterInputPrerevealedPositions,
  characterInputRevealPositionsAfterGuess,
  canSubmitDraft,
  choiceOptionsLayoutClass,
  draftFromAnswer,
  isDraftEmpty,
  effectivePoints,
  gradeCategoriseQuestion,
  gradeCharacterInputQuestion,
  gradeDraft,
  gradeFillInBlanksQuestion,
  gradeMatchQuestion,
  gradeOrderQuestion,
  gradeQuestion,
  gradeRun,
  gradeTypedQuestion,
  categoriseBuckets,
  fillInBlanksCount,
  gradeTypedSlotsQuestion,
  isDraftComplete,
  typedSlotCorrectness,
  typedSlotExpectations,
  isTypedMatch,
  levenshteinDistance,
  locksOnSubmit,
  matchedPatternIndex,
  matchTypedGuesses,
  normalizeTypedAnswer,
  gradeTypePatternQuestion,
  patternMatches,
  questionMaxPoints,
  resolveExtraPrereveal,
  settingBoolean,
  settingNumber,
  settingString,
  typedBoxCount,
  typedBoxGroups,
  typedSingleAnswerMatches,
  buildPlayRun,
  type QuestionDraft
} from './grading';

function textOption(text: string, correct: boolean, points?: number): QuizScriptOption {
  return { content: { kind: 'text', text }, correct, points };
}

function characterInputOption(text: string, prerevealed?: number[]): QuizScriptOption {
  return { content: { kind: 'text', text }, correct: true, prerevealed };
}

function makeQuestion(overrides: Partial<QuizScriptQuestion> = {}): QuizScriptQuestion {
  return {
    variant: 'question',
    text: 'What is 2 + 2?',
    media: [],
    options: [textOption('4', true), textOption('5', false)],
    extras: [],
    settings: {},
    ...overrides
  };
}

describe('settingNumber / settingBoolean / settingString', () => {
  it('settingNumber only accepts numbers', () => {
    expect(settingNumber(5)).toBe(5);
    expect(settingNumber('5')).toBeUndefined();
    expect(settingNumber(true)).toBeUndefined();
    expect(settingNumber(undefined)).toBeUndefined();
  });

  it('settingBoolean is true only for the literal boolean true', () => {
    expect(settingBoolean(true)).toBe(true);
    expect(settingBoolean(false)).toBe(false);
    expect(settingBoolean('true')).toBe(false);
    expect(settingBoolean(undefined)).toBe(false);
  });

  it('settingString falls back when the value is not a string', () => {
    expect(settingString('after_end', 'default')).toBe('after_end');
    expect(settingString(undefined, 'default')).toBe('default');
    expect(settingString(5, 'default')).toBe('default');
  });
});

describe('effectivePoints', () => {
  it('uses the explicit per-option weight when set', () => {
    expect(effectivePoints({ correct: true, points: 4 }, {})).toBe(4);
    expect(effectivePoints({ correct: false, points: -2 }, {})).toBe(-2);
  });

  it('falls back to the question-level point/penalty setting', () => {
    expect(effectivePoints({ correct: true, points: undefined }, { points_correct: 3 })).toBe(3);
    expect(effectivePoints({ correct: false, points: undefined }, { points_wrong: -1 })).toBe(-1);
  });

  it('defaults to 1 for a correct option and 0 for an incorrect one', () => {
    expect(effectivePoints({ correct: true, points: undefined }, {})).toBe(1);
    expect(effectivePoints({ correct: false, points: undefined }, {})).toBe(0);
  });
});

describe('gradeQuestion (choice)', () => {
  it('exact-match mode: full credit only when the selection matches exactly', () => {
    const q = makeQuestion({
      options: [textOption('4', true), textOption('5', false), textOption('22', false)]
    });
    expect(gradeQuestion(q, new Set([0]), new Set())).toEqual({ earned: 1, max: 1 });
    expect(gradeQuestion(q, new Set([0, 1]), new Set())).toEqual({ earned: 0, max: 1 });
    expect(gradeQuestion(q, new Set(), new Set())).toEqual({ earned: 0, max: 1 });
  });

  it('partial_credit mode: each selected option scores independently', () => {
    const q = makeQuestion({
      options: [textOption('a', true, 2), textOption('b', true, 3), textOption('c', false, -1)],
      settings: { partial_credit: true }
    });
    expect(gradeQuestion(q, new Set([0]), new Set())).toEqual({ earned: 2, max: 5 });
    expect(gradeQuestion(q, new Set([2]), new Set())).toEqual({ earned: -1, max: 5 });
  });

  it('partial_credit mode caps the achievable max at max_answers', () => {
    const q = makeQuestion({
      options: [textOption('a', true, 1), textOption('b', true, 1), textOption('c', true, 1)],
      settings: { partial_credit: true, max_answers: 2 }
    });
    // 3 correct options worth 1 each, but only 2 can ever be selected at once.
    expect(gradeQuestion(q, new Set([0, 1]), new Set())).toEqual({ earned: 2, max: 2 });
  });

  it('reveal hints subtract their cost from earned and only count positive cost toward max', () => {
    const q = makeQuestion({
      extras: [
        { label: 'hint', content: 'it is even', points: -1 },
        { label: 'bonus', content: 'brag', points: 2 }
      ]
    });
    const result = gradeQuestion(q, new Set([0]), new Set([0]));
    expect(result).toEqual({ earned: 1 - 1, max: 1 + 2 });
  });
});

describe('choiceOptionsLayoutClass', () => {
  it('defaults to a one-per-row list when options_layout is unset', () => {
    const q = makeQuestion();
    expect(choiceOptionsLayoutClass(q)).toBe('space-y-2');
  });

  it('grid2x2 is a fixed 2-column grid', () => {
    const q = makeQuestion({ settings: { options_layout: 'grid2x2' } });
    expect(choiceOptionsLayoutClass(q)).toBe('grid grid-cols-2 gap-2');
  });

  it('grid3x3 is 2 columns on narrow screens, 3 on wider ones', () => {
    const q = makeQuestion({ settings: { options_layout: 'grid3x3' } });
    expect(choiceOptionsLayoutClass(q)).toBe('grid grid-cols-2 sm:grid-cols-3 gap-2');
  });

  it('options_layout=list is the same as unset', () => {
    const q = makeQuestion({ settings: { options_layout: 'list' } });
    expect(choiceOptionsLayoutClass(q)).toBe('space-y-2');
  });
});

describe('normalizeTypedAnswer', () => {
  const settings: QuizScriptSettings = {};

  it('lowercases, trims, and collapses whitespace by default', () => {
    expect(normalizeTypedAnswer('  Paris   France  ', settings)).toBe('paris france');
  });

  it('strips punctuation but keeps letters/digits/spaces', () => {
    expect(normalizeTypedAnswer("it's a co-operation!!", settings)).toBe('its a cooperation');
  });

  it('folds accented characters to their base letter', () => {
    expect(normalizeTypedAnswer('café', settings)).toBe('cafe');
  });

  it('respects match_case', () => {
    expect(normalizeTypedAnswer('Paris', { match_case: true })).toBe('Paris');
  });
});

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(levenshteinDistance('paris', 'paris')).toBe(0);
  });

  it('counts a single substitution as 1', () => {
    expect(levenshteinDistance('paris', 'parie')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('counts insertions and deletions', () => {
    expect(levenshteinDistance('pari', 'paris')).toBe(1);
    expect(levenshteinDistance('paris', 'pari')).toBe(1);
  });
});

describe('isTypedMatch', () => {
  it('matches normalized text by default', () => {
    expect(isTypedMatch('  PARIS ', 'paris', {})).toBe(true);
    expect(isTypedMatch('london', 'paris', {})).toBe(false);
  });

  it('treats blank responses/answers as never matching', () => {
    expect(isTypedMatch('', 'paris', {})).toBe(false);
    expect(isTypedMatch('   ', 'paris', {})).toBe(false);
  });

  it('number_tolerance allows an approximate numeric match', () => {
    expect(isTypedMatch('3.4', '3', { number_tolerance: 0.5 })).toBe(true);
    expect(isTypedMatch('3.6', '3', { number_tolerance: 0.5 })).toBe(false);
  });

  it('number_tolerance falls back to text comparison when either side is not numeric', () => {
    expect(isTypedMatch('three', 'three', { number_tolerance: 0.5 })).toBe(true);
  });

  it('typo_tolerance allows a bounded edit distance as a percentage of answer length', () => {
    // "pari" vs "paris": edit distance 1, allowed = round(20% * 5) = 1
    expect(isTypedMatch('pari', 'paris', { typo_tolerance: 20 })).toBe(true);
    expect(isTypedMatch('pa', 'paris', { typo_tolerance: 20 })).toBe(false);
  });

  it('match_case changes what typo_tolerance actually compares — case differences count as edit distance', () => {
    // "PARIS" vs "Paris": identical case-insensitively (distance 0), but every letter differs in
    // case once match_case is on (distance 4) — enough to fall outside a 20% tolerance (1).
    expect(isTypedMatch('PARIS', 'Paris', { typo_tolerance: 20 })).toBe(true);
    expect(isTypedMatch('PARIS', 'Paris', { match_case: true, typo_tolerance: 20 })).toBe(false);
  });

  it('number_tolerance ignores match_case entirely — numbers have no case', () => {
    expect(isTypedMatch('3', '3', { number_tolerance: 0.5, match_case: true })).toBe(true);
  });
});

describe('typedSingleAnswerMatches', () => {
  it('returns the index of the first accepted answer that matches', () => {
    const options = [textOption('paris', true), textOption('lyon', true)];
    expect(typedSingleAnswerMatches(options, 'Lyon', {})).toBe(1);
  });

  it('returns null when nothing matches', () => {
    const options = [textOption('paris', true)];
    expect(typedSingleAnswerMatches(options, 'berlin', {})).toBeNull();
  });
});

describe('matchTypedGuesses', () => {
  const options = [textOption('paris', true), textOption('lyon', true)];

  it('classifies blank, wrong, matched, and redundant guesses', () => {
    const { perGuess, wrongCount } = matchTypedGuesses(
      options,
      ['paris', '', 'berlin', 'paris'],
      {}
    );
    expect(perGuess.map((g) => g.status)).toEqual(['matched', 'blank', 'wrong', 'redundant']);
    expect(perGuess[0].optionIndex).toBe(0);
    expect(wrongCount).toBe(1);
  });

  it('lets two guesses each claim a distinct accepted answer', () => {
    const { perGuess } = matchTypedGuesses(options, ['paris', 'lyon'], {});
    expect(perGuess.map((g) => g.status)).toEqual(['matched', 'matched']);
    expect(perGuess.map((g) => g.optionIndex)).toEqual([0, 1]);
  });
});

describe('gradeTypedQuestion', () => {
  it("single-response mode awards the matched answer's own points, uncapped by others", () => {
    const q = makeQuestion({
      variant: 'type_answer',
      options: [textOption('paris', true, 5), textOption('lyon', true, 1)]
    });
    expect(gradeTypedQuestion(q, 'paris', new Set())).toEqual({ earned: 5, max: 5 });
    expect(gradeTypedQuestion(q, 'nope', new Set())).toEqual({ earned: 0, max: 5 });
  });

  it('multi-guess exact mode requires every accepted answer matched with zero wrong guesses', () => {
    const q = makeQuestion({
      variant: 'type_answer',
      options: [textOption('paris', true, 2), textOption('lyon', true, 3)],
      settings: { max_answers: 2 }
    });
    expect(gradeTypedQuestion(q, ['paris', 'lyon'], new Set())).toEqual({ earned: 5, max: 5 });
    expect(gradeTypedQuestion(q, ['paris', 'nope'], new Set())).toEqual({ earned: 0, max: 5 });
  });

  it('multi-guess partial mode sums matched points and applies the wrong-guess penalty', () => {
    const q = makeQuestion({
      variant: 'type_answer',
      options: [textOption('paris', true, 2), textOption('lyon', true, 3)],
      settings: { max_answers: 2, partial_credit: true, points_wrong: -1 }
    });
    expect(gradeTypedQuestion(q, ['paris', 'nope'], new Set())).toEqual({ earned: 1, max: 5 });
  });
});

describe('typedBoxGroups / typedBoxCount', () => {
  it('splits the first accepted answer into per-word character counts', () => {
    const q = makeQuestion({ variant: 'type_answer', options: [textOption('new york', true)] });
    expect(typedBoxGroups(q)).toEqual([3, 4]);
    expect(typedBoxCount(q)).toBe(7);
  });

  it('returns an empty shape when there is no text-based accepted answer', () => {
    const q = makeQuestion({ variant: 'type_answer', options: [] });
    expect(typedBoxGroups(q)).toEqual([]);
    expect(typedBoxCount(q)).toBe(0);
  });
});

describe('boxAnswer', () => {
  it('reassembles per-word box characters into a space-joined answer', () => {
    expect(boxAnswer(['n', 'e', 'w', 'y', 'o', 'r', 'k'], [3, 4])).toBe('new york');
  });
});

describe('gradeCharacterInputQuestion', () => {
  it('a bracket-pre-revealed letter counts toward neither earned nor max', () => {
    // "Paris" -> distinct letters p,a,r,i,s (5), minus pre-revealed "p" -> 4 guessable.
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('Paris', [0])]
    });
    const result = gradeCharacterInputQuestion(q, blankDraft());
    expect(result).toEqual({ earned: 0, max: 4 });
  });

  it('awards point once per distinct correctly-guessed letter, not per occurrence', () => {
    // "letter" -> distinct guessable letters l,e,t,r (4); "e" appears twice.
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('letter')]
    });
    const draft = { ...blankDraft(), guessedLetters: new Map([['e', 'correct' as const]]) };
    expect(gradeCharacterInputQuestion(q, draft)).toEqual({ earned: 1, max: 4 });
  });

  it('applies penalty per wrong guess', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('cat')],
      settings: { points_wrong: -2 }
    });
    const draft = {
      ...blankDraft(),
      guessedLetters: new Map([
        ['c', 'correct' as const],
        ['x', 'wrong' as const]
      ])
    };
    expect(gradeCharacterInputQuestion(q, draft)).toEqual({ earned: 1 - 2, max: 3 });
  });

  it('non-letter characters are never guessable and never counted', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('new york')]
    });
    // distinct guessable letters: n,e,w,y,o,r,k -> 7 (the space is excluded).
    expect(gradeCharacterInputQuestion(q, blankDraft()).max).toBe(7);
  });

  it("extraPrerevealed (letters_shown_at_start's resolved picks) also excludes from earned/max", () => {
    const q = makeQuestion({ variant: 'guess_letters', options: [characterInputOption('cat')] });
    const draft = { ...blankDraft(), extraPrerevealed: new Set([0]) }; // pre-reveals "c"
    expect(gradeCharacterInputQuestion(q, draft).max).toBe(2); // a, t only
  });
});

describe('gradeOrderQuestion', () => {
  const q = makeQuestion({
    variant: 'order_items',
    options: [textOption('First', true), textOption('Second', true), textOption('Third', true)]
  });

  it('exact match (default): every slot correct scores the full max', () => {
    expect(gradeOrderQuestion(q, [0, 1, 2], new Set())).toEqual({ earned: 3, max: 3 });
  });

  it('exact match: any wrong slot scores 0, even if only one is off', () => {
    expect(gradeOrderQuestion(q, [0, 2, 1], new Set())).toEqual({ earned: 0, max: 3 });
  });

  it('exact match: an incomplete placement (nulls) scores 0, not a crash', () => {
    expect(gradeOrderQuestion(q, [0, null, null], new Set())).toEqual({ earned: 0, max: 3 });
  });

  it('partial_credit: each correctly-placed slot scores independently', () => {
    const partial = makeQuestion({
      variant: 'order_items',
      options: q.options,
      settings: { partial_credit: true }
    });
    expect(gradeOrderQuestion(partial, [0, 2, 1], new Set())).toEqual({ earned: 1, max: 3 });
  });

  it('respects per-option %N% weights and the question default point/penalty', () => {
    const weighted = makeQuestion({
      variant: 'order_items',
      options: [textOption('First', true, 5), textOption('Second', true)],
      settings: { points_correct: 2, partial_credit: true }
    });
    // slot 0 correct (weight 5), slot 1 wrong (point default 2, not earned).
    expect(gradeOrderQuestion(weighted, [0, null], new Set())).toEqual({ earned: 5, max: 7 });
  });
});

/** A plain-text content value — targets are `QuizScriptOptionContent` now that a `match_pairs`
 * right column can hold pictures, so a text one has to say so. */
function text(value: string): QuizScriptOptionContent {
  return { kind: 'text', text: value };
}

function matchOption(label: string, target: string, points?: number): QuizScriptOption {
  return { content: text(label), correct: true, target: text(target), points };
}

describe('gradeMatchQuestion', () => {
  const q = makeQuestion({
    variant: 'match_pairs',
    options: [matchOption('Paris', 'France'), matchOption('Tokyo', 'Japan')]
  });

  it('a pair is correct iff it maps an option back to its own target (index i -> i)', () => {
    const pairs = new Map([
      [0, 0],
      [1, 1]
    ]);
    expect(gradeMatchQuestion(q, pairs, new Set())).toEqual({ earned: 2, max: 2 });
  });

  it('exact match: a crossed/wrong pair scores 0 overall', () => {
    const pairs = new Map([
      [0, 1],
      [1, 0]
    ]);
    expect(gradeMatchQuestion(q, pairs, new Set())).toEqual({ earned: 0, max: 2 });
  });

  it('exact match: an incomplete set of pairs scores 0, not a crash', () => {
    const pairs = new Map([[0, 0]]);
    expect(gradeMatchQuestion(q, pairs, new Set())).toEqual({ earned: 0, max: 2 });
  });

  it('partial_credit: each correct pair scores independently', () => {
    const partial = makeQuestion({
      variant: 'match_pairs',
      options: q.options,
      settings: { partial_credit: true }
    });
    const pairs = new Map([
      [0, 0],
      [1, 0]
    ]);
    expect(gradeMatchQuestion(partial, pairs, new Set())).toEqual({ earned: 1, max: 2 });
  });
});

describe('gradeCategoriseQuestion', () => {
  const q = makeQuestion({
    variant: 'group_items',
    options: [
      matchOption('Fish', 'Water'),
      matchOption('Frog', 'Water'),
      matchOption('Lion', 'Land')
    ]
  });
  // categoriseBuckets(q) -> ['Water', 'Land'], so bucket 0 = Water, bucket 1 = Land.

  it('every item correctly bucketed scores the full max', () => {
    const assignments = new Map([
      [0, 0],
      [1, 0],
      [2, 1]
    ]);
    expect(gradeCategoriseQuestion(q, assignments, new Set())).toEqual({ earned: 3, max: 3 });
  });

  it('several items correctly sharing one bucket is fine, unlike match', () => {
    // Both Fish and Frog assigned to bucket 0 (Water) — both correct simultaneously.
    const assignments = new Map([
      [0, 0],
      [1, 0],
      [2, 0]
    ]); // Lion wrongly in Water
    expect(gradeCategoriseQuestion(q, assignments, new Set())).toEqual({ earned: 0, max: 3 }); // exact match fails
  });

  it('partial_credit: each correctly-bucketed item scores independently', () => {
    const partial = makeQuestion({
      variant: 'group_items',
      options: q.options,
      settings: { partial_credit: true }
    });
    const assignments = new Map([
      [0, 0],
      [1, 0],
      [2, 0]
    ]); // Lion wrong
    expect(gradeCategoriseQuestion(partial, assignments, new Set())).toEqual({
      earned: 2,
      max: 3
    });
  });
});

function blankOption(text: string, correct: boolean, points?: number): QuizScriptOption {
  return { content: { kind: 'text', text }, correct, points };
}

describe('gradeFillInBlanksQuestion', () => {
  const q = makeQuestion({
    variant: 'fill_blanks',
    text: 'The ___ is the powerhouse of the ___.',
    options: [
      blankOption('mitochondria', true),
      blankOption('cell', true),
      blankOption('nucleus', false)
    ]
  });

  it('bank mode (default): the right bank word in each blank scores full credit', () => {
    expect(gradeFillInBlanksQuestion(q, [], [0, 1], new Set())).toEqual({ earned: 2, max: 2 });
  });

  it('bank mode: an empty or wrong blank fails exact match entirely', () => {
    expect(gradeFillInBlanksQuestion(q, [], [0, null], new Set())).toEqual({ earned: 0, max: 2 });
    // Blank 0 filled with the distractor ("nucleus", option 2).
    expect(gradeFillInBlanksQuestion(q, [], [2, 1], new Set())).toEqual({ earned: 0, max: 2 });
  });

  it('bank mode: a distractor spelled the same as the answer still counts', () => {
    // The player has no way to tell two identical buttons apart, so grading compares the word
    // that was placed rather than which button it came from.
    const twins = makeQuestion({
      variant: 'fill_blanks',
      text: 'The ___ is the powerhouse of the cell.',
      options: [blankOption('mitochondria', true), blankOption('mitochondria', false)]
    });
    expect(gradeFillInBlanksQuestion(twins, [], [1], new Set())).toEqual({ earned: 1, max: 1 });
  });

  it('bank mode: a picture bank word scores like any other', () => {
    const pictures = makeQuestion({
      variant: 'fill_blanks',
      text: 'The organelle shown here — ___ — makes ATP.',
      options: [
        { content: { kind: 'image', alt: 'A mitochondrion', url: 'mito.png' }, correct: true },
        { content: { kind: 'image', alt: 'A nucleus', url: 'nucleus.png' }, correct: false }
      ]
    });
    expect(gradeFillInBlanksQuestion(pictures, [], [0], new Set())).toEqual({ earned: 1, max: 1 });
    expect(gradeFillInBlanksQuestion(pictures, [], [1], new Set())).toEqual({ earned: 0, max: 1 });
  });

  it('partial_credit: each correct blank scores independently', () => {
    const partial = makeQuestion({
      variant: 'fill_blanks',
      text: q.text,
      options: q.options,
      settings: { partial_credit: true }
    });
    expect(gradeFillInBlanksQuestion(partial, [], [0, null], new Set())).toEqual({
      earned: 1,
      max: 2
    });
  });

  it('type mode: typed matching (normalization/case) applies, unlike bank mode', () => {
    const typedMode = makeQuestion({
      variant: 'fill_blanks',
      text: q.text,
      options: q.options,
      settings: { answer_mode: 'type' }
    });
    expect(
      gradeFillInBlanksQuestion(typedMode, ['  MITOCHONDRIA ', 'Cell'], [], new Set())
    ).toEqual({ earned: 2, max: 2 });
  });

  it('type mode: typo_tolerance forgives a typo, same as a typed question', () => {
    const fuzzy = makeQuestion({
      variant: 'fill_blanks',
      text: q.text,
      options: q.options,
      settings: { answer_mode: 'type', typo_tolerance: 20 }
    });
    expect(gradeFillInBlanksQuestion(fuzzy, ['mitochondri', 'cell'], [], new Set())).toEqual({
      earned: 2,
      max: 2
    });
  });

  it('type mode: a picture blank is typed as its alt text', () => {
    const pictureTyped = makeQuestion({
      variant: 'fill_blanks',
      text: 'This is a ___.',
      options: [
        { content: { kind: 'image', alt: 'mitochondrion', url: 'mito.png' }, correct: true }
      ],
      settings: { answer_mode: 'type' }
    });
    expect(gradeFillInBlanksQuestion(pictureTyped, ['Mitochondrion'], [], new Set())).toEqual({
      earned: 1,
      max: 1
    });
  });
});

describe('fillInBlanksCount', () => {
  it('counts "___" tokens in the question text', () => {
    expect(fillInBlanksCount(makeQuestion({ text: 'a ___ b ___ c' }))).toBe(2);
    expect(fillInBlanksCount(makeQuestion({ text: 'no blanks here' }))).toBe(0);
  });
});

describe('categoriseBuckets', () => {
  it('returns the distinct target labels in first-appearance order', () => {
    const q = makeQuestion({
      variant: 'group_items',
      options: [
        { content: { kind: 'text', text: 'Fish' }, correct: true, target: text('Water') },
        { content: { kind: 'text', text: 'Frog' }, correct: true, target: text('Water') },
        { content: { kind: 'text', text: 'Lion' }, correct: true, target: text('Land') }
      ]
    });
    expect(categoriseBuckets(q)).toEqual(['Water', 'Land']);
  });

  it('groups a picture item under its bucket like any other', () => {
    const q = makeQuestion({
      variant: 'group_items',
      options: [
        {
          content: { kind: 'image', alt: 'A trout', url: 'trout.png' },
          correct: true,
          target: text('Water')
        },
        { content: { kind: 'text', text: 'Lion' }, correct: true, target: text('Land') }
      ]
    });
    expect(categoriseBuckets(q)).toEqual(['Water', 'Land']);
    // Bucket 0 is "Water", which is where the picture belongs.
    expect(gradeCategoriseQuestion(q, new Map([[0, 0]]), new Set()).earned).toBe(0);
    expect(
      gradeCategoriseQuestion(
        q,
        new Map([
          [0, 0],
          [1, 1]
        ]),
        new Set()
      ).earned
    ).toBe(2);
  });
});

describe('characterInputLetterInAnswer / characterInputNormalizeGuess', () => {
  it('is always case-insensitive — a bank guess has no "wrong case" to compare', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('Paris')]
    });
    expect(characterInputLetterInAnswer(q, 'P')).toBe(true);
    expect(characterInputLetterInAnswer(q, 'p')).toBe(true);
    expect(characterInputLetterInAnswer(q, 'z')).toBe(false);
    expect(characterInputNormalizeGuess('P')).toBe('p');
  });
});

describe('characterInputLetterBank', () => {
  it('alphabet mode (default) offers the full a-z', () => {
    const q = makeQuestion({ variant: 'guess_letters', options: [characterInputOption('cat')] });
    expect(characterInputLetterBank(q)).toHaveLength(26);
  });

  it('fixed mode offers exactly the configured letters', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('cat')],
      settings: { letter_bank: 'fixed', letter_bank_chars: 'cta' }
    });
    expect(characterInputLetterBank(q)).toEqual(['a', 'c', 't']);
  });

  it('auto mode includes every answer letter plus some decoys not in the answer', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('cat')],
      settings: { letter_bank: 'auto' }
    });
    const bank = characterInputLetterBank(q);
    expect(bank).toEqual(expect.arrayContaining(['a', 'c', 't']));
    expect(bank.length).toBeGreaterThan(3); // real letters plus at least one decoy
    expect(bank.length).toBeLessThan(26);
  });
});

describe('characterInputRevealPositionsAfterGuess / characterInputLetterFullyRevealed', () => {
  it('letter_reveal=all reveals every occurrence at once', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('letter')]
    });
    const revealed = characterInputRevealPositionsAfterGuess(q, new Set(), 'e');
    expect(revealed).toEqual(new Set([1, 4])); // "letter" -> e at indices 1 and 4
    expect(characterInputLetterFullyRevealed(q, revealed, 'e')).toBe(true);
  });

  it('letter_reveal=sequence reveals one occurrence per guess, in order', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('letter')],
      settings: { letter_reveal: 'sequence' }
    });
    const first = characterInputRevealPositionsAfterGuess(q, new Set(), 'e');
    expect(first).toEqual(new Set([1]));
    expect(characterInputLetterFullyRevealed(q, first, 'e')).toBe(false);
    const second = characterInputRevealPositionsAfterGuess(q, first, 'e');
    expect(second).toEqual(new Set([1, 4]));
    expect(characterInputLetterFullyRevealed(q, second, 'e')).toBe(true);
  });

  it('is a no-op once every occurrence is already revealed', () => {
    const q = makeQuestion({ variant: 'guess_letters', options: [characterInputOption('cat')] });
    const revealed = new Set([0]);
    expect(characterInputRevealPositionsAfterGuess(q, revealed, 'c')).toEqual(revealed);
  });

  it('a letter that is entirely pre-revealed reads as fully revealed even with no guess at all', () => {
    // This is what QuestionPlayer.svelte's bank-button disabling relies on to disable a
    // pre-revealed letter from the very first render, before the player has clicked anything —
    // `revealedPositions` starts out equal to the pre-reveal set, so this check doesn't need to
    // know or care whether a letter was ever actually guessed.
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('cat', [0])] // "c" pre-revealed
    });
    const initialRevealed = characterInputPrerevealedPositions(q, new Set());
    expect(characterInputLetterFullyRevealed(q, initialRevealed, 'c')).toBe(true);
  });

  it('a letter that never appears in the answer at all is NOT "fully revealed"', () => {
    // Regression test: an empty occurrence list would make `.every(...)` vacuously true, which
    // would wrongly read as "fully revealed" for every letter not in the word — pre-disabling
    // the entire rest of the bank instead of leaving it genuinely guessable.
    const q = makeQuestion({ variant: 'guess_letters', options: [characterInputOption('cat')] });
    expect(characterInputLetterFullyRevealed(q, new Set(), 'z')).toBe(false);
  });
});

describe('characterInputPrerevealedPositions', () => {
  it('unions explicit bracket positions with the resolved extra pre-reveal set', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('Paris', [0])]
    });
    expect(characterInputPrerevealedPositions(q, new Set([2]))).toEqual(new Set([0, 2]));
  });
});

describe('resolveExtraPrereveal', () => {
  it('resolves exactly letters_shown_at_start positions, excluding bracket-marked ones', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('Paris', [0])],
      settings: { letters_shown_at_start: 2 }
    });
    const extra = resolveExtraPrereveal(q);
    expect(extra.size).toBe(2);
    expect(extra.has(0)).toBe(false); // already bracket-marked, never re-picked
  });

  it('defaults to nothing when letters_shown_at_start is not set', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('Paris')]
    });
    expect(resolveExtraPrereveal(q).size).toBe(0);
  });
});

describe('isDraftComplete', () => {
  it('a choice draft is complete once min_answers selections are made', () => {
    const q = makeQuestion({ settings: { min_answers: 1 } });
    expect(isDraftComplete(q, { ...blankDraft(), selected: new Set() })).toBe(false);
    expect(isDraftComplete(q, { ...blankDraft(), selected: new Set([0]) })).toBe(true);
  });

  it('a single-input typed draft needs non-blank text', () => {
    const q = makeQuestion({ variant: 'type_answer', options: [textOption('paris', true)] });
    expect(isDraftComplete(q, { ...blankDraft(), typedSingleAnswer: '  ' })).toBe(false);
    expect(isDraftComplete(q, { ...blankDraft(), typedSingleAnswer: 'paris' })).toBe(true);
  });

  it('a boxes-mode typed draft needs every box filled', () => {
    const q = makeQuestion({
      variant: 'type_answer',
      options: [textOption('ab', true)],
      settings: { typed_input: 'boxes' }
    });
    expect(isDraftComplete(q, { ...blankDraft(), boxChars: ['a', ''] })).toBe(false);
    expect(isDraftComplete(q, { ...blankDraft(), boxChars: ['a', 'b'] })).toBe(true);
  });

  it('a guess_letters draft is always complete — submittable at any point, like giving up mid-Hangman', () => {
    const q = makeQuestion({ variant: 'guess_letters', options: [characterInputOption('cat')] });
    expect(isDraftComplete(q, blankDraft())).toBe(true);
  });
});

describe('isDraftEmpty', () => {
  // Every variant, because "nothing entered" lives in a different field for each one and a missed
  // branch would silently label a real answer as skipped.
  const cases: [string, QuizScriptQuestion, QuestionDraft][] = [
    [
      'pick_one',
      makeQuestion({ variant: 'pick_one' }),
      { ...blankDraft(), selected: new Set([0]) }
    ],
    [
      'pick_many',
      makeQuestion({ variant: 'pick_many' }),
      { ...blankDraft(), selected: new Set([1]) }
    ],
    [
      'type_answer',
      makeQuestion({ variant: 'type_answer', options: [textOption('paris', true)] }),
      { ...blankDraft(), typedSingleAnswer: 'x' }
    ],
    [
      'type_answer boxes',
      makeQuestion({
        variant: 'type_answer',
        options: [textOption('ab', true)],
        settings: { typed_input: 'boxes' }
      }),
      { ...blankDraft(), boxChars: ['a', ''] }
    ],
    [
      'type_pattern',
      makeQuestion({ variant: 'type_pattern', options: [textOption('[0-9]+', true)] }),
      { ...blankDraft(), typedSingleAnswer: '1' }
    ],
    [
      'guess_letters',
      makeQuestion({ variant: 'guess_letters', options: [characterInputOption('cat')] }),
      { ...blankDraft(), guessedLetters: new Map([['c', 'correct' as const]]) }
    ],
    [
      'order_items',
      makeQuestion({ variant: 'order_items' }),
      { ...blankDraft(), orderPlacement: [0, null] }
    ],
    [
      'match_pairs',
      makeQuestion({ variant: 'match_pairs' }),
      { ...blankDraft(), matchPairs: new Map([[0, 0]]) }
    ],
    [
      'group_items',
      makeQuestion({ variant: 'group_items' }),
      { ...blankDraft(), categoriseAssignments: new Map([[0, 0]]) }
    ],
    [
      'fill_blanks',
      makeQuestion({ variant: 'fill_blanks' }),
      { ...blankDraft(), blankPicks: [0, null] }
    ]
  ];

  for (const [name, question, touched] of cases) {
    it(`${name}: a blank draft is empty and a touched one is not`, () => {
      expect(isDraftEmpty(question, blankDraft())).toBe(true);
      expect(isDraftEmpty(question, touched)).toBe(false);
    });
  }

  it('whitespace-only typed text still counts as empty', () => {
    const q = makeQuestion({ variant: 'type_answer', options: [textOption('paris', true)] });
    expect(isDraftEmpty(q, { ...blankDraft(), typedSingleAnswer: '   ' })).toBe(true);
  });

  it('revealing a hint is not answering — the draft stays empty', () => {
    const q = makeQuestion({ variant: 'pick_one' });
    expect(isDraftEmpty(q, { ...blankDraft(), revealed: new Set([0]) })).toBe(true);
  });

  it('a partly-filled board is neither complete nor empty', () => {
    const q = makeQuestion({ variant: 'order_items' });
    const partial = { ...blankDraft(), orderPlacement: [0, null] };
    expect(isDraftComplete(q, partial)).toBe(false);
    expect(isDraftEmpty(q, partial)).toBe(false);
  });
});

describe('canSubmitDraft', () => {
  it('every variant is submittable empty by default', () => {
    for (const variant of [
      'pick_one',
      'pick_many',
      'type_answer',
      'type_pattern',
      'guess_letters',
      'order_items',
      'match_pairs',
      'group_items',
      'fill_blanks'
    ] as const) {
      const q = makeQuestion({ variant });
      expect(canSubmitDraft(q, blankDraft()), `${variant} should be skippable`).toBe(true);
    }
  });

  it('require_answer restores the completeness gate', () => {
    const q = makeQuestion({
      variant: 'type_answer',
      options: [textOption('paris', true)],
      settings: { require_answer: true }
    });
    expect(canSubmitDraft(q, blankDraft())).toBe(false);
    expect(canSubmitDraft(q, { ...blankDraft(), typedSingleAnswer: 'paris' })).toBe(true);
  });

  it('require_answer forces a pick even where "complete" would accept nothing', () => {
    // A choice question without min_answers is "complete" at zero selections, and guess_letters is
    // complete by definition — so require_answer has to mean non-empty too, or it gates nothing.
    const choice = makeQuestion({ variant: 'pick_one', settings: { require_answer: true } });
    expect(canSubmitDraft(choice, blankDraft())).toBe(false);
    expect(canSubmitDraft(choice, { ...blankDraft(), selected: new Set([0]) })).toBe(true);

    const letters = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('cat')],
      settings: { require_answer: true }
    });
    expect(canSubmitDraft(letters, blankDraft())).toBe(false);
    expect(
      canSubmitDraft(letters, {
        ...blankDraft(),
        guessedLetters: new Map([['c', 'correct' as const]])
      })
    ).toBe(true);
  });

  it('require_answer also enforces min_answers, which no longer gates on its own', () => {
    const lenient = makeQuestion({ variant: 'pick_many', settings: { min_answers: 2 } });
    expect(canSubmitDraft(lenient, { ...blankDraft(), selected: new Set([0]) })).toBe(true);

    const strict = makeQuestion({
      variant: 'pick_many',
      settings: { min_answers: 2, require_answer: true }
    });
    expect(canSubmitDraft(strict, { ...blankDraft(), selected: new Set([0]) })).toBe(false);
    expect(canSubmitDraft(strict, { ...blankDraft(), selected: new Set([0, 1]) })).toBe(true);
  });
});

describe('gradeDraft / questionMaxPoints', () => {
  it('dispatches to choice or typed grading based on variant', () => {
    const choiceQ = makeQuestion();
    const { result, answer } = gradeDraft(choiceQ, { ...blankDraft(), selected: new Set([0]) });
    expect(result).toEqual({ earned: 1, max: 1 });
    expect(answer.kind).toBe('choice');

    const typedQ = makeQuestion({
      variant: 'type_answer',
      options: [textOption('paris', true, 2)]
    });
    const typedResult = gradeDraft(typedQ, { ...blankDraft(), typedSingleAnswer: 'paris' });
    expect(typedResult.result).toEqual({ earned: 2, max: 2 });
    expect(typedResult.answer.kind).toBe('type_answer');

    const characterInputQ = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('cat')]
    });
    const ciDraft = { ...blankDraft(), guessedLetters: new Map([['c', 'correct' as const]]) };
    const ciResult = gradeDraft(characterInputQ, ciDraft);
    expect(ciResult.result).toEqual({ earned: 1, max: 3 });
    expect(ciResult.answer.kind).toBe('guess_letters');
  });

  it("questionMaxPoints matches a blank draft's max", () => {
    const q = makeQuestion({ options: [textOption('a', true, 3), textOption('b', false)] });
    expect(questionMaxPoints(q)).toBe(3);
  });
});

describe('buildPlayRun', () => {
  it('preserves every question when questions_per_run is not set', () => {
    const questions = [makeQuestion(), makeQuestion(), makeQuestion()];
    const run = buildPlayRun(questions, {});
    expect(run).toHaveLength(3);
  });

  it('caps the run at questions_per_run when the bank is larger', () => {
    const questions = [makeQuestion(), makeQuestion(), makeQuestion(), makeQuestion()];
    const run = buildPlayRun(questions, { questions_per_run: 2 });
    expect(run).toHaveLength(2);
  });

  it('option order is an untouched identity mapping unless the question opts into shuffle', () => {
    const q = makeQuestion({
      options: [textOption('a', true), textOption('b', false), textOption('c', false)]
    });
    const [{ optionOrder }] = buildPlayRun([q], { shuffle_questions: false });
    expect(optionOrder).toEqual([0, 1, 2]);
  });
});

describe('gradeRun', () => {
  it('wins by percent_to_win (default 75) when points_to_win is not set', () => {
    const settings: QuizScriptSettings = {};
    expect(gradeRun([{ earned: 3, max: 4 }], settings).won).toBe(true); // 75%
    expect(gradeRun([{ earned: 2, max: 4 }], settings).won).toBe(false); // 50%
  });

  it('an explicit points_to_win overrides the percentage threshold', () => {
    const settings: QuizScriptSettings = { points_to_win: 10 };
    expect(gradeRun([{ earned: 10, max: 100 }], settings).won).toBe(true);
    expect(gradeRun([{ earned: 9, max: 100 }], settings).won).toBe(false);
  });

  it('a zero-max run never wins and reports 0%', () => {
    const result = gradeRun([], {});
    expect(result).toEqual({ earned: 0, max: 0, percentage: 0, won: false });
  });
});

describe('locksOnSubmit', () => {
  it('locks when either reveal setting is live — including by default', () => {
    expect(locksOnSubmit({})).toBe(true);
    expect(locksOnSubmit({ reveal_answers: 'after_every_question', reveal_scores: 'at_end' })).toBe(
      true
    );
    expect(locksOnSubmit({ reveal_answers: 'never', reveal_scores: 'after_every_question' })).toBe(
      true
    );
  });

  it('leaves navigation free only when neither setting reveals anything live', () => {
    expect(locksOnSubmit({ reveal_answers: 'at_end', reveal_scores: 'at_end' })).toBe(false);
    expect(locksOnSubmit({ reveal_answers: 'never', reveal_scores: 'never' })).toBe(false);
    expect(locksOnSubmit({ reveal_answers: 'at_end', reveal_scores: 'never' })).toBe(false);
  });
});

describe('answerVerdict', () => {
  it('is correct at full marks, partial in between, incorrect at nothing', () => {
    expect(answerVerdict({ earned: 3, max: 3 })).toBe('correct');
    expect(answerVerdict({ earned: 2, max: 3 })).toBe('partial');
    expect(answerVerdict({ earned: 0, max: 3 })).toBe('incorrect');
  });

  it('a negative score (penalties, hint costs) still reads as incorrect', () => {
    expect(answerVerdict({ earned: -2, max: 3 })).toBe('incorrect');
  });

  it('a question with nothing to win reads as correct rather than as a failure', () => {
    expect(answerVerdict({ earned: 0, max: 0 })).toBe('correct');
  });

  it('a skipped question is its own verdict, not a wrong answer', () => {
    expect(answerVerdict({ earned: 0, max: 3 }, true)).toBe('skipped');
    // Same score, but the player actually answered — that distinction is the whole point.
    expect(answerVerdict({ earned: 0, max: 3 }, false)).toBe('incorrect');
  });

  it('a skipped question that cost hint points still reads as skipped', () => {
    expect(answerVerdict({ earned: -1, max: 3 }, true)).toBe('skipped');
  });

  it('skipping a nothing-to-win question reads as skipped rather than correct', () => {
    expect(answerVerdict({ earned: 0, max: 0 }, true)).toBe('skipped');
  });

  it('a blank response that genuinely scored keeps its score-based verdict', () => {
    // Reachable on type_pattern: a pattern like `.*` matches the empty string, so an unanswered
    // question can legitimately earn points. "Skipped" over a positive score would read as a bug.
    expect(answerVerdict({ earned: 3, max: 3 }, true)).toBe('correct');
    expect(answerVerdict({ earned: 1, max: 3 }, true)).toBe('partial');
  });
});

describe('draftFromAnswer', () => {
  // The property the end-of-run Review screen actually depends on: replaying a recorded answer
  // back through a draft must grade to exactly what was originally recorded, for every variant —
  // otherwise the review screen shows a different answer (or a different score) than the one the
  // player gave. Before `draftFromAnswer` existed, the review screen re-implemented this by hand
  // and only ever handled choice/typed.
  function roundTrips(question: QuizScriptQuestion, draft: QuestionDraft) {
    const original = gradeDraft(question, draft);
    const replayed = gradeDraft(question, draftFromAnswer(question, original.answer));
    expect(replayed.result).toEqual(original.result);
    expect(replayed.answer).toEqual(original.answer);
  }

  it('round-trips a choice answer', () => {
    roundTrips(makeQuestion(), { ...blankDraft(), selected: new Set([0]) });
  });

  it('round-trips a single-input typed answer', () => {
    const q = makeQuestion({ variant: 'type_answer', options: [textOption('paris', true)] });
    roundTrips(q, { ...blankDraft(), typedSingleAnswer: 'Paris' });
  });

  it('round-trips a boxes-mode typed answer, including its per-word box split', () => {
    const q = makeQuestion({
      variant: 'type_answer',
      options: [textOption('new york', true)],
      settings: { typed_input: 'boxes' }
    });
    const draft = { ...blankDraft(), boxChars: ['n', 'e', 'w', 'y', 'o', 'r', 'k'] };
    roundTrips(q, draft);
    expect(draftFromAnswer(q, gradeDraft(q, draft).answer).boxChars).toEqual([
      'n',
      'e',
      'w',
      'y',
      'o',
      'r',
      'k'
    ]);
  });

  it('round-trips a multi-guess typed answer', () => {
    const q = makeQuestion({
      variant: 'type_answer',
      options: [textOption('red', true), textOption('blue', true)],
      settings: { max_answers: 2 }
    });
    roundTrips(q, { ...blankDraft(), typedGuesses: ['red', 'green'] });
  });

  it('round-trips a guess_letters answer, pre-reveals included', () => {
    const q = makeQuestion({
      variant: 'guess_letters',
      options: [characterInputOption('cat', [0])]
    });
    roundTrips(q, {
      ...blankDraft(),
      guessedLetters: new Map([
        ['a', 'correct' as const],
        ['z', 'wrong' as const]
      ]),
      revealedPositions: new Set([0, 1])
    });
  });

  it('round-trips a partially-placed order answer without collapsing its empty slots', () => {
    const q = makeQuestion({
      variant: 'order_items',
      options: [textOption('first', true), textOption('second', true), textOption('third', true)],
      settings: { partial_credit: true }
    });
    // The regression this specifically guards: recording only the non-null entries turned
    // [null, 1, null] into [1], which replays as "option 1 placed in slot 0" — a wrong answer
    // scored as a right one.
    const draft = { ...blankDraft(), orderPlacement: [null, 1, null] };
    roundTrips(q, draft);
    expect(draftFromAnswer(q, gradeDraft(q, draft).answer).orderPlacement).toEqual([null, 1, null]);
  });

  it('round-trips a match answer', () => {
    const q = makeQuestion({
      variant: 'match_pairs',
      options: [matchOption('Paris', 'France'), matchOption('Tokyo', 'Japan')]
    });
    roundTrips(q, {
      ...blankDraft(),
      matchPairs: new Map([
        [0, 1],
        [1, 0]
      ])
    });
  });

  it('round-trips a group_items answer', () => {
    const q = makeQuestion({
      variant: 'group_items',
      options: [matchOption('Paris', 'Europe'), matchOption('Tokyo', 'Asia')]
    });
    roundTrips(q, {
      ...blankDraft(),
      categoriseAssignments: new Map([
        [0, 0],
        [1, 1]
      ])
    });
  });

  it('round-trips a fill_blanks answer', () => {
    const q = makeQuestion({
      variant: 'fill_blanks',
      text: 'The ___ is the powerhouse of the ___.',
      options: [
        blankOption('mitochondria', true),
        blankOption('cell', true),
        blankOption('nucleus', false)
      ]
    });
    roundTrips(q, { ...blankDraft(), blankAnswers: ['mitochondria', 'nucleus'] });
  });

  it('carries revealed hints across for every variant', () => {
    const q = makeQuestion({
      extras: [{ label: 'Hint', content: 'It rhymes with door', points: -1 }]
    });
    const draft = { ...blankDraft(), selected: new Set([0]), revealed: new Set([0]) };
    roundTrips(q, draft);
    expect(draftFromAnswer(q, gradeDraft(q, draft).answer).revealed).toEqual(new Set([0]));
  });
});

describe('answer_mode=type on order/match/group_items', () => {
  const typed = { answer_mode: 'type' };

  it('order_items: each slot expects the item authored at that position', () => {
    const q = makeQuestion({
      variant: 'order_items',
      options: [textOption('First', true), textOption('Second', true), textOption('Third', true)],
      settings: typed
    });
    expect(typedSlotExpectations(q)).toEqual(['First', 'Second', 'Third']);
    expect(gradeTypedSlotsQuestion(q, ['First', 'Second', 'Third'], new Set())).toEqual({
      earned: 3,
      max: 3
    });
    // Exact-match by default: two right and one wrong scores nothing.
    expect(gradeTypedSlotsQuestion(q, ['First', 'Third', 'Second'], new Set())).toEqual({
      earned: 0,
      max: 3
    });
  });

  it('match/group_items: each slot expects that item’s own target', () => {
    const m = makeQuestion({
      variant: 'match_pairs',
      options: [matchOption('Paris', 'France'), matchOption('Tokyo', 'Japan')],
      settings: typed
    });
    expect(typedSlotExpectations(m)).toEqual(['France', 'Japan']);
    expect(gradeTypedSlotsQuestion(m, ['France', 'Japan'], new Set())).toEqual({
      earned: 2,
      max: 2
    });

    const c = makeQuestion({
      variant: 'group_items',
      options: [matchOption('Fish', 'Water'), matchOption('Lion', 'Land')],
      settings: typed
    });
    expect(gradeTypedSlotsQuestion(c, ['Water', 'Land'], new Set())).toEqual({
      earned: 2,
      max: 2
    });
  });

  it('uses the same forgiving matching a typed question gets', () => {
    const q = makeQuestion({
      variant: 'group_items',
      options: [matchOption('Fish', 'Water')],
      settings: { ...typed, typo_tolerance: 40 }
    });
    // Case is ignored by default; the typo is inside the tolerance.
    expect(gradeTypedSlotsQuestion(q, ['watter'], new Set())).toEqual({ earned: 1, max: 1 });
  });

  it('an empty slot is never correct, and partial_credit scores the rest', () => {
    const q = makeQuestion({
      variant: 'match_pairs',
      options: [matchOption('Paris', 'France'), matchOption('Tokyo', 'Japan')],
      settings: { ...typed, partial_credit: true }
    });
    expect(typedSlotCorrectness(q, ['France', '  '])).toEqual([true, false]);
    expect(gradeTypedSlotsQuestion(q, ['France', '  '], new Set())).toEqual({
      earned: 1,
      max: 2
    });
  });

  it('gradeDraft routes the typed variants through blankAnswers and records typed_slots', () => {
    const q = makeQuestion({
      variant: 'order_items',
      options: [textOption('First', true), textOption('Second', true)],
      settings: typed
    });
    const draft = { ...blankDraft(), blankAnswers: ['First', 'Second'] };
    const { result, answer } = gradeDraft(q, draft);
    expect(result).toEqual({ earned: 2, max: 2 });
    expect(answer.kind).toBe('typed_slots');
    // And it round-trips back for the Review screen, same as every other variant.
    const replayed = gradeDraft(q, draftFromAnswer(q, answer));
    expect(replayed.result).toEqual(result);
  });

  it('is only submittable once every slot has something in it', () => {
    const q = makeQuestion({
      variant: 'group_items',
      options: [matchOption('Fish', 'Water'), matchOption('Lion', 'Land')],
      settings: typed
    });
    expect(isDraftComplete(q, { ...blankDraft(), blankAnswers: ['Water', ''] })).toBe(false);
    expect(isDraftComplete(q, { ...blankDraft(), blankAnswers: ['Water', 'Land'] })).toBe(true);
  });
});

describe('type_pattern grading', () => {
  function patternQuestion(
    options: QuizScriptOption[],
    settings: QuizScriptSettings = {}
  ): QuizScriptQuestion {
    return makeQuestion({ variant: 'type_pattern', options, settings });
  }

  describe('patternMatches', () => {
    it('is implicitly anchored — a pattern matches the whole response, not a substring', () => {
      expect(patternMatches('cat', 'cat', {})).toBe(true);
      expect(patternMatches('cat', 'concatenate', {})).toBe(false);
      // ...and an author who genuinely wants a substring can still say so.
      expect(patternMatches('.*cat.*', 'concatenate', {})).toBe(true);
    });

    it('anchors alternation as a whole, not just its first and last branch', () => {
      expect(patternMatches('cat|dog', 'dog', {})).toBe(true);
      expect(patternMatches('cat|dog', 'hotdog', {})).toBe(false);
    });

    it('is case-insensitive unless match_case says otherwise', () => {
      expect(patternMatches('paris', 'PARIS', {})).toBe(true);
      expect(patternMatches('paris', 'PARIS', { match_case: true })).toBe(false);
    });

    it('trims the response but preserves the characters a pattern is written to match', () => {
      expect(patternMatches('[0-9]+\\.[0-9]+', '  3.14  ', {})).toBe(true);
      // Punctuation-stripping normalization would have destroyed this one.
      expect(patternMatches('[0-9]+\\.[0-9]+', '314', {})).toBe(false);
    });

    it('treats an uncompilable pattern as simply not matching, rather than throwing', () => {
      expect(patternMatches('(unclosed', 'anything', {})).toBe(false);
    });
  });

  describe('matchedPatternIndex', () => {
    it('lets a wrong pattern win over a correct one it overlaps', () => {
      // "anything except Paris" — the whole point of the `~` pattern is to carve an exception out
      // of the broad `=` one, so resolving the other way would make it dead.
      const question = patternQuestion([textOption('.+', true), textOption('[Pp]aris', false)]);
      expect(matchedPatternIndex(question, 'Paris')).toBe(1);
      expect(matchedPatternIndex(question, 'Lyon')).toBe(0);
    });

    it('returns null when nothing matches', () => {
      const question = patternQuestion([textOption('[0-9]+', true)]);
      expect(matchedPatternIndex(question, 'abc')).toBeNull();
    });
  });

  it('awards the matched correct pattern its points', () => {
    const question = patternQuestion([textOption('[0-9]{4}', true)], { points_correct: 3 });
    expect(gradeTypePatternQuestion(question, '1999', new Set())).toEqual({ earned: 3, max: 3 });
  });

  it('awards nothing for a response that matches no pattern at all', () => {
    const question = patternQuestion([textOption('[0-9]{4}', true)], { points_correct: 3 });
    expect(gradeTypePatternQuestion(question, 'nope', new Set())).toEqual({ earned: 0, max: 3 });
  });

  it("applies a wrong pattern's own penalty when one matches", () => {
    const question = patternQuestion(
      [textOption('[0-9]{4}', true), textOption('19[0-9]{2}', false, -2)],
      {
        points_correct: 3
      }
    );
    expect(gradeTypePatternQuestion(question, '1999', new Set())).toEqual({ earned: -2, max: 3 });
  });

  it('maxes at the best single correct pattern, not the sum — only one ever resolves', () => {
    const question = patternQuestion([textOption('a+', true, 5), textOption('b+', true, 2)]);
    expect(gradeTypePatternQuestion(question, 'aaa', new Set()).max).toBe(5);
  });

  it('round-trips through gradeDraft and draftFromAnswer', () => {
    const question = patternQuestion([textOption('[0-9]{4}', true)]);
    const draft: QuestionDraft = { ...blankDraft(), typedSingleAnswer: '2026' };
    const { result, answer } = gradeDraft(question, draft);
    expect(result.earned).toBe(1);
    expect(answer).toEqual({ kind: 'type_pattern', response: '2026', revealed: new Set() });
    expect(draftFromAnswer(question, answer).typedSingleAnswer).toBe('2026');
  });

  it('counts as answered once anything has been typed', () => {
    const question = patternQuestion([textOption('.+', true)]);
    expect(isDraftComplete(question, { ...blankDraft(), typedSingleAnswer: '' })).toBe(false);
    expect(isDraftComplete(question, { ...blankDraft(), typedSingleAnswer: 'x' })).toBe(true);
  });
});
