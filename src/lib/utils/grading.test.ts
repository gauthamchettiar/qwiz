import { describe, expect, it } from 'vitest';
import type { QuizScriptOption, QuizScriptQuestion, QuizScriptSettings } from './quizScript';
import {
  blankDraft,
  boxAnswer,
  characterInputLetterBank,
  characterInputLetterFullyRevealed,
  characterInputLetterInAnswer,
  characterInputNormalizeGuess,
  characterInputPrerevealedPositions,
  characterInputRevealPositionsAfterGuess,
  choiceOptionsLayoutClass,
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
  isDraftComplete,
  isTypedMatch,
  levenshteinDistance,
  matchTypedGuesses,
  normalizeTypedAnswer,
  questionMaxPoints,
  resolveExtraPrereveal,
  settingBoolean,
  settingNumber,
  settingString,
  typedBoxCount,
  typedBoxGroups,
  typedSingleAnswerMatches,
  buildPlayRun
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
    expect(effectivePoints({ correct: true, points: undefined }, { point: 3 })).toBe(3);
    expect(effectivePoints({ correct: false, points: undefined }, { penalty: -1 })).toBe(-1);
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

  it('partial_points mode: each selected option scores independently', () => {
    const q = makeQuestion({
      options: [textOption('a', true, 2), textOption('b', true, 3), textOption('c', false, -1)],
      settings: { partial_points: true }
    });
    expect(gradeQuestion(q, new Set([0]), new Set())).toEqual({ earned: 2, max: 5 });
    expect(gradeQuestion(q, new Set([2]), new Set())).toEqual({ earned: -1, max: 5 });
  });

  it('partial_points mode caps the achievable max at max_answers', () => {
    const q = makeQuestion({
      options: [textOption('a', true, 1), textOption('b', true, 1), textOption('c', true, 1)],
      settings: { partial_points: true, max_answers: 2 }
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
  it('defaults to a one-per-row list when option_display is unset', () => {
    const q = makeQuestion();
    expect(choiceOptionsLayoutClass(q)).toBe('space-y-2');
  });

  it('grid2x2 is a fixed 2-column grid', () => {
    const q = makeQuestion({ settings: { option_display: 'grid2x2' } });
    expect(choiceOptionsLayoutClass(q)).toBe('grid grid-cols-2 gap-2');
  });

  it('grid3x3 is 2 columns on narrow screens, 3 on wider ones', () => {
    const q = makeQuestion({ settings: { option_display: 'grid3x3' } });
    expect(choiceOptionsLayoutClass(q)).toBe('grid grid-cols-2 sm:grid-cols-3 gap-2');
  });

  it('option_display=list is the same as unset', () => {
    const q = makeQuestion({ settings: { option_display: 'list' } });
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

  it('respects case_sensitive', () => {
    expect(normalizeTypedAnswer('Paris', { case_sensitive: true })).toBe('Paris');
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

  it('numeric_tolerance allows an approximate numeric match', () => {
    expect(isTypedMatch('3.4', '3', { numeric_tolerance: 0.5 })).toBe(true);
    expect(isTypedMatch('3.6', '3', { numeric_tolerance: 0.5 })).toBe(false);
  });

  it('numeric_tolerance falls back to text comparison when either side is not numeric', () => {
    expect(isTypedMatch('three', 'three', { numeric_tolerance: 0.5 })).toBe(true);
  });

  it('fuzzy_tolerance allows a bounded edit distance as a percentage of answer length', () => {
    // "pari" vs "paris": edit distance 1, allowed = round(20% * 5) = 1
    expect(isTypedMatch('pari', 'paris', { fuzzy_tolerance: 20 })).toBe(true);
    expect(isTypedMatch('pa', 'paris', { fuzzy_tolerance: 20 })).toBe(false);
  });

  it('case_sensitive changes what fuzzy_tolerance actually compares — case differences count as edit distance', () => {
    // "PARIS" vs "Paris": identical case-insensitively (distance 0), but every letter differs in
    // case once case_sensitive is on (distance 4) — enough to fall outside a 20% tolerance (1).
    expect(isTypedMatch('PARIS', 'Paris', { fuzzy_tolerance: 20 })).toBe(true);
    expect(isTypedMatch('PARIS', 'Paris', { case_sensitive: true, fuzzy_tolerance: 20 })).toBe(
      false
    );
  });

  it('numeric_tolerance ignores case_sensitive entirely — numbers have no case', () => {
    expect(isTypedMatch('3', '3', { numeric_tolerance: 0.5, case_sensitive: true })).toBe(true);
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
      variant: 'typed',
      options: [textOption('paris', true, 5), textOption('lyon', true, 1)]
    });
    expect(gradeTypedQuestion(q, 'paris', new Set())).toEqual({ earned: 5, max: 5 });
    expect(gradeTypedQuestion(q, 'nope', new Set())).toEqual({ earned: 0, max: 5 });
  });

  it('multi-guess exact mode requires every accepted answer matched with zero wrong guesses', () => {
    const q = makeQuestion({
      variant: 'typed',
      options: [textOption('paris', true, 2), textOption('lyon', true, 3)],
      settings: { max_answers: 2 }
    });
    expect(gradeTypedQuestion(q, ['paris', 'lyon'], new Set())).toEqual({ earned: 5, max: 5 });
    expect(gradeTypedQuestion(q, ['paris', 'nope'], new Set())).toEqual({ earned: 0, max: 5 });
  });

  it('multi-guess partial mode sums matched points and applies the wrong-guess penalty', () => {
    const q = makeQuestion({
      variant: 'typed',
      options: [textOption('paris', true, 2), textOption('lyon', true, 3)],
      settings: { max_answers: 2, partial_points: true, penalty: -1 }
    });
    expect(gradeTypedQuestion(q, ['paris', 'nope'], new Set())).toEqual({ earned: 1, max: 5 });
  });
});

describe('typedBoxGroups / typedBoxCount', () => {
  it('splits the first accepted answer into per-word character counts', () => {
    const q = makeQuestion({ variant: 'typed', options: [textOption('new york', true)] });
    expect(typedBoxGroups(q)).toEqual([3, 4]);
    expect(typedBoxCount(q)).toBe(7);
  });

  it('returns an empty shape when there is no text-based accepted answer', () => {
    const q = makeQuestion({ variant: 'typed', options: [] });
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
      variant: 'character_input',
      options: [characterInputOption('Paris', [0])]
    });
    const result = gradeCharacterInputQuestion(q, blankDraft());
    expect(result).toEqual({ earned: 0, max: 4 });
  });

  it('awards point once per distinct correctly-guessed letter, not per occurrence', () => {
    // "letter" -> distinct guessable letters l,e,t,r (4); "e" appears twice.
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('letter')]
    });
    const draft = { ...blankDraft(), guessedLetters: new Map([['e', 'correct' as const]]) };
    expect(gradeCharacterInputQuestion(q, draft)).toEqual({ earned: 1, max: 4 });
  });

  it('applies penalty per wrong guess', () => {
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('cat')],
      settings: { penalty: -2 }
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
      variant: 'character_input',
      options: [characterInputOption('new york')]
    });
    // distinct guessable letters: n,e,w,y,o,r,k -> 7 (the space is excluded).
    expect(gradeCharacterInputQuestion(q, blankDraft()).max).toBe(7);
  });

  it("extraPrerevealed (prereveal_count's resolved picks) also excludes from earned/max", () => {
    const q = makeQuestion({ variant: 'character_input', options: [characterInputOption('cat')] });
    const draft = { ...blankDraft(), extraPrerevealed: new Set([0]) }; // pre-reveals "c"
    expect(gradeCharacterInputQuestion(q, draft).max).toBe(2); // a, t only
  });
});

