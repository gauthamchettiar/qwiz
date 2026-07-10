import type { ContentBlock } from '../../types';
import type { GradeResult, QuestionTypeDefinition } from '../types';
import { genId, isContentBlockFilled } from '../shared';
import { matchLinkedInputs } from './linking';
import { shuffledArray } from '../../shuffle';
import Editor from './Editor.svelte';
import Player from './Player.svelte';
import AnswerSummary from './AnswerSummary.svelte';
import Preview from './Preview.svelte';

export type ChoiceVariant = 'single-one' | 'single-graded' | 'multiple-many' | 'multiple-graded';
export type OptionKind = 'text' | 'image' | 'video' | 'input' | 'reveal';
export type PromptExtraKind = 'text' | 'image' | 'video' | 'reveal';

export interface ChoiceOption {
  id: string;
  kind: OptionKind;
  content?: ContentBlock; // text/image/video kinds
  label?: string; // input kind (box label) / reveal kind (button label)
  validAnswers?: string[]; // input kind
  revealContent?: ContentBlock; // reveal kind
  correct: boolean; // used by single-one & multiple-many
  points: number; // used by single-graded & multiple-graded
}

export interface PromptExtra {
  id: string;
  kind: PromptExtraKind;
  content?: ContentBlock; // text/image/video kinds
  label?: string; // reveal kind
  revealContent?: ContentBlock; // reveal kind
}

export type OptionDisplayMode = 'list' | 'grid-2' | 'grid-3' | 'grid-4';

export interface ChoiceData {
  variant: ChoiceVariant;
  prompt: ContentBlock;
  extras: PromptExtra[];
  options: ChoiceOption[];
  questionPoints: number; // used by single-one & multiple-many
  /** Links every Input-kind option into one group graded as a set (see linking.ts). Only meaningful for multiple-* variants with 2+ Input options. */
  linkedInputs?: boolean;
  /** How answer options are laid out in the player. Purely presentational. */
  displayMode?: OptionDisplayMode;
  /** Randomize this question's option order each time it's played. */
  shuffleOptions?: boolean;
}

export interface ChoiceResponse {
  selected: string[]; // clicked option ids (text/image/video/reveal kinds)
  typed: Record<string, string>; // option id -> typed text (input kind)
}

/** This type's own focus-target shape for the Preview -> Editor click-to-edit flow. */
export type ChoiceFocusTarget = { field: 'prompt' } | { field: 'option'; optionId: string };

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 25;

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}

function blankContent(kind: 'text' | 'image' | 'video'): ContentBlock {
  if (kind === 'text') return { kind: 'text', text: '' };
  if (kind === 'image') return { kind: 'image', url: '', alt: '' };
  return { kind: 'video', videoId: '' };
}

export function blankOption(kind: OptionKind = 'text', points = 0): ChoiceOption {
  return {
    id: genId(),
    kind,
    content: kind === 'text' || kind === 'image' || kind === 'video' ? blankContent(kind) : undefined,
    label: kind === 'input' || kind === 'reveal' ? '' : undefined,
    validAnswers: kind === 'input' ? [''] : undefined,
    revealContent: kind === 'reveal' ? { kind: 'text', text: '' } : undefined,
    correct: false,
    points
  };
}

export function blankExtra(kind: PromptExtraKind): PromptExtra {
  return {
    id: genId(),
    kind,
    content: kind === 'reveal' ? undefined : blankContent(kind),
    label: kind === 'reveal' ? '' : undefined,
    revealContent: kind === 'reveal' ? { kind: 'text', text: '' } : undefined
  };
}

function isOptionFilled(option: ChoiceOption): boolean {
  if (option.kind === 'input') return (option.validAnswers ?? []).some((a) => a.trim().length > 0);
  if (option.kind === 'reveal') return !!option.revealContent && isContentBlockFilled(option.revealContent);
  return !!option.content && isContentBlockFilled(option.content);
}

function isExtraFilled(extra: PromptExtra): boolean {
  if (extra.kind === 'reveal') return !!extra.revealContent && isContentBlockFilled(extra.revealContent);
  return !!extra.content && isContentBlockFilled(extra.content);
}

/** An option counts as "chosen" whether the player clicked it or, for Input options, typed a matching answer. */
export function isChosen(option: ChoiceOption, response: ChoiceResponse): boolean {
  if (option.kind === 'input') {
    const typed = normalizeAnswer(response.typed?.[option.id] ?? '');
    if (!typed) return false;
    return (option.validAnswers ?? []).map(normalizeAnswer).includes(typed);
  }
  return (response.selected ?? []).includes(option.id);
}

