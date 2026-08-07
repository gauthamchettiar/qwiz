import { parseQwizFile } from '@/lib/utils/quizScript';
import { saveQuiz } from '@/lib/stores/quizzes';
import type { Quiz } from '@/lib/schemas/quiz';

/** Builds a brand-new quiz from a piece of `.qwiz` source (fresh quiz id, fresh per-question ids,
 * fresh timestamps — never overwrites an existing quiz) WITHOUT saving it. The exact inverse is
 * `qwizSourceFromQuiz` in qwizDocument.ts. Split out from
 * `importQwizSource` for the shared-link player, which decodes a quiz out of a URL and plays it
 * from memory: a link someone opened is not a quiz they asked to keep, so nothing is written until
 * they press "Save a copy". `errors` is non-empty (and `quiz` absent) if the source doesn't parse
 * cleanly. */
export function quizFromQwizSource(source: string): { quiz?: Quiz; errors: string[] } {
  const { frontmatter, questionCodes, errors } = parseQwizFile(source);
  if (errors.length > 0) return { errors };

  const now = new Date().toISOString();
  return {
    quiz: {
      id: crypto.randomUUID(),
      title: frontmatter.title,
      description: frontmatter.description,
      category: frontmatter.category,
      tags: frontmatter.tags,
      settings: frontmatter.settings,
      themePreset: frontmatter.themePreset,
      themeCss: frontmatter.themeCss,
      // Deliberately left unset rather than defaulted to 'colors' here. Unset means "nobody has
      // been asked yet", which is what the welcome screen looks for; writing a verdict in at import
      // time would silently answer a question on the visitor's behalf.
      createdAt: now,
      updatedAt: now,
      questions: questionCodes.map((code) => ({ id: crypto.randomUUID(), code }))
    },
    errors: []
  };
}

/** The same thing, saved to the quiz library. Shared by the paste/upload import flow, the "Load a
 * sample" flow and a shared link's "Save a copy", since all three ultimately do the same thing to a
 * piece of source text. */
export function importQwizSource(source: string): { quiz?: Quiz; errors: string[] } {
  const built = quizFromQwizSource(source);
  if (!built.quiz) return built;

  if (!saveQuiz(built.quiz)) {
    return {
      errors: [
        "Couldn't save — your browser's storage might be full or unavailable (e.g. private browsing)."
      ]
    };
  }
  return built;
}
