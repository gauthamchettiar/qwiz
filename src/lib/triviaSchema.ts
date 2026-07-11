import type { ErrorObject } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import { questionTypeList } from './question-types/registry';

const REVEAL_TIMING = ['after-question', 'end', 'never'];
const REVEAL_WIN_TIMING = ['end', 'never'];

/**
 * JSON Schema for a single `{ id, type, data }` question — the same fragment used inside
 * `buildTriviaImportSchema`'s `questions` array, exported so a single question (e.g. from the
 * per-question "Edit JSON" dialog) can be validated standalone.
 */
export function buildQuestionSchema() {
  return {
    type: 'object',
    required: ['id', 'type', 'data'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1 },
      type: { enum: questionTypeList.map((d) => d.type) },
      data: {}
    },
    oneOf: questionTypeList.map((def) => ({
      properties: {
        type: { const: def.type },
        data: def.dataSchema ?? { type: 'object' }
      }
    }))
  };
}

function buildSettingsSchema() {
  return {
    type: 'object',
    required: [
      'pointsToWinPercent',
      'maxWrongAnswers',
      'revealAnswers',
      'revealScore',
      'revealWin',
      'winMessage',
      'loseMessage',
      'shuffleQuestions',
      'maxQuestions',
      'perQuestionTimeLimit',
      'overallTimeLimit',
      'showIntro',
      'accentColor',
      'primaryColor',
      'secondaryColor',
      'correctColor',
      'wrongColor',
      'partialColor',
      'neutralColor',
      'textColor',
      'bgColor',
      'fontFamily',
      'showRunningScore',
      'disableBack',
      'disableEditAfterReveal'
    ],
    additionalProperties: false,
    properties: {
      pointsToWinPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
      maxWrongAnswers: { type: ['number', 'null'], minimum: 1 },
      revealAnswers: { enum: REVEAL_TIMING },
      revealScore: { enum: REVEAL_TIMING },
      revealWin: { enum: REVEAL_WIN_TIMING },
      winMessage: { type: 'array', items: { type: 'string' } },
      loseMessage: { type: 'array', items: { type: 'string' } },
      shuffleQuestions: { type: 'boolean' },
      maxQuestions: { type: ['number', 'null'], minimum: 1 },
      perQuestionTimeLimit: { type: ['number', 'null'] },
      overallTimeLimit: { type: ['number', 'null'] },
      showIntro: { type: 'boolean' },
      accentColor: { type: 'string' },
      primaryColor: { type: 'string' },
      secondaryColor: { type: 'string' },
      correctColor: { type: 'string' },
      wrongColor: { type: 'string' },
      partialColor: { type: 'string' },
      neutralColor: { type: 'string' },
      textColor: { type: 'string' },
      bgColor: { type: 'string' },
      fontFamily: { enum: ['sans', 'serif', 'mono', 'rounded'] },
      showRunningScore: { type: 'boolean' },
      disableBack: { type: 'boolean' },
      disableEditAfterReveal: { type: 'boolean' }
    }
  };
}

/**
 * Builds the full Trivia JSON Schema from the live question-type registry — each registered
 * type contributes its own `dataSchema` fragment, so this automatically covers every type
 * without hardcoding any of them.
 */
export function buildTriviaImportSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://qwiz.local/schemas/trivia.schema.json',
    title: 'Qwiz Trivia',
    description: 'A complete trivia export/import file, as produced by "Download JSON" and accepted by "Import JSON".',
    type: 'object',
    required: ['id', 'title', 'description', 'createdAt', 'updatedAt', 'questions', 'settings'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      title: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      createdAt: { type: 'string' },
      updatedAt: { type: 'string' },
      questions: { type: 'array', items: buildQuestionSchema() },
      settings: buildSettingsSchema()
    }
  };
}

export interface TriviaValidationResult {
  valid: boolean;
  errors: string[];
  /** Raw Ajv `instancePath` per error, same order as `errors`, deduped alongside it — lets
   * callers with a live form (e.g. TriviaBuilder) map an error back to the field that caused it. */
  paths: string[];
}

function formatValidationErrors(rawErrors: ErrorObject[] | null | undefined): Pick<TriviaValidationResult, 'errors' | 'paths'> {
  const seen = new Set<string>();
  const errors: string[] = [];
  const paths: string[] = [];
  for (const err of rawErrors ?? []) {
    const path = err.instancePath || '(root)';
    const message = `${path}: ${err.message}`;
    if (seen.has(message)) continue;
    seen.add(message);
    errors.push(message);
    paths.push(err.instancePath);
  }
  return { errors, paths };
}

export function validateTriviaImport(data: unknown): TriviaValidationResult {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(buildTriviaImportSchema());
  if (validate(data)) return { valid: true, errors: [], paths: [] };
  return { valid: false, ...formatValidationErrors(validate.errors) };
}

/** Validates a single `{ id, type, data }` question, e.g. from the per-question "Edit JSON" dialog. */
export function validateQuestionImport(data: unknown): TriviaValidationResult {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(buildQuestionSchema());
  if (validate(data)) return { valid: true, errors: [], paths: [] };
  return { valid: false, ...formatValidationErrors(validate.errors) };
}
