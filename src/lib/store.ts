import type { Trivia, TriviaSummary } from './types';
import { toSummary } from './types';

const STORAGE_KEY = 'qwiz:trivias';

function readAll(): Record<string, Trivia> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(trivias: Record<string, Trivia>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trivias));
}

export function listTrivias(): TriviaSummary[] {
  return Object.values(readAll())
    .map(toSummary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getTrivia(id: string): Trivia | null {
  return readAll()[id] ?? null;
}

export function saveTrivia(trivia: Trivia): void {
  const all = readAll();
  all[trivia.id] = trivia;
  writeAll(all);
}

export function deleteTrivia(id: string): boolean {
  const all = readAll();
  if (!(id in all)) return false;
  delete all[id];
  writeAll(all);
  return true;
}

/** Every saved trivia, for a full backup export. */
export function exportAllTrivias(): Trivia[] {
  return Object.values(readAll());
}

/** Merges trivias into the store (same id overwrites), for restoring a backup. Returns the count. */
export function importAllTrivias(trivias: Trivia[]): number {
  const all = readAll();
  for (const t of trivias) all[t.id] = t;
  writeAll(all);
  return trivias.length;
}