describe('gradeOrderQuestion', () => {
  const q = makeQuestion({
    variant: 'order',
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

  it('partial_points: each correctly-placed slot scores independently', () => {
    const partial = makeQuestion({
      variant: 'order',
      options: q.options,
      settings: { partial_points: true }
    });
    expect(gradeOrderQuestion(partial, [0, 2, 1], new Set())).toEqual({ earned: 1, max: 3 });
  });

  it('respects per-option %N% weights and the question default point/penalty', () => {
    const weighted = makeQuestion({
      variant: 'order',
      options: [textOption('First', true, 5), textOption('Second', true)],
      settings: { point: 2, partial_points: true }
    });
    // slot 0 correct (weight 5), slot 1 wrong (point default 2, not earned).
    expect(gradeOrderQuestion(weighted, [0, null], new Set())).toEqual({ earned: 5, max: 7 });
  });
});

function matchOption(text: string, target: string, points?: number): QuizScriptOption {
  return { content: { kind: 'text', text }, correct: true, target, points };
}

describe('gradeMatchQuestion', () => {
  const q = makeQuestion({
    variant: 'match',
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

  it('partial_points: each correct pair scores independently', () => {
    const partial = makeQuestion({
      variant: 'match',
      options: q.options,
      settings: { partial_points: true }
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
    variant: 'categorise',
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

  it('partial_points: each correctly-bucketed item scores independently', () => {
    const partial = makeQuestion({
      variant: 'categorise',
      options: q.options,
      settings: { partial_points: true }
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
    variant: 'fill_in_blanks',
    text: 'The ___ is the powerhouse of the ___.',
    options: [
      blankOption('mitochondria', true),
      blankOption('cell', true),
      blankOption('nucleus', false)
    ]
  });

  it('bank mode (default): exact bank-word matches score full credit', () => {
    expect(gradeFillInBlanksQuestion(q, ['mitochondria', 'cell'], new Set())).toEqual({
      earned: 2,
      max: 2
    });
  });

  it('bank mode: an empty or wrong blank fails exact match entirely', () => {
    expect(gradeFillInBlanksQuestion(q, ['mitochondria', ''], new Set())).toEqual({
      earned: 0,
      max: 2
    });
    expect(gradeFillInBlanksQuestion(q, ['nucleus', 'cell'], new Set())).toEqual({
      earned: 0,
      max: 2
    });
  });

  it('partial_points: each correct blank scores independently', () => {
    const partial = makeQuestion({
      variant: 'fill_in_blanks',
      text: q.text,
      options: q.options,
      settings: { partial_points: true }
    });
    expect(gradeFillInBlanksQuestion(partial, ['mitochondria', ''], new Set())).toEqual({
      earned: 1,
      max: 2
    });
  });

  it('type mode: typed matching (normalization/case) applies, unlike bank mode', () => {
    const typedMode = makeQuestion({
      variant: 'fill_in_blanks',
      text: q.text,
      options: q.options,
      settings: { blank_input: 'type' }
    });
    expect(gradeFillInBlanksQuestion(typedMode, ['  MITOCHONDRIA ', 'Cell'], new Set())).toEqual({
      earned: 2,
      max: 2
    });
  });

  it('type mode: fuzzy_tolerance forgives a typo, same as a typed question', () => {
    const fuzzy = makeQuestion({
      variant: 'fill_in_blanks',
      text: q.text,
      options: q.options,
      settings: { blank_input: 'type', fuzzy_tolerance: 20 }
    });
    expect(gradeFillInBlanksQuestion(fuzzy, ['mitochondri', 'cell'], new Set())).toEqual({
      earned: 2,
      max: 2
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
      variant: 'categorise',
      options: [
        { content: { kind: 'text', text: 'Fish' }, correct: true, target: 'Water' },
        { content: { kind: 'text', text: 'Frog' }, correct: true, target: 'Water' },
        { content: { kind: 'text', text: 'Lion' }, correct: true, target: 'Land' }
      ]
    });
    expect(categoriseBuckets(q)).toEqual(['Water', 'Land']);
  });
});

describe('characterInputLetterInAnswer / characterInputNormalizeGuess', () => {
  it('is always case-insensitive — a bank guess has no "wrong case" to compare', () => {
    const q = makeQuestion({
      variant: 'character_input',
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
    const q = makeQuestion({ variant: 'character_input', options: [characterInputOption('cat')] });
    expect(characterInputLetterBank(q)).toHaveLength(26);
  });

  it('fixed mode offers exactly the configured letters', () => {
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('cat')],
      settings: { letter_bank: 'fixed', letter_bank_chars: 'cta' }
    });
    expect(characterInputLetterBank(q)).toEqual(['a', 'c', 't']);
  });

  it('auto mode includes every answer letter plus some decoys not in the answer', () => {
    const q = makeQuestion({
      variant: 'character_input',
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
  it('prereveal_mode=all reveals every occurrence at once', () => {
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('letter')]
    });
    const revealed = characterInputRevealPositionsAfterGuess(q, new Set(), 'e');
    expect(revealed).toEqual(new Set([1, 4])); // "letter" -> e at indices 1 and 4
    expect(characterInputLetterFullyRevealed(q, revealed, 'e')).toBe(true);
  });

  it('prereveal_mode=sequence reveals one occurrence per guess, in order', () => {
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('letter')],
      settings: { prereveal_mode: 'sequence' }
    });
    const first = characterInputRevealPositionsAfterGuess(q, new Set(), 'e');
    expect(first).toEqual(new Set([1]));
    expect(characterInputLetterFullyRevealed(q, first, 'e')).toBe(false);
    const second = characterInputRevealPositionsAfterGuess(q, first, 'e');
    expect(second).toEqual(new Set([1, 4]));
    expect(characterInputLetterFullyRevealed(q, second, 'e')).toBe(true);
  });

  it('is a no-op once every occurrence is already revealed', () => {
    const q = makeQuestion({ variant: 'character_input', options: [characterInputOption('cat')] });
    const revealed = new Set([0]);
    expect(characterInputRevealPositionsAfterGuess(q, revealed, 'c')).toEqual(revealed);
  });

  it('a letter that is entirely pre-revealed reads as fully revealed even with no guess at all', () => {
    // This is what QuestionPlayer.svelte's bank-button disabling relies on to disable a
    // pre-revealed letter from the very first render, before the player has clicked anything —
    // `revealedPositions` starts out equal to the pre-reveal set, so this check doesn't need to
    // know or care whether a letter was ever actually guessed.
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('cat', [0])] // "c" pre-revealed
    });
    const initialRevealed = characterInputPrerevealedPositions(q, new Set());
    expect(characterInputLetterFullyRevealed(q, initialRevealed, 'c')).toBe(true);
  });

  it('a letter that never appears in the answer at all is NOT "fully revealed"', () => {
    // Regression test: an empty occurrence list would make `.every(...)` vacuously true, which
    // would wrongly read as "fully revealed" for every letter not in the word — pre-disabling
    // the entire rest of the bank instead of leaving it genuinely guessable.
    const q = makeQuestion({ variant: 'character_input', options: [characterInputOption('cat')] });
    expect(characterInputLetterFullyRevealed(q, new Set(), 'z')).toBe(false);
  });
});

describe('characterInputPrerevealedPositions', () => {
  it('unions explicit bracket positions with the resolved extra pre-reveal set', () => {
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('Paris', [0])]
    });
    expect(characterInputPrerevealedPositions(q, new Set([2]))).toEqual(new Set([0, 2]));
  });
});

describe('resolveExtraPrereveal', () => {
  it('resolves exactly prereveal_count positions, excluding bracket-marked ones', () => {
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('Paris', [0])],
      settings: { prereveal_count: 2 }
    });
    const extra = resolveExtraPrereveal(q);
    expect(extra.size).toBe(2);
    expect(extra.has(0)).toBe(false); // already bracket-marked, never re-picked
  });

  it('defaults to nothing when prereveal_count is not set', () => {
    const q = makeQuestion({
      variant: 'character_input',
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
    const q = makeQuestion({ variant: 'typed', options: [textOption('paris', true)] });
    expect(isDraftComplete(q, { ...blankDraft(), typedSingleAnswer: '  ' })).toBe(false);
    expect(isDraftComplete(q, { ...blankDraft(), typedSingleAnswer: 'paris' })).toBe(true);
  });

  it('a boxes-mode typed draft needs every box filled', () => {
    const q = makeQuestion({
      variant: 'typed',
      options: [textOption('ab', true)],
      settings: { input_display: 'boxes' }
    });
    expect(isDraftComplete(q, { ...blankDraft(), boxChars: ['a', ''] })).toBe(false);
    expect(isDraftComplete(q, { ...blankDraft(), boxChars: ['a', 'b'] })).toBe(true);
  });

  it('a character_input draft is always complete — submittable at any point, like giving up mid-Hangman', () => {
    const q = makeQuestion({ variant: 'character_input', options: [characterInputOption('cat')] });
    expect(isDraftComplete(q, blankDraft())).toBe(true);
  });
});

