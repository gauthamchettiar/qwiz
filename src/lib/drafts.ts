import type { QuestionInstance, TriviaSettings } from './types';

export interface DraftRecord {
  id: string;
  title: string;
  description: string;
  questions: QuestionInstance[];
  settings: TriviaSettings;
  updatedAt: string;
  tags?: string[];
}

const STORAGE_KEY = 'qwiz:drafts';

function readAll(): Record<string, DraftRecord> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(drafts: Record<string, DraftRecord>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function listDrafts(): DraftRecord[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getDraft(id: string): DraftRecord | null {
  return readAll()[id] ?? null;
}

export function saveDraft(draft: DraftRecord): void {
  const all = readAll();
  all[draft.id] = draft;
  writeAll(all);
}

export function deleteDraft(id: string): void {
  const all = readAll();
  delete all[id];
  writeAll(all);
}
