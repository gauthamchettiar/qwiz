import { serializeQuizScript } from '@/lib/utils/quizScript';
import type { Quiz } from '@/lib/schemas/quiz';

/** A saved quiz as its `.qwiz` document — the exact inverse of `quizFromQwizSource`
 * (importQwiz.ts), and the one place that knows a `Quiz`'s metadata fields are what
 * `QuizScriptFrontmatter` wants. Every way a saved quiz leaves the app goes through here
 * (Download, Share link, from either the quiz list or the edit screen) so they can't drift into
 * exporting subtly different documents for the same quiz.
 *
 * Not to be confused with the builder's own `currentDocumentForExport`, which serializes live,
 * possibly-unsaved form state rather than a stored `Quiz`. */
export function qwizSourceFromQuiz(quiz: Quiz): string {
  return serializeQuizScript(
    {
      title: quiz.title,
      description: quiz.description,
      category: quiz.category,
      tags: quiz.tags,
      settings: quiz.settings
    },
    quiz.questions.map((q) => q.code)
  );
}
