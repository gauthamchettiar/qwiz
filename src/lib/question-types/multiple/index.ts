import type { ContentBlock } from '../../types';
import type { GradeResult, QuestionTypeDefinition } from '../types';
import { genId } from '../shared';
import { shuffledArray } from '../../shuffle';
import { ListChecks } from '@lucide/svelte';
import Editor from './Editor.svelte';
import Player from './Player.svelte';
import AnswerSummary from './AnswerSummary.svelte';
import Preview from './Preview.svelte';

export type OptionKind = 'text' | 'image' | 'video';
export type PromptExtraKind = 'text' | 'image' | 'video' | 'reveal';

export interface AnswerOption {
  id: string;
  kind: OptionKind;
  content: ContentBlock;
  /** Every option is graded — 0 = wrong, positive = correct/partial credit. */
  points: number;
}

export interface PromptExtra {
  id: string;
  kind: PromptExtraKind;
  content: ContentBlock | null; // text/image/video kinds; null for reveal
  label: string | null; // reveal kind; null otherwise
  revealContent: ContentBlock | null; // reveal kind; null otherwise
  /** Only meaningful for kind 'reveal' — typically 0 or negative (a hint penalty). Awarded/
   * deducted once the player actually reveals this extra. Null for non-reveal kinds. */
  points: number | null;
}

export type OptionDisplayMode = 'list' | 'grid-2' | 'grid-3';

export interface MultipleData {
  prompt: ContentBlock;
  extras: PromptExtra[];
  options: AnswerOption[];
  /** Player must select at least this many. 0 = submitting with nothing selected is allowed. */
  min: number;
  /** Player cannot select more than this many. */
  max: number;
  /** How answer options are laid out in the player. Purely presentational. */
  displayMode: OptionDisplayMode;
  /** Randomize this question's option order each time it's played. */
  shuffleOptions: boolean;
  /** If true, the player only earns points by selecting exactly the options with positive
   * points — no more, no less. Any other combination scores 0 for the options portion. */
  allOrNone: boolean;
  /** Practice/trial question: still answerable, but grade() always returns 0/0 and reveal
   * screens grey it out instead of showing correct/wrong. */
  ungraded: boolean;
}

export interface MultipleResponse {
  selected: string[]; // clicked option ids
  typed: Record<string, string>; // unused (kept for response-shape compatibility)
  revealedExtras?: string[]; // ids of reveal-kind extras the player has clicked to reveal
}

/** This type's own focus-target shape for the Preview -> Editor click-to-edit flow. */
export type MultipleFocusTarget =
  | { field: 'prompt' }
  | { field: 'option'; optionId: string }
  | { field: 'extra'; extraId: string };

const MAX_OPTIONS = 25;

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}

function blankContent(kind: 'text' | 'image' | 'video'): ContentBlock {
  if (kind === 'text') return { kind: 'text', text: '' };
  if (kind === 'image') return { kind: 'image', url: '', alt: '' };
  return { kind: 'video', videoId: '' };
}

export function blankOption(kind: OptionKind = 'text', points = 0): AnswerOption {
  return { id: genId(), kind, content: blankContent(kind), points };
}

export function blankExtra(kind: PromptExtraKind): PromptExtra {
  return {
    id: genId(),
    kind,
    content: kind === 'reveal' ? null : blankContent(kind),
    label: kind === 'reveal' ? '' : null,
    revealContent: kind === 'reveal' ? { kind: 'text', text: '' } : null,
    points: kind === 'reveal' ? 0 : null
  };
}

/** An option counts as "chosen" if the player clicked it. */
export function isChosen(option: AnswerOption, response: MultipleResponse): boolean {
  return (response.selected ?? []).includes(option.id);
}

/** Total number of options the player currently has chosen, used to enforce min/max. */
export function chosenCount(data: MultipleData, response: MultipleResponse): number {
  return data.options.filter((o) => isChosen(o, response)).length;
}

