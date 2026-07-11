import type { ContentBlock } from '../../types';
import type { GradeResult, QuestionTypeDefinition } from '../types';
import { genId } from '../shared';
import { Keyboard } from '@lucide/svelte';
import { contentBlockSchema, promptExtraSchema } from '../optionSchema';
import { type PromptExtra } from '../multiple';
import Editor from './Editor.svelte';
import Player from './Player.svelte';
import AnswerSummary from './AnswerSummary.svelte';
import Preview from './Preview.svelte';

export type { PromptExtra };

/** How the player enters answers:
 *  - single:          one input, checked against the accepted answers.
 *  - multi:           type + Enter to bank a guess, repeat until guesses run out; graded at the end.
 *  - multi-realtime:  same as multi, but each banked guess is marked right/wrong immediately. */
export type TypedMode = 'single' | 'multi' | 'multi-realtime';
/** Single-mode only: a plain text field, or one box per character (which reveals the length). */
export type TypedInputStyle = 'text' | 'boxes';
/** Multi modes: whether wrong guesses cost points, or are simply ignored. */
export type TypedGrading = 'correct-only' | 'penalize';

export interface TypedAnswer {
  id: string;
  text: string;
  points: number;
}

export interface TypedData {
  prompt: ContentBlock;
  extras: PromptExtra[];
  mode: TypedMode;
  /** Only meaningful for mode 'single'. */
  inputStyle: TypedInputStyle;
  /** Accepted answers. Single mode usually has one (plus optional synonyms); multi modes list
   * every answer the player can find. Each carries its own points. */
  answers: TypedAnswer[];
  /** Multi modes: how many guesses the player gets. null = one per accepted answer. */
  maxGuesses: number | null;
  /** Multi modes: how wrong guesses are treated. */
  grading: TypedGrading;
  /** Multi modes with grading 'penalize': points deducted per wrong guess. */
  wrongPenalty: number;
  /** Practice/trial question: answerable but never scored. */
  ungraded: boolean;
}

export interface TypedResponse {
  value: string; // single mode
  guesses: string[]; // multi modes
  revealedExtras?: string[];
}

export type TypedFocusTarget =
  | { field: 'prompt' }
  | { field: 'answer'; answerId: string }
  | { field: 'extra'; extraId: string };

const MAX_ANSWERS = 50;

/** Case-insensitive, whitespace-collapsed comparison key for free-text answers. */
export function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
/** Comparison key for boxed input — also drops all whitespace, since boxes hold single chars. */
export function normNoSpace(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

/** Number of character boxes to show in single/boxed mode: the length of the first accepted
 * answer with whitespace removed. 0 when there's no answer text yet. */
export function boxCount(data: TypedData): number {
  return normNoSpace(data.answers[0]?.text ?? '').length;
}

/** Effective guess budget for the multi modes. */
export function guessBudget(data: TypedData): number {
  return data.maxGuesses ?? data.answers.length;
}

export function blankAnswer(points = 10): TypedAnswer {
  return { id: genId(), text: '', points };
}

/** Does a single-mode typed value match any accepted answer? Used by the player and summary. */
export function matchesSingle(data: TypedData, value: string): TypedAnswer | null {
  const cmp = data.inputStyle === 'boxes' ? normNoSpace : norm;
  const key = cmp(value);
  if (!key) return null;
  return data.answers.find((a) => cmp(a.text) === key) ?? null;
}

/** For a multi-mode guess, the accepted answer it matches (regardless of whether it's already
 * been found), or null if it's simply wrong. */
export function matchGuess(data: TypedData, guess: string): TypedAnswer | null {
  const key = norm(guess);
  if (!key) return null;
  return data.answers.find((a) => norm(a.text) === key) ?? null;
}

const typedAnswerSchema = {
  type: 'object',
  required: ['id', 'text', 'points'],
  properties: {
    id: { type: 'string', minLength: 1 },
    text: { type: 'string' },
    points: { type: 'number' }
  },
  additionalProperties: false
};

const typedDataSchema = {
  type: 'object',
  required: ['prompt', 'extras', 'mode', 'inputStyle', 'answers', 'maxGuesses', 'grading', 'wrongPenalty', 'ungraded'],
  properties: {
    prompt: contentBlockSchema,
    extras: { type: 'array', items: promptExtraSchema },
    mode: { enum: ['single', 'multi', 'multi-realtime'] },
    inputStyle: { enum: ['text', 'boxes'] },
    answers: { type: 'array', minItems: 1, maxItems: MAX_ANSWERS, items: typedAnswerSchema },
    maxGuesses: { type: ['number', 'null'], minimum: 1 },
    grading: { enum: ['correct-only', 'penalize'] },
    wrongPenalty: { type: 'number' },
    ungraded: { type: 'boolean' }
  },
  additionalProperties: false
};

export const typedType: QuestionTypeDefinition<TypedData, TypedResponse> = {
  type: 'typed',
  label: 'Typed',
  description: 'Player types their answer(s). One input matched against accepted answers, or several guesses to find them all.',
  icon: Keyboard,

  createDefault(): TypedData {
    return {
      prompt: { kind: 'text', text: '' },
      extras: [],
      mode: 'single',
      inputStyle: 'text',
      answers: [blankAnswer()],
      maxGuesses: null,
      grading: 'correct-only',
      wrongPenalty: 0,
      ungraded: false
    };
  },

  defaultFocusTarget(): TypedFocusTarget {
    return { field: 'prompt' };
  },

  isUngraded(data): boolean {
    return data.ungraded === true;
  },

  grade(data, response): GradeResult {
    if (data.ungraded) return { earned: 0, max: 0 };

    // Reveal-extra hint penalties, same contract as the choice types.
    const revealExtras = data.extras.filter((e) => e.kind === 'reveal');
    const revealed = response?.revealedExtras ?? [];
    const extraPenalty = revealExtras.filter((e) => revealed.includes(e.id)).reduce((s, e) => s + (e.points ?? 0), 0);
    const extraMax = revealExtras.reduce((s, e) => s + Math.max(e.points ?? 0, 0), 0);

    if (data.mode === 'single') {
      const match = matchesSingle(data, response?.value ?? '');
      const earned = match ? match.points : 0;
      const max = data.answers.reduce((m, a) => Math.max(m, a.points), 0);
      return { earned: earned + extraPenalty, max: Math.max(max, 0) + extraMax };
    }

    // multi / multi-realtime: each accepted answer can be found once; wrong guesses may penalize.
    const guesses = response?.guesses ?? [];
    const found = new Set<string>();
    let earned = 0;
    let wrong = 0;
    for (const g of guesses) {
      const a = matchGuess(data, g);
      if (a && !found.has(a.id)) {
        earned += a.points;
        found.add(a.id);
      } else if (!a && norm(g) !== '') {
        wrong += 1; // truly wrong (a repeated correct guess is neither scored again nor penalized)
      }
    }
    if (data.grading === 'penalize') earned -= wrong * data.wrongPenalty;
    const max = data.answers.reduce((s, a) => s + Math.max(a.points, 0), 0);
    return { earned: earned + extraPenalty, max: max + extraMax };
  },

  Editor,
  Player,
  AnswerSummary,
  Preview,
  dataSchema: typedDataSchema
};
