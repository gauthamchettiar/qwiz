import { quizSchema, type Quiz } from '@/lib/schemas/quiz';

const STORAGE_KEY = 'qwiz:quizzes';

/** Validates each stored record against `quizSchema` and drops anything that doesn't match,
 * so a hand-edited or stale-schema localStorage value can't crash the app downstream — it just
 * quietly disappears from the list instead of blowing up a component that assumes a valid Quiz. */
function readAll(): Record<string, Quiz> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const valid: Record<string, Quiz> = {};
    for (const [id, candidate] of Object.entries(parsed)) {
      const result = quizSchema.safeParse(candidate);
      if (result.success) valid[id] = result.data;
      else console.warn(`Dropping invalid stored quiz "${id}":`, result.error.message);
    }
    return valid;
  } catch {
    return {};
  }
}

function writeAll(quizzes: Record<string, Quiz>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quizzes));
}

export function listQuizzes(): Quiz[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getQuiz(id: string): Quiz | null {
  return readAll()[id] ?? null;
}

export function saveQuiz(quiz: Quiz): void {
  const all = readAll();
  all[quiz.id] = quiz;
  writeAll(all);
}

export function deleteQuiz(id: string): boolean {
  const all = readAll();
  if (!(id in all)) return false;
  delete all[id];
  writeAll(all);
  return true;
}