describe('gradeDraft / questionMaxPoints', () => {
  it('dispatches to choice or typed grading based on variant', () => {
    const choiceQ = makeQuestion();
    const { result, answer } = gradeDraft(choiceQ, { ...blankDraft(), selected: new Set([0]) });
    expect(result).toEqual({ earned: 1, max: 1 });
    expect(answer.kind).toBe('choice');

    const typedQ = makeQuestion({ variant: 'typed', options: [textOption('paris', true, 2)] });
    const typedResult = gradeDraft(typedQ, { ...blankDraft(), typedSingleAnswer: 'paris' });
    expect(typedResult.result).toEqual({ earned: 2, max: 2 });
    expect(typedResult.answer.kind).toBe('typed');

    const characterInputQ = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('cat')]
    });
    const ciDraft = { ...blankDraft(), guessedLetters: new Map([['c', 'correct' as const]]) };
    const ciResult = gradeDraft(characterInputQ, ciDraft);
    expect(ciResult.result).toEqual({ earned: 1, max: 3 });
    expect(ciResult.answer.kind).toBe('character_input');
  });

  it("questionMaxPoints matches a blank draft's max", () => {
    const q = makeQuestion({ options: [textOption('a', true, 3), textOption('b', false)] });
    expect(questionMaxPoints(q)).toBe(3);
  });
});

describe('buildPlayRun', () => {
  it('preserves every question when max_questions is not set', () => {
    const questions = [makeQuestion(), makeQuestion(), makeQuestion()];
    const run = buildPlayRun(questions, {});
    expect(run).toHaveLength(3);
  });

  it('caps the run at max_questions when the bank is larger', () => {
    const questions = [makeQuestion(), makeQuestion(), makeQuestion(), makeQuestion()];
    const run = buildPlayRun(questions, { max_questions: 2 });
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
  it('wins by percentage_points_to_win (default 75) when points_to_win is not set', () => {
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
