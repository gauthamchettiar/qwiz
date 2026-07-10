function storageKey(triviaId: string): string {
  return `qwiz:best:${triviaId}`;
}

export function getBestScore(triviaId: string): number | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(storageKey(triviaId));
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Records a finished attempt's score, updating the stored best if it's higher. */
export function recordScore(triviaId: string, score: number): { best: number; isNewBest: boolean } {
  const previous = getBestScore(triviaId);
  const isNewBest = previous === null || score > previous;
  const best = isNewBest ? score : previous;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(storageKey(triviaId), String(best));
  }
  return { best, isNewBest };
}
