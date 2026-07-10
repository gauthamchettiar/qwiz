import type { ContentBlock } from '../../types';
import type { GradeResult, QuestionTypeDefinition } from '../types';
import { CircleDot } from '@lucide/svelte';
import {
  multipleType,
  blankExtra,
  blankOption,
  type AnswerOption,
  type OptionKind,
  type MultipleData,
  type MultipleResponse,
  type PromptExtra,
  type PromptExtraKind,
  type OptionDisplayMode
} from '../multiple';
import Editor from './Editor.svelte';
import Player from './Player.svelte';
import AnswerSummary from './AnswerSummary.svelte';
import Preview from './Preview.svelte';

export type { PromptExtra, PromptExtraKind, OptionDisplayMode, AnswerOption, OptionKind };
export { blankOption };

export interface SingleData {
  prompt: ContentBlock;
  extras: PromptExtra[];
  options: AnswerOption[];
  displayMode: OptionDisplayMode;
  shuffleOptions: boolean;
  // min=0, max=1 are implicit for this type — not stored, always true by definition.
}

export type SingleResponse = MultipleResponse;

/** This type's own focus-target shape for the Preview -> Editor click-to-edit flow. */
export type SingleFocusTarget = { field: 'prompt' } | { field: 'option'; optionId: string };

/** Single is "Multiple with min=0, max=1" — this is the wrapper's one conversion point, reused
 * by grading, completeness-checking, shuffling, and every rendering component. */
export function toMultiple(data: SingleData): MultipleData {
  return {
    prompt: data.prompt,
    extras: data.extras,
    options: data.options,
    min: 0,
    max: 1,
    displayMode: data.displayMode,
    shuffleOptions: data.shuffleOptions
  };
}

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

const singleOptionSchema = {
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

/** JSON Schema for SingleData, used to validate JSON imports (see src/lib/triviaSchema.ts). */
const singleDataSchema = {
  type: 'object',
  required: ['prompt', 'extras', 'options', 'displayMode', 'shuffleOptions'],
  properties: {
    prompt: contentBlockSchema,
    extras: { type: 'array', items: promptExtraSchema },
    options: { type: 'array', minItems: 2, maxItems: 25, items: singleOptionSchema },
    displayMode: { enum: ['list', 'grid-2', 'grid-3'] },
    shuffleOptions: { type: 'boolean' }
  },
  additionalProperties: false
};

export const singleType: QuestionTypeDefinition<SingleData, SingleResponse> = {
  type: 'single',
  label: 'Single',
  description: 'Player picks exactly one answer from Text, Image, or Video options. Each answer carries its own points.',
  icon: CircleDot,

  createDefault(): SingleData {
    return {
      prompt: { kind: 'text', text: '' },
      extras: [],
      options: [blankOption('text'), blankOption('text')],
      displayMode: 'list',
      shuffleOptions: false
    };
  },

  defaultFocusTarget(): SingleFocusTarget {
    return { field: 'prompt' };
  },

  cloneAsTemplate(data: SingleData): SingleData {
    return {
      prompt: { kind: 'text', text: '' },
      extras: data.extras.map((e) => blankExtra(e.kind)),
      options: data.options.map((o) => blankOption(o.kind, o.points)),
      displayMode: data.displayMode ?? 'list',
      shuffleOptions: data.shuffleOptions ?? false
    };
  },

  shuffleOptions(data: SingleData): SingleData {
    const converted = multipleType.shuffleOptions!(toMultiple(data));
    return { ...data, options: converted.options };
  },

  isAnswerComplete(data, response): boolean {
    return multipleType.isAnswerComplete!(toMultiple(data), response);
  },

  grade(data, response): GradeResult {
    return multipleType.grade(toMultiple(data), response);
  },

  Editor,
  Player,
  AnswerSummary,
  Preview,
  dataSchema: singleDataSchema
};
