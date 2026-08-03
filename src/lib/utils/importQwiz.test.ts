// @vitest-environment jsdom
// importQwizSource persists via saveQuiz, which now reports whether the write actually landed
// (see lib/stores/quizzes.ts) — that requires a real localStorage, hence jsdom over plain node.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importQwizSource, quizFromQwizSource } from './importQwiz';

beforeEach(() => {
  localStorage.clear();
});

const VALID_SOURCE = [
  '---',
  'title: Geography',
  'description: A quiz about the world',
  'category: geography',
  'tags: [easy]',
  '---',
  '',
  'What is the capital of France?',
  '{',
  '=Paris',
  '~Lyon',
  '}'
].join('\n');

describe('importQwizSource', () => {
  it('builds a quiz with fresh ids and matching metadata from valid source', () => {
    const { quiz, errors } = importQwizSource(VALID_SOURCE);
    expect(errors).toEqual([]);
    expect(quiz).toBeDefined();
    expect(quiz!.title).toBe('Geography');
    expect(quiz!.category).toBe('geography');
    expect(quiz!.tags).toEqual(['easy']);
    expect(quiz!.questions).toHaveLength(1);
    expect(quiz!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(quiz!.questions[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(quiz!.createdAt).toBe(quiz!.updatedAt);
  });

  it('gives every question a distinct id', () => {
    const source = [
      '---',
      'title: T',
      'description: ',
      'category: ',
      'tags: []',
      '---',
      '',
      'Q1',
      '{',
      '=a',
      '}',
      '',
      'Q2',
      '{',
      '=b',
      '}'
    ].join('\n');
    const { quiz } = importQwizSource(source);
    const ids = quiz!.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns errors and no quiz when the source does not parse cleanly', () => {
    const { quiz, errors } = importQwizSource('not frontmatter\n\nQuestion with no options');
    expect(quiz).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns an error instead of a quiz when persisting fails', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    const { quiz, errors } = importQwizSource(VALID_SOURCE);
    expect(quiz).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);

    setItem.mockRestore();
    error.mockRestore();
  });
});

describe('quizFromQwizSource', () => {
  it('builds the same quiz without writing anything to storage', () => {
    const { quiz, errors } = quizFromQwizSource(VALID_SOURCE);
    expect(errors).toEqual([]);
    expect(quiz!.title).toBe('Geography');
    expect(quiz!.questions).toHaveLength(1);
    expect(quiz!.id).toMatch(/^[0-9a-f-]{36}$/);
    // The whole point of the split: a shared link someone opened is not a quiz they asked to keep.
    expect(localStorage.length).toBe(0);
  });

  it('mints a different id every time, so opening a link twice never collides', () => {
    const first = quizFromQwizSource(VALID_SOURCE).quiz!;
    const second = quizFromQwizSource(VALID_SOURCE).quiz!;
    expect(first.id).not.toBe(second.id);
    expect(first.questions[0].id).not.toBe(second.questions[0].id);
  });

  it('returns errors and no quiz for source that does not parse', () => {
    const { quiz, errors } = quizFromQwizSource('not frontmatter\n\nQuestion with no options');
    expect(quiz).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
  });
});
