import { describe, expect, it } from 'vitest';
import { importQwizSource } from './importQwiz';

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
});
