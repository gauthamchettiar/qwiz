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
  effectivePoints,
  gradeCharacterInputQuestion,
  gradeDraft,
  gradeQuestion,
  gradeRun,
  gradeTypedQuestion,
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

describe('characterInputLetterInAnswer / characterInputNormalizeGuess', () => {
  it('is case-insensitive by default', () => {
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('Paris')]
    });
    expect(characterInputLetterInAnswer(q, 'P')).toBe(true);
    expect(characterInputLetterInAnswer(q, 'p')).toBe(true);
    expect(characterInputLetterInAnswer(q, 'z')).toBe(false);
  });

  it('respects case_sensitive', () => {
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('Paris')],
      settings: { case_sensitive: true }
    });
    expect(characterInputLetterInAnswer(q, 'P')).toBe(true);
    expect(characterInputLetterInAnswer(q, 'p')).toBe(false);
    expect(characterInputNormalizeGuess(q, 'P')).toBe('P');
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
  it('reveal_mode=all reveals every occurrence at once', () => {
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('letter')]
    });
    const revealed = characterInputRevealPositionsAfterGuess(q, new Set(), 'e');
    expect(revealed).toEqual(new Set([1, 4])); // "letter" -> e at indices 1 and 4
    expect(characterInputLetterFullyRevealed(q, revealed, 'e')).toBe(true);
  });

  it('reveal_mode=sequence reveals one occurrence per guess, in order', () => {
    const q = makeQuestion({
      variant: 'character_input',
      options: [characterInputOption('letter')],
      settings: { reveal_mode: 'sequence' }
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
