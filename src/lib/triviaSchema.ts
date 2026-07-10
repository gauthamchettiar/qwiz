import Ajv2020 from 'ajv/dist/2020';
import { questionTypeList } from './question-types/registry';

const REVEAL_TIMING = ['after-question', 'end', 'never'];
const REVEAL_WIN_TIMING = ['end', 'never'];

function buildQuestionSchema() {
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
      'pointsToWin',
      'revealAnswers',
      'revealScore',
      'revealWin',
      'winMessage',
      'loseMessage',
      'shuffleQuestions',
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
      'showRunningScore',
      'disableBack',
      'disableEditAfterReveal'
    ],
    additionalProperties: false,
    properties: {
      pointsToWin: { type: ['number', 'null'] },
      revealAnswers: { enum: REVEAL_TIMING },
      revealScore: { enum: REVEAL_TIMING },
      revealWin: { enum: REVEAL_WIN_TIMING },
      winMessage: { type: 'array', items: { type: 'string' } },
      loseMessage: { type: 'array', items: { type: 'string' } },
      shuffleQuestions: { type: 'boolean' },
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
}

export function validateTriviaImport(data: unknown): TriviaValidationResult {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(buildTriviaImportSchema());
  const valid = validate(data);
  if (valid) return { valid: true, errors: [] };

  const errors = (validate.errors ?? []).map((err) => {
    const path = err.instancePath || '(root)';
    return `${path}: ${err.message}`;
  });
  return { valid: false, errors: Array.from(new Set(errors)) };
}
