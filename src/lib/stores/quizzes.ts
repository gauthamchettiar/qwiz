import type { Quiz } from '@/lib/schemas/quiz';

const STORAGE_KEY = 'qwiz:quizzes';

function readAll(): Record<string, Quiz> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
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
