import { z } from 'zod';

/** Quiz-wide `:key=value` settings (see `QUIZ_SETTING_RULES` in quizScript.ts) — points_to_win,
 * percent_to_win, shuffle_questions, questions_per_run. */
const quizScriptSettingsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()])
);

/** A single question's canonical form is its quizScript source text — see `quizScript.ts`. */
const quizQuestionSchema = z.object({
  id: z.string(),
  code: z.string()
});

export const quizSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  /** Single free-form grouping label. Suggested values come from `categories.ts`, but any
   * string is allowed. Empty string = uncategorized. */
  category: z.string(),
  /** Free-form labels for organizing and filtering. Lowercased and deduped on entry. */
  tags: z.array(z.string()),
  settings: quizScriptSettingsSchema,
  /** The play preset this quiz is styled with, by name — see `lib/themes/playPresets.ts`. A name
   * rather than a stylesheet, so the file carries no code and stays small. */
  themePreset: z.string().optional(),
  /** CSS the author wrote themselves, applied on top of the preset. Arbitrary code, which is why
   * a player who didn't write it is asked before any of it runs. */
  themeCss: z.string().optional(),
  /** Whether the VISITOR has agreed to run this quiz's own CSS — not part of the document, and
   * never serialized by `qwizSourceFromQuiz`. A quiz written in this browser's builder is `full`
   * (you wrote it); one that arrived from outside starts unset and is asked once, on the welcome
   * screen. Only ever consulted for `themeCss`; a preset is our code and always applies. */
  themeTrust: z.enum(['none', 'full']).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  questions: z.array(quizQuestionSchema)
});

export type Quiz = z.infer<typeof quizSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

/** Everything an author supplies in the builder; the rest of `Quiz` is generated on save. */
export type QuizDraft = Pick<Quiz, 'title' | 'description' | 'category' | 'tags'>;

export function emptyQuizDraft(): QuizDraft {
  return { title: '', description: '', category: '', tags: [] };
}
