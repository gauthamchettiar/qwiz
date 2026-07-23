import { describe, expect, it } from 'vitest';
import { slugify } from './download';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('My Great Quiz')).toBe('my-great-quiz');
  });

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(slugify('Geography  &  History!!!')).toBe('geography-history');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('  --Wow--  ')).toBe('wow');
  });

  it('falls back to "quiz" when nothing alphanumeric remains', () => {
    expect(slugify('???')).toBe('quiz');
    expect(slugify('')).toBe('quiz');
  });

  it('keeps digits', () => {
    expect(slugify('Top 10 Movies of 2024')).toBe('top-10-movies-of-2024');
  });
});
