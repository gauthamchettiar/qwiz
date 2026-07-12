// Per-trivia play progress, keyed by trivia id in localStorage. Recorded by the player when a
// run finishes, and read by journey mode to decide which trivias are unlocked.

const KEY = 'qwiz:progress';

export interface PlayRecord {
  /** The player has finished at least one run. */
  completed: boolean;
  /** They've "cleared" it — met the win condition (or finished a trivia with no win gate). */
  won: boolean;
}

function readAll(): Record<string, PlayRecord> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, PlayRecord>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, PlayRecord>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getPlay(triviaId: string): PlayRecord | null {
  return readAll()[triviaId] ?? null;
}

/** Records a finished run. `won` is sticky — once a trivia has been cleared it stays cleared,
 * so a later worse run can't re-lock what it already unlocked. */
export function recordPlay(triviaId: string, won: boolean): void {
  const all = readAll();
  const prev = all[triviaId];
  all[triviaId] = { completed: true, won: (prev?.won ?? false) || won };
  writeAll(all);
}

/** Clears progress for the given trivia ids (used by "Reset progress" in a journey). */
export function resetPlays(triviaIds: string[]): void {
  const all = readAll();
  for (const id of triviaIds) delete all[id];
  writeAll(all);
}
