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
        code: ['type_answer: What is the capital of Italy?', '{', '=Rome', '}'].join('\n')
      }
    ],
    ...overrides
  };
}

/** A single-question quiz exercising guess_letters: bracket pre-reveal, the default letter
 * bank/letter_reveal, and a wrong-guess penalty — shared between character-input.spec.ts and the
 * accessibility suite. */
export function buildCharacterInputQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Hangman e2e',
    description: 'guess_letters coverage',
    category: 'e2e',
    tags: ['e2e'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: [
          'guess_letters: Guess the capital of France',
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

/** A single-question quiz exercising `order_items`: three items whose authored order is the answer key
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
        code: [
          'order_items: Arrange chronologically',
          '{',
          '=First',
          '=Second',
          '=Third',
          '}'
        ].join('\n')
      }
    ],
    ...overrides
  };
}

/** A single-question quiz exercising `match_pairs`: two 1-to-1 item/target pairs — shared between
 * match-group_items.spec.ts and the accessibility suite. */
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
        code: ['match_pairs: Match capitals', '{', '=Paris -> France', '=Tokyo -> Japan', '}'].join(
          '\n'
        )
      }
    ],
    ...overrides
  };
}

/** A single-question quiz exercising `group_items`: two items sharing one bucket, one in another —
 * shared between match-group_items.spec.ts and the accessibility suite. */
export function buildCategoriseQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Categorise e2e',
    description: 'group_items coverage',
    category: 'e2e',
    tags: ['e2e'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: [
          'group_items: Sort animals',
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

/** A single-question quiz exercising `fill_blanks` in the default (bank) mode: two blanks, two
 * correct answers, one distractor — shared between fill-in-blanks.spec.ts and the accessibility
 * suite. */
export function buildFillInBlanksQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Fill in the blanks e2e',
    description: 'fill_blanks coverage',
    category: 'e2e',
    tags: ['e2e'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: [
          'fill_blanks: The ___ is the powerhouse of the ___.',
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

/** Inline SVG data URIs, so a picture fixture needs no network and no binary asset in the repo —
 * the same trick examples/09-picture-round.qwiz uses. Each one is a distinct solid colour, which
 * is enough for a test that only cares that images render and are told apart. */
function swatch(hex: string): string {
  return `data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%2760%27%20height%3D%2740%27%3E%3Crect%20width%3D%2760%27%20height%3D%2740%27%20fill%3D%27%23${hex}%27%2F%3E%3C%2Fsvg%3E`;
}

/** `match_pairs` with a picture on each side of the pairing — a picture item paired with a text
 * target, and a text item paired with a picture target, so one question covers both directions. */
export function buildPictureMatchQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Picture match e2e',
    description: 'match_pairs with image content on both sides',
    category: 'e2e',
    tags: ['e2e'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: [
          'match_pairs: Match the colour to its name',
          '{',
          `=![Red swatch](${swatch('ff0000')}) -> Red`,
          `=Blue -> ![Blue swatch](${swatch('0000ff')})`,
          '}'
        ].join('\n')
      }
    ],
    ...overrides
  };
}

/** `fill_blanks` in bank mode whose bank words are pictures — the case that needs a blank to record
 * WHICH option was placed rather than the word's text (see grading.ts's `blankPicks`). */
export function buildPictureFillInBlanksQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = new Date().toISOString();
  return {
    id: nextId(),
    title: 'Picture blanks e2e',
    description: 'fill_blanks with image bank words',
    category: 'e2e',
    tags: ['e2e'],
    settings: { shuffle_questions: false },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: [
          'fill_blanks: Danger is ___ and calm is ___.',
          '{',
          `=![Red swatch](${swatch('ff0000')})`,
          `=![Blue swatch](${swatch('0000ff')})`,
          `~![Green swatch](${swatch('00ff00')})`,
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
