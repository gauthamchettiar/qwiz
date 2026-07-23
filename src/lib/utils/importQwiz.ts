import { parseQwizFile } from '@/lib/utils/quizScript';
import { saveQuiz } from '@/lib/stores/quizzes';
import type { Quiz } from '@/lib/schemas/quiz';

/** Builds a brand-new quiz from a piece of `.qwiz` source (fresh quiz id, fresh per-question
 * ids, fresh timestamps — never overwrites an existing quiz), saves it, and returns it. Shared
 * by the paste/upload import flow and the "Load a sample" flow, since both ultimately do the
 * same thing to a piece of source text; `errors` is non-empty (and `quiz` absent) if the source
 * doesn't parse cleanly. */
export function importQwizSource(source: string): { quiz?: Quiz; errors: string[] } {
  const { frontmatter, questionCodes, errors } = parseQwizFile(source);
  if (errors.length > 0) return { errors };

  const now = new Date().toISOString();
  const quiz: Quiz = {
    id: crypto.randomUUID(),
    title: frontmatter.title,
    description: frontmatter.description,
    category: frontmatter.category,
    tags: frontmatter.tags,
    settings: frontmatter.settings,
    createdAt: now,
    updatedAt: now,
    questions: questionCodes.map((code) => ({ id: crypto.randomUUID(), code }))
  };
  if (!saveQuiz(quiz)) {
    return {
      errors: [
        "Couldn't save — your browser's storage might be full or unavailable (e.g. private browsing)."
      ]
    };
  }
  return { quiz, errors: [] };
}
