/** The `gauntlet`: pick a category, answer a few of its questions, pick again — for a fixed number
 * of rounds, scored on the average of how you did in each.
 *
 * This is the one mode that isn't a quiz wearing a different hat. It draws questions ACROSS quizzes
 * mid-run, so it can't be a synthesised document the ordinary player runs (as `merge` is), and it
 * can't be a sequence of whole quizzes (as `playlist` is). What's here is the pure part — which
 * categories exist, which questions a pick draws, and what a run scores — so the session component
 * owns presentation and nothing else.
 *
 * Scoring is the average of per-round PERCENTAGES rather than a straight point total, deliberately:
 * a category whose questions happen to be worth more points would otherwise dominate the score
 * regardless of how well the player did in it, which would make choosing a category a scoring
 * decision rather than a knowledge one.
 */

import { dirOf } from './githubRef';
import { shuffledArray } from './shuffle';
import type { QuizGroup, QuizGroupEntry } from './quizGroup';

/** Questions with no folder of their own. Named rather than hidden, so a group that keeps some
 * quizzes at its root still offers them. */
export const GENERAL_CATEGORY = 'General';

export interface GauntletCategory {
  name: string;
  /** Every entry filed under this category, in manifest order. */
  entries: QuizGroupEntry[];
}

/** The categories a gauntlet offers: the group's top-level subfolders, relative to the folder the
 * group itself is rooted at.
 *
 * Top-level only, not the full tree — a picker showing `history/tudors/wives` as a distinct choice
 * from `history` asks the player to navigate a filesystem when the point is to pick a subject. */
export function gauntletCategories(group: QuizGroup, base = ''): GauntletCategory[] {
  const prefix = base ? `${base.replace(/\/+$/, '')}/` : '';
  const byName = new Map<string, QuizGroupEntry[]>();

  for (const entry of group.entries) {
    const relative = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path;
    const folder = dirOf(relative).split('/')[0];
    const name = entry.group || folder || GENERAL_CATEGORY;

    const bucket = byName.get(name);
    if (bucket) bucket.push(entry);
    else byName.set(name, [entry]);
  }

  return [...byName.entries()]
    .map(([name, entries]) => ({ name, entries }))
    .sort((a, b) => {
      // "General" last: it's the leftovers, not a subject anyone chose to create.
      if (a.name === GENERAL_CATEGORY) return 1;
      if (b.name === GENERAL_CATEGORY) return -1;
      return a.name.localeCompare(b.name);
    });
}

export function questionsPerPick(group: QuizGroup): number {
  const value = group.settings.questions_per_pick;
  return typeof value === 'number' && value >= 1 ? Math.floor(value) : 1;
}

export function totalRounds(group: QuizGroup): number {
  const value = group.settings.rounds;
  return typeof value === 'number' && value >= 1 ? Math.floor(value) : 10;
}

export interface RoundScore {
  category: string;
  earned: number;
  max: number;
}

/** A run's score: the mean of each round's percentage.
 *
 * A round with nothing to score (`max` of 0 — every question skipped, or worth nothing) is left out
 * of the average rather than counted as 0%. Counting it would punish a player for a category the
 * author happened to make unscorable, which is not something they chose. */
export function gauntletScore(rounds: readonly RoundScore[]): {
  percentage: number;
  rounds: number;
} {
  const scored = rounds.filter((round) => round.max > 0);
  if (scored.length === 0) return { percentage: 0, rounds: 0 };

  const total = scored.reduce((sum, round) => sum + (round.earned / round.max) * 100, 0);
  return { percentage: total / scored.length, rounds: scored.length };
}

/** Whether a run cleared the bar. Reuses the quiz-wide `percent_to_win` (default 75) rather than
 * inventing a gauntlet-only threshold, so an author sets a pass mark the same way everywhere. */
export function gauntletWon(group: QuizGroup, percentage: number): boolean {
  const target = group.settings.percent_to_win;
  return percentage >= (typeof target === 'number' ? target : 75);
}

/** Draws the next `count` question indices for a category, skipping any already used in this run.
 *
 * `used` is keyed by `${entryId}#${questionIndex}` so a run never asks the same question twice —
 * which matters more here than anywhere else in the app, since a gauntlet deliberately returns to
 * the same categories round after round. Returns fewer than `count` (possibly none) once a category
 * is exhausted, which the session reports rather than looping forever.
 */
export function drawQuestions(
  category: GauntletCategory,
  available: ReadonlyMap<string, number>,
  used: ReadonlySet<string>,
  count: number
): { entryId: string; index: number }[] {
  const pool: { entryId: string; index: number }[] = [];
  for (const entry of category.entries) {
    const total = available.get(entry.id) ?? 0;
    for (let index = 0; index < total; index += 1) {
      if (!used.has(questionKey(entry.id, index))) pool.push({ entryId: entry.id, index });
    }
  }
  return shuffledArray(pool).slice(0, count);
}

export function questionKey(entryId: string, index: number): string {
  return `${entryId}#${index}`;
}

/** Whether any category still has an unused question — what tells a run it has to stop early. */
export function hasQuestionsLeft(
  categories: readonly GauntletCategory[],
  available: ReadonlyMap<string, number>,
  used: ReadonlySet<string>
): boolean {
  return categories.some((category) =>
    category.entries.some((entry) => {
      const total = available.get(entry.id) ?? 0;
      for (let index = 0; index < total; index += 1) {
        if (!used.has(questionKey(entry.id, index))) return true;
      }
      return false;
    })
  );
}
