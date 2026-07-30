import type { Quiz } from '../../src/lib/schemas/quiz';

let counter = 0;
function nextId(): string {
  counter += 1;
  return `e2e-quiz-${counter}-${Date.now()}`;
}

/** Builds a valid, ready-to-seed Quiz object (matches quizSchema) without going through the
 * builder UI — used to arrange state for specs that test something other than authoring itself
 * (playing, listing, deep-linking). Two questions by default: one choice, one typed, each with
 * exactly one unambiguous correct answer so a "answer everything correctly" run always wins. */
export function buildQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Capitals of Europe',
    description: 'A short geography quiz seeded for e2e tests.',
    category: 'geography',
    tags: ['e2e'],
    // shuffle_questions defaults to true — pinned false so the play spec can rely on a fixed,
    // authored question order instead of re-detecting which question is on screen each run.
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: ['What is the capital of France?', '{', '=Paris', '~Lyon', '~Marseille', '}'].join(
          '\n'
        )
      },
      {
        id: 'q2',
        code: ['typed: What is the capital of Italy?', '{', '=Rome', '}'].join('\n')
      }
    ],
    ...overrides
  };
}

/** A single-question quiz exercising character_input: bracket pre-reveal, the default letter
 * bank/letter_reveal, and a wrong-guess penalty — shared between character-input.spec.ts and the
 * accessibility suite. */
export function buildCharacterInputQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Hangman e2e',
    description: 'character_input coverage',
    category: 'e2e',
    tags: ['e2e'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: [
          'character_input: Guess the capital of France',
          '{',
          '=[P]aris',
          '}',
          ':letter_bank=alphabet',
          ':letter_reveal=all',
          ':points_wrong=-1'
        ].join('\n')
      }
    ],
    ...overrides
  };
}

/** A single-question quiz exercising `order`: three items whose authored order is the answer key
 * — shared between order.spec.ts and the accessibility suite. */
export function buildOrderQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Order e2e',
    description: 'order coverage',
    category: 'e2e',
    tags: ['e2e'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: ['order: Arrange chronologically', '{', '=First', '=Second', '=Third', '}'].join('\n')
      }
    ],
    ...overrides
  };
}

/** A single-question quiz exercising `match`: two 1-to-1 item/target pairs — shared between
 * match-categorise.spec.ts and the accessibility suite. */
export function buildMatchQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Match e2e',
    description: 'match coverage',
    category: 'e2e',
    tags: ['e2e'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: ['match: Match capitals', '{', '=Paris -> France', '=Tokyo -> Japan', '}'].join('\n')
      }
    ],
    ...overrides
  };
}

/** A single-question quiz exercising `categorise`: two items sharing one bucket, one in another —
 * shared between match-categorise.spec.ts and the accessibility suite. */
export function buildCategoriseQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Categorise e2e',
    description: 'categorise coverage',
    category: 'e2e',
    tags: ['e2e'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: [
          'categorise: Sort animals',
          '{',
          '=Fish -> Water',
          '=Frog -> Water',
          '=Lion -> Land',
          '}'
        ].join('\n')
      }
    ],
    ...overrides
  };
}

/** A single-question quiz exercising `fill_in_blanks` in the default (bank) mode: two blanks, two
 * correct answers, one distractor — shared between fill-in-blanks.spec.ts and the accessibility
 * suite. */
export function buildFillInBlanksQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Fill in the blanks e2e',
    description: 'fill_in_blanks coverage',
    category: 'e2e',
    tags: ['e2e'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: [
          'fill_in_blanks: The ___ is the powerhouse of the ___.',
          '{',
          '=mitochondria',
          '=cell',
          '~nucleus',
          '}'
        ].join('\n')
      }
    ],
    ...overrides
  };
}

/** A whole .qwiz document as a paste-able string, for the import dialog spec. */
export const SAMPLE_QWIZ_SOURCE = [
  '---',
  'title: Imported Sample Quiz',
  'description: Imported via paste in the e2e suite',
  'category: e2e',
  'tags: [imported]',
  '---',
  '',
  'What is 2 + 2?',
  '{',
  '=4',
  '~5',
  '}'
].join('\n');