/**
 * Which Input-kind options count as correctly answered, accounting for the `linkedInputs`
 * matching (see linking.ts) when it applies. Shared by grade() and AnswerSummary so both
 * agree on what "correct" means for a given box.
 */
export function matchedInputIds(data: ChoiceData, response: ChoiceResponse): Set<string> {
  const inputOptions = data.options.filter((o) => o.kind === 'input');
  const isMultiple = data.variant === 'multiple-many' || data.variant === 'multiple-graded';
  const useLinking = isMultiple && !!data.linkedInputs && inputOptions.length >= 2;

  if (!useLinking) {
    return new Set(inputOptions.filter((o) => isChosen(o, response)).map((o) => o.id));
  }

  const matching = matchLinkedInputs(inputOptions, response.typed ?? {});
  const matchedBoxIndices = new Set(matching.matchRight.filter((b) => b !== -1));
  return new Set(inputOptions.filter((_, i) => matchedBoxIndices.has(i)).map((o) => o.id));
}

/** Answer-option layout classes shared by the Player and AnswerSummary so review mode mirrors play mode. */
export const containerClasses: Record<OptionDisplayMode, string> = {
  list: 'space-y-2',
  'grid-2': 'grid grid-cols-2 gap-2',
  'grid-3': 'grid grid-cols-2 sm:grid-cols-3 gap-2',
  'grid-4': 'grid grid-cols-2 sm:grid-cols-4 gap-2'
};

const contentBlockSchema = {
  oneOf: [
    {
      type: 'object',
      required: ['kind', 'text'],
      properties: { kind: { const: 'text' }, text: { type: 'string' } },
      additionalProperties: false
    },
    {
      type: 'object',
      required: ['kind', 'url'],
      properties: { kind: { const: 'image' }, url: { type: 'string' }, alt: { type: 'string' } },
      additionalProperties: false
    },
    {
      type: 'object',
      required: ['kind', 'videoId'],
      properties: { kind: { const: 'video' }, videoId: { type: 'string' } },
      additionalProperties: false
    }
  ]
};

const choiceOptionSchema = {
  type: 'object',
  required: ['id', 'kind', 'correct', 'points'],
  properties: {
    id: { type: 'string', minLength: 1 },
    kind: { enum: ['text', 'image', 'video', 'input', 'reveal'] },
    content: contentBlockSchema,
    label: { type: 'string' },
    validAnswers: { type: 'array', items: { type: 'string' } },
    revealContent: contentBlockSchema,
    correct: { type: 'boolean' },
    points: { type: 'number' }
  },
  additionalProperties: false
};

const promptExtraSchema = {
  type: 'object',
  required: ['id', 'kind'],
  properties: {
    id: { type: 'string', minLength: 1 },
    kind: { enum: ['text', 'image', 'video', 'reveal'] },
    content: contentBlockSchema,
    label: { type: 'string' },
    revealContent: contentBlockSchema
  },
  additionalProperties: false
};

/** JSON Schema for ChoiceData, used to validate JSON imports (see src/lib/triviaSchema.ts). */
const choiceDataSchema = {
  type: 'object',
  required: ['variant', 'prompt', 'extras', 'options', 'questionPoints'],
  properties: {
    variant: { enum: ['single-one', 'single-graded', 'multiple-many', 'multiple-graded'] },
    prompt: contentBlockSchema,
    extras: { type: 'array', items: promptExtraSchema },
    options: { type: 'array', minItems: 2, maxItems: 25, items: choiceOptionSchema },
    questionPoints: { type: 'number' },
    linkedInputs: { type: 'boolean' },
    displayMode: { enum: ['list', 'grid-2', 'grid-3', 'grid-4'] },
    shuffleOptions: { type: 'boolean' }
  },
  additionalProperties: false
};

