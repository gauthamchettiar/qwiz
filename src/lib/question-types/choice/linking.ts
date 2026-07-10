import { normalizeAnswer, type ChoiceOption } from './index';

export interface LinkedMatch {
  /** Number of input options successfully matched to a distinct compatible typed value. */
  count: number;
  /** matchRight[categoryIndex] = index into inputOptions of the box matched to it, or -1. */
  matchRight: number[];
}

/**
 * Bipartite maximum matching (Kuhn's algorithm) between linked Input options ("categories",
 * each defined by its validAnswers) and the player's typed values ("boxes", one per option,
 * same index). A box may satisfy any category whose validAnswers include its typed value, but
 * each category can be claimed by at most one box and vice versa.
 */
export function matchLinkedInputs(inputOptions: ChoiceOption[], typed: Record<string, string>): LinkedMatch {
  const n = inputOptions.length;
  const typedNorm = inputOptions.map((o) => normalizeAnswer(typed[o.id] ?? ''));

  function compatible(boxIndex: number, categoryIndex: number): boolean {
    const value = typedNorm[boxIndex];
    if (!value) return false;
    return (inputOptions[categoryIndex].validAnswers ?? []).map(normalizeAnswer).includes(value);
  }

  const matchRight: number[] = new Array(n).fill(-1);

  function tryAssign(boxIndex: number, visited: boolean[]): boolean {
    for (let categoryIndex = 0; categoryIndex < n; categoryIndex++) {
      if (!compatible(boxIndex, categoryIndex) || visited[categoryIndex]) continue;
      visited[categoryIndex] = true;
      if (matchRight[categoryIndex] === -1 || tryAssign(matchRight[categoryIndex], visited)) {
        matchRight[categoryIndex] = boxIndex;
        return true;
      }
    }
    return false;
  }

  let count = 0;
  for (let boxIndex = 0; boxIndex < n; boxIndex++) {
    if (tryAssign(boxIndex, new Array(n).fill(false))) count++;
  }

  return { count, matchRight };
}
