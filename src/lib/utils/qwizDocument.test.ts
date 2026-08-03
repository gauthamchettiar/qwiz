import { describe, expect, it } from 'vitest';
import { qwizSourceFromQuiz } from './qwizDocument';
import { quizFromQwizSource } from './importQwiz';
import { parseQwizFile } from './quizScript';
import type { Quiz } from '@/lib/schemas/quiz';

function makeQuiz(overrides: Partial<Quiz> = {}): Quiz {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'quiz-1',
    title: 'Capitals of Europe',
    description: 'Forty countries, one map.',
    category: 'geography',
    tags: ['easy', 'maps'],
    settings: { shuffle_questions: false, percent_to_win: 60 },
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q1',
        code: ['What is the capital of France?', '{', '=Paris', '~Lyon', '}'].join('\n')
      },
      { id: 'q2', code: ['type_answer: Capital of Italy?', '{', '=Rome', '}'].join('\n') }
    ],
    ...overrides
  };
}

describe('qwizSourceFromQuiz', () => {
  it('produces a document that parses back to the same metadata and questions', () => {
    const quiz = makeQuiz();
    const { frontmatter, questionCodes, errors } = parseQwizFile(qwizSourceFromQuiz(quiz));

    expect(errors).toEqual([]);
    expect(frontmatter.title).toBe(quiz.title);
    expect(frontmatter.description).toBe(quiz.description);
    expect(frontmatter.category).toBe(quiz.category);
    expect(frontmatter.tags).toEqual(quiz.tags);
    expect(frontmatter.settings).toEqual(quiz.settings);
    expect(questionCodes).toEqual(quiz.questions.map((q) => q.code));
  });

  // The property that matters for both Download and Share link: what leaves the app is the same
  // quiz that comes back, whichever door it went out of.
  it('round-trips through quizFromQwizSource, ids and timestamps aside', () => {
    const quiz = makeQuiz();
    const rebuilt = quizFromQwizSource(qwizSourceFromQuiz(quiz)).quiz!;

    expect(rebuilt.title).toBe(quiz.title);
    expect(rebuilt.settings).toEqual(quiz.settings);
    expect(rebuilt.questions.map((q) => q.code)).toEqual(quiz.questions.map((q) => q.code));
    // Ids are deliberately fresh — an exported quiz reimported is a new quiz, never an overwrite.
    expect(rebuilt.id).not.toBe(quiz.id);
  });

  it('handles a quiz with no questions, tags or settings', () => {
    const quiz = makeQuiz({ tags: [], settings: {}, questions: [] });
    const { frontmatter } = parseQwizFile(qwizSourceFromQuiz(quiz));
    expect(frontmatter.tags).toEqual([]);
    expect(frontmatter.settings).toEqual({});
  });
});