export const choiceType: QuestionTypeDefinition<ChoiceData, ChoiceResponse> = {
  type: 'choice',
  label: 'Question',
  description: 'A question with configurable selection and grading, mixing any answer kind you like.',

  createDefault(): ChoiceData {
    return {
      variant: 'single-one',
      prompt: { kind: 'text', text: '' },
      extras: [],
      options: [blankOption('text'), blankOption('text')],
      questionPoints: 10,
      linkedInputs: false,
      displayMode: 'list',
      shuffleOptions: false
    };
  },

  defaultFocusTarget(): ChoiceFocusTarget {
    return { field: 'prompt' };
  },

  cloneAsTemplate(data: ChoiceData): ChoiceData {
    return {
      variant: data.variant,
      prompt: { kind: 'text', text: '' },
      extras: data.extras.map((e) => blankExtra(e.kind)),
      options: data.options.map((o) => blankOption(o.kind, o.points)),
      questionPoints: data.questionPoints,
      linkedInputs: data.linkedInputs ?? false,
      displayMode: data.displayMode ?? 'list',
      shuffleOptions: data.shuffleOptions ?? false
    };
  },

  shuffleOptions(data: ChoiceData): ChoiceData {
    if (!data.shuffleOptions) return data;
    return { ...data, options: shuffledArray(data.options) };
  },

  validate(data): string[] {
    const errors: string[] = [];
    if (!isContentBlockFilled(data.prompt)) errors.push('Question prompt is empty.');
    if (data.options.length < MIN_OPTIONS) errors.push(`Provide at least ${MIN_OPTIONS} options.`);
    if (data.options.length > MAX_OPTIONS) errors.push(`Provide at most ${MAX_OPTIONS} options.`);
    if (data.options.some((o) => !isOptionFilled(o))) errors.push('One or more options are empty.');
    if (data.extras.some((e) => !isExtraFilled(e))) errors.push('One or more extra content blocks are empty.');

    if (data.variant === 'single-one') {
      if (data.options.filter((o) => o.correct).length !== 1) errors.push('Mark exactly one option as correct.');
      if (data.questionPoints <= 0) errors.push('Set a positive point value for this question.');
    } else if (data.variant === 'multiple-many') {
      if (data.options.filter((o) => o.correct).length === 0) errors.push('Mark at least one option as correct.');
      if (data.questionPoints <= 0) errors.push('Set a positive point value for this question.');
    } else if (!data.options.some((o) => o.points > 0)) {
      errors.push('Give at least one option a positive point value.');
    }

    return errors;
  },

  grade(data, response): GradeResult {
    const resp: ChoiceResponse = { selected: response?.selected ?? [], typed: response?.typed ?? {} };

    if (data.variant === 'single-one') {
      const chosen = data.options.filter((o) => isChosen(o, resp));
      const correctOption = data.options.find((o) => o.correct);
      const correct = !!correctOption && chosen.length === 1 && chosen[0].id === correctOption.id;
      return { earned: correct ? data.questionPoints : 0, max: data.questionPoints };
    }

    if (data.variant === 'single-graded') {
      const chosen = data.options.filter((o) => isChosen(o, resp));
      const max = data.options.reduce((m, o) => Math.max(m, o.points), 0);
      const earned = chosen.length > 0 ? Math.max(...chosen.map((o) => o.points)) : 0;
      return { earned, max };
    }

    // multiple-many / multiple-graded, with optional linked-input grading
    const inputOptions = data.options.filter((o) => o.kind === 'input');
    const otherOptions = data.options.filter((o) => o.kind !== 'input');
    const chosenOther = otherOptions.filter((o) => isChosen(o, resp));
    const matchedIds = matchedInputIds(data, resp);

    if (data.variant === 'multiple-many') {
      const correctOtherIds = new Set(otherOptions.filter((o) => o.correct).map((o) => o.id));
      const chosenOtherIds = new Set(chosenOther.map((o) => o.id));
      const otherExact =
        correctOtherIds.size === chosenOtherIds.size && [...correctOtherIds].every((id) => chosenOtherIds.has(id));

      let inputsExact: boolean;
      if (data.linkedInputs && inputOptions.length >= 2) {
        inputsExact = matchedIds.size === inputOptions.length;
      } else {
        const correctInputIds = new Set(inputOptions.filter((o) => o.correct).map((o) => o.id));
        inputsExact =
          correctInputIds.size === matchedIds.size && [...correctInputIds].every((id) => matchedIds.has(id));
      }

      const exact = otherExact && inputsExact;
      return { earned: exact ? data.questionPoints : 0, max: data.questionPoints };
    }

    // multiple-graded
    const otherEarned = chosenOther.reduce((sum, o) => sum + o.points, 0);
    const otherMax = otherOptions.filter((o) => o.points > 0).reduce((sum, o) => sum + o.points, 0);
    const inputMax = inputOptions.filter((o) => o.points > 0).reduce((sum, o) => sum + o.points, 0);
    const inputEarned = inputOptions.filter((o) => matchedIds.has(o.id)).reduce((sum, o) => sum + o.points, 0);

    return { earned: otherEarned + inputEarned, max: otherMax + inputMax };
  },

  Editor,
  Player,
  AnswerSummary,
  Preview,
  dataSchema: choiceDataSchema
};
