import { listQuizzes } from '@/lib/stores/quizzes';

/**
 * Seed vocabularies offered in the category and tag dropdowns. Purely advisory — both fields
 * are free-text, so an author can type anything and the value is stored verbatim.
 */
export const CATEGORY_SUGGESTIONS = [
  'general knowledge',
  'science',
  'history',
  'geography',
  'music',
  'film & tv',
  'literature',
  'nature',
  'sports',
  'logic',
  'technology',
  'food & drink'
];

export const TAG_SUGGESTIONS = [
  'easy',
  'medium',
  'hard',
  'quick',
  'kids',
  'party',
  'classroom',
  'multiple choice',
  'picture round',
  'trivia night'
];

/** Seeds plus everything already used across saved quizzes, deduped and alphabetized, so the
 * author's own vocabulary accumulates instead of staying frozen at the hardcoded seeds. */
function withUsed(seeds: string[], used: string[]): string[] {
  return [...new Set([...seeds, ...used])].sort();
}

export function categorySuggestions(): string[] {
  return withUsed(
    CATEGORY_SUGGESTIONS,
    listQuizzes()
      .map((q) => q.category)
      .filter((c) => c.length > 0)
  );
}

export function tagSuggestions(): string[] {
  return withUsed(
    TAG_SUGGESTIONS,
    listQuizzes().flatMap((q) => q.tags)
  );
}