/** Answer-option layout classes shared by the Player and AnswerSummary so review mode mirrors play mode. */
export const containerClasses: Record<OptionDisplayMode, string> = {
  list: 'space-y-2',
  'grid-2': 'grid grid-cols-2 gap-2',
  'grid-3': 'grid grid-cols-2 sm:grid-cols-3 gap-2'
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
      required: ['kind', 'url', 'alt'],
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

const nullableContentBlockSchema = { oneOf: [contentBlockSchema, { type: 'null' }] };

const answerOptionSchema = {
  type: 'object',
  required: ['id', 'kind', 'content', 'points'],
  properties: {
    id: { type: 'string', minLength: 1 },
    kind: { enum: ['text', 'image', 'video'] },
    content: contentBlockSchema,
    points: { type: 'number' }
  },
  additionalProperties: false
};

const promptExtraSchema = {
  type: 'object',
  required: ['id', 'kind', 'content', 'label', 'revealContent', 'points'],
  properties: {
    id: { type: 'string', minLength: 1 },
    kind: { enum: ['text', 'image', 'video', 'reveal'] },
    content: nullableContentBlockSchema,
    label: { type: ['string', 'null'] },
    revealContent: nullableContentBlockSchema,
    points: { type: ['number', 'null'] }
  },
  additionalProperties: false
};

/** JSON Schema for MultipleData, used to validate JSON imports (see src/lib/triviaSchema.ts). */
const multipleDataSchema = {
  type: 'object',
  required: ['prompt', 'extras', 'options', 'min', 'max', 'displayMode', 'shuffleOptions', 'allOrNone', 'ungraded'],
  properties: {
    prompt: contentBlockSchema,
    extras: { type: 'array', items: promptExtraSchema },
    options: { type: 'array', minItems: 2, maxItems: MAX_OPTIONS, items: answerOptionSchema },
    min: { type: 'number' },
    max: { type: 'number' },
    displayMode: { enum: ['list', 'grid-2', 'grid-3'] },
    shuffleOptions: { type: 'boolean' },
    allOrNone: { type: 'boolean' },
    ungraded: { type: 'boolean' }
  },
  additionalProperties: false
};

export const multipleType: QuestionTypeDefinition<MultipleData, MultipleResponse> = {
  type: 'multiple',
  label: 'Multiple',
  description: 'Player selects one or more answers within a min/max range you set. Each answer carries its own points.',
  icon: ListChecks,

  createDefault(): MultipleData {
    return {
      prompt: { kind: 'text', text: '' },
      extras: [],
      options: [blankOption('text'), blankOption('text')],
      min: 1,
      max: 2,
      displayMode: 'list',
      shuffleOptions: false,
      allOrNone: false,
      ungraded: false
    };
  },

  defaultFocusTarget(): MultipleFocusTarget {
    return { field: 'prompt' };
  },

  shuffleOptions(data: MultipleData): MultipleData {
    if (!data.shuffleOptions) return data;
    return { ...data, options: shuffledArray(data.options) };
  },

  isAnswerComplete(data, response): boolean {
    const resp: MultipleResponse = { selected: response?.selected ?? [], typed: response?.typed ?? {} };
    return chosenCount(data, resp) >= data.min;
  },

  isUngraded(data): boolean {
    return data.ungraded === true;
  },

  grade(data, response): GradeResult {
    // Practice/trial question: still answerable, but never scored — short-circuit before any
    // of the normal points math so it can never contribute to a total.
    if (data.ungraded) return { earned: 0, max: 0 };

    const resp: MultipleResponse = {
      selected: response?.selected ?? [],
      typed: response?.typed ?? {},
      revealedExtras: response?.revealedExtras ?? []
    };

    const rawOptionsEarned = data.options.filter((o) => isChosen(o, resp)).reduce((sum, o) => sum + o.points, 0);
    // All-or-none: the player's selection must be exactly the set of positive-points options —
    // nothing missing, nothing extra — or the options portion scores 0.
    const isExactCorrectMatch = data.options.every((o) => isChosen(o, resp) === o.points > 0);
    const optionsEarned = data.allOrNone ? (isExactCorrectMatch ? rawOptionsEarned : 0) : rawOptionsEarned;

    const revealExtras = data.extras.filter((e) => e.kind === 'reveal');
    const extraPenalty = revealExtras
      .filter((e) => resp.revealedExtras!.includes(e.id))
      .reduce((sum, e) => sum + (e.points ?? 0), 0);

    // Best achievable score: the top `max` option point values (or, under all-or-none, every
    // positive-points option, since hitting max requires selecting all of them), plus every
    // reveal extra worth revealing (a rational player reveals positive-value hints and skips
    // negative ones, so those never cost anything against the max either).
    const sortedPoints = data.options.map((o) => Math.max(o.points, 0)).sort((a, b) => b - a);
    const optionsMax = data.allOrNone
      ? data.options.filter((o) => o.points > 0).reduce((sum, o) => sum + o.points, 0)
      : sortedPoints.slice(0, data.max).reduce((sum, p) => sum + p, 0);
    const extraMax = revealExtras.reduce((sum, e) => sum + Math.max(e.points ?? 0, 0), 0);

    return { earned: optionsEarned + extraPenalty, max: optionsMax + extraMax };
  },

  Editor,
  Player,
  AnswerSummary,
  Preview,
  dataSchema: multipleDataSchema
};
