import type { QuizScriptSettings } from '@/lib/utils/quizScript';

export interface Quiz {
  id: string;
  title: string;
  description: string;
  /** Single free-form grouping label. Suggested values come from `categories.ts`, but any
   * string is allowed. Empty string = uncategorized. */
  category: string;
  /** Free-form labels for organizing and filtering. Lowercased and deduped on entry. */
  tags: string[];
  /** Quiz-wide `:key=value` settings (see `QUIZ_SETTING_RULES` in quizScript.ts) — points_to_win,
   * percentage_points_to_win, shuffle_questions, max_questions. */
  settings: QuizScriptSettings;
  createdAt: string;
  updatedAt: string;
  questions: QuizQuestion[];
}

/** A single question's canonical form is its quizScript source text — see `quizScript.ts`. */
export interface QuizQuestion {
  id: string;
  code: string;
}

/** Everything an author supplies in the builder; the rest of `Quiz` is generated on save. */
export type QuizDraft = Pick<Quiz, 'title' | 'description' | 'category' | 'tags'>;

export function emptyQuizDraft(): QuizDraft {
  return { title: '', description: '', category: '', tags: [] };
}
