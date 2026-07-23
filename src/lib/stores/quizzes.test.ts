// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quiz } from '@/lib/schemas/quiz';
import { deleteQuiz, getQuiz, listQuizzes, saveQuiz } from './quizzes';

const STORAGE_KEY = 'qwiz:quizzes';

function makeQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: crypto.randomUUID(),
    title: 'Sample',
    description: '',
    category: '',
    tags: [],
    settings: {},
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    questions: [],
    ...overrides
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('saveQuiz / getQuiz / listQuizzes / deleteQuiz', () => {
  it('round-trips a saved quiz', () => {
    const quiz = makeQuiz();
    expect(saveQuiz(quiz)).toBe(true);
    expect(getQuiz(quiz.id)).toEqual(quiz);
  });

  it('returns null for an id that was never saved', () => {
    expect(getQuiz('does-not-exist')).toBeNull();
  });

  it('lists saved quizzes newest-updated first', () => {
    const older = makeQuiz({ id: 'a', updatedAt: '2024-01-01T00:00:00.000Z' });
    const newer = makeQuiz({ id: 'b', updatedAt: '2024-06-01T00:00:00.000Z' });
    saveQuiz(older);
    saveQuiz(newer);
    expect(listQuizzes().map((q) => q.id)).toEqual(['b', 'a']);
  });

  it('deletes a quiz and reports whether it existed', () => {
    const quiz = makeQuiz();
    saveQuiz(quiz);
    expect(deleteQuiz(quiz.id)).toBe(true);
    expect(getQuiz(quiz.id)).toBeNull();
    expect(deleteQuiz(quiz.id)).toBe(false);
  });

  it('overwrites an existing quiz with the same id', () => {
    const quiz = makeQuiz({ title: 'First' });
    saveQuiz(quiz);
    saveQuiz({ ...quiz, title: 'Second' });
    expect(listQuizzes()).toHaveLength(1);
    expect(getQuiz(quiz.id)!.title).toBe('Second');
  });
});

describe('write failures (quota exceeded, private browsing, etc.)', () => {
  it('saveQuiz returns false and logs, without throwing, when the write fails', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(() => saveQuiz(makeQuiz())).not.toThrow();
    expect(saveQuiz(makeQuiz())).toBe(false);
    expect(error).toHaveBeenCalled();

    setItem.mockRestore();
    error.mockRestore();
  });

  it('deleteQuiz returns false when the quiz existed but the write fails', () => {
    const quiz = makeQuiz();
    saveQuiz(quiz);

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(deleteQuiz(quiz.id)).toBe(false);
    // The failed write means it's still there.
    expect(getQuiz(quiz.id)).toEqual(quiz);

    setItem.mockRestore();
    error.mockRestore();
  });
});

describe('resilience to bad localStorage content', () => {
  it('returns an empty list when the stored value is not valid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not json{{{');
    expect(listQuizzes()).toEqual([]);
  });

  it('returns an empty list when the stored value is valid JSON but not an object', () => {
    localStorage.setItem(STORAGE_KEY, '"just a string"');
    expect(listQuizzes()).toEqual([]);
  });

  it('drops a record that does not match the quiz schema, without warning-crashing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const good = makeQuiz({ id: 'good' });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        good,
        bad: { id: 'bad', title: 'missing required fields' }
      })
    );
    expect(listQuizzes().map((q) => q.id)).toEqual(['good']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
