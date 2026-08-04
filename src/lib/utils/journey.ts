/** The unlock rules of a `journey` group: which quizzes are open, which are still locked, and why.
 *
 * Pure and framework-free, so the map component draws what it's handed and decides nothing. The
 * cycle case can't reach here — `parseQwizGroup` rejects a `requires:` loop at parse time — but the
 * depth walk below still guards against one rather than trusting that from a different module.
 */

import type { QuizGroupEntry, QuizGroup } from './quizGroup';

/** What a player has done with one quiz. `won` is stickier than it looks — see `recordJourneyPlay`
 * in `stores/groupProgress.ts`: once a quiz has been cleared it stays cleared, so a later worse run
 * can never re-lock what it already opened. */
export interface JourneyPlay {
  completed: boolean;
  won: boolean;
}

export type JourneyProgress = Record<string, JourneyPlay>;

/** `attempted` is the one that isn't obvious, and it earns its place: a `require_win` quiz that was
 * played but not won is playable and NOT cleared, which is neither `unlocked` (never touched) nor
 * `completed` (done with). Collapsing it into either loses the only thing the player wants to know
 * — that they've been here and it didn't count. */
export type JourneyStatus = 'won' | 'completed' | 'attempted' | 'unlocked' | 'locked';

export interface JourneyNode {
  entry: QuizGroupEntry;
  status: JourneyStatus;
  /** Entry ids this one is still waiting on — empty unless `status` is `locked`. Named rather than
   * counted so the UI can say what to go and play. */
  blockedBy: string[];
  /** Whether clearing this specific node needs a win, after the group default and the entry's own
   * override. Surfaced so the map can warn before a player starts it, not after. */
  requiresWin: boolean;
}

/** Whether an entry needs to be WON to count as cleared: the group's `require_win`, overridden by
 * the entry's own. */
export function entryRequiresWin(group: QuizGroup, entry: QuizGroupEntry): boolean {
  const own = entry.settings.require_win;
  if (typeof own === 'boolean') return own;
  return group.settings.require_win === true;
}

/** Whether a prerequisite has been satisfied — which depends on what THAT entry required, not on
 * what the entry waiting for it requires. A boss quiz marked `require_win` is only cleared by
 * winning it, whoever is asking. */
function isCleared(group: QuizGroup, entry: QuizGroupEntry, progress: JourneyProgress): boolean {
  const play = progress[entry.id];
  if (!play) return false;
  return entryRequiresWin(group, entry) ? play.won : play.completed;
}

/** Every entry with its status, in manifest order.
 *
 * An entry whose `requires` names something absent is treated as blocked by it rather than silently
 * unlocked — the parser already rejects that case, so this only matters for a group assembled some
 * other way, where quietly opening a gate would be the worse failure. */
export function journeyNodes(group: QuizGroup, progress: JourneyProgress): JourneyNode[] {
  const byId = new Map(group.entries.map((entry) => [entry.id, entry]));

  return group.entries.map((entry) => {
    const blockedBy = entry.requires.filter((id) => {
      const required = byId.get(id);
      return !required || !isCleared(group, required, progress);
    });

    const play = progress[entry.id];
    const requiresWin = entryRequiresWin(group, entry);

    let status: JourneyStatus;
    if (blockedBy.length > 0) status = 'locked';
    else if (play?.won) status = 'won';
    else if (play?.completed) status = requiresWin ? 'attempted' : 'completed';
    else status = 'unlocked';

    return { entry, status, blockedBy, requiresWin };
  });
}

/** How far into the journey a node sits: the longest chain of prerequisites behind it. Used to lay
 * the map out in stages, so branches that can be played in any order sit side by side instead of
 * pretending to be a sequence.
 *
 * Cycle-guarded with a `seen` set. A cycle would otherwise recurse until the stack gave out, and
 * "the manifest parser rejects those" is a fact about a different file. */
export function journeyDepth(entries: readonly QuizGroupEntry[]): Map<string, number> {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const depths = new Map<string, number>();

  const visit = (id: string, seen: Set<string>): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;

    const entry = byId.get(id);
    if (!entry || entry.requires.length === 0) {
      depths.set(id, 0);
      return 0;
    }

    seen.add(id);
    const depth =
      1 + Math.max(0, ...entry.requires.filter((r) => byId.has(r)).map((r) => visit(r, seen)));
    seen.delete(id);

    depths.set(id, depth);
    return depth;
  };

  for (const entry of entries) visit(entry.id, new Set());
  return depths;
}

export interface JourneyStage {
  /** `Start`, `Stage 2`, …, `Finish` — computed by the caller-facing `journeyStages`. */
  label: string;
  nodes: JourneyNode[];
}

/** The map, bucketed into stages by prerequisite depth. */
export function journeyStages(nodes: readonly JourneyNode[]): JourneyStage[] {
  const depths = journeyDepth(nodes.map((node) => node.entry));

  const byDepth = new Map<number, JourneyNode[]>();
  for (const node of nodes) {
    const depth = depths.get(node.entry.id) ?? 0;
    const bucket = byDepth.get(depth);
    if (bucket) bucket.push(node);
    else byDepth.set(depth, [node]);
  }

  const ordered = [...byDepth.keys()].sort((a, b) => a - b);
  return ordered.map((depth, index) => ({
    label:
      index === 0
        ? 'Start'
        : index === ordered.length - 1 && ordered.length > 1
          ? 'Finish'
          : `Stage ${index + 1}`,
    nodes: byDepth.get(depth)!
  }));
}

/** How much of the journey is done, for the header. Counts what a player would count: quizzes
 * they've actually cleared, against the total. */
export function journeyProgressCount(nodes: readonly JourneyNode[]): {
  cleared: number;
  total: number;
} {
  return {
    // `attempted` deliberately isn't cleared: the whole point of require_win is that finishing
    // isn't enough.
    cleared: nodes.filter((node) => node.status === 'won' || node.status === 'completed').length,
    total: nodes.length
  };
}

/** "Clear Capitals and Spelling to unlock" — the hint under a locked node. Takes the display label
 * for each blocking id, since ids are slugs and a player has never seen them. */
export function blockedLabel(
  blockedBy: readonly string[],
  labelOf: (id: string) => string
): string {
  const names = blockedBy.map(labelOf);
  if (names.length === 0) return '';
  if (names.length === 1) return `Clear ${names[0]} to unlock`;
  const last = names[names.length - 1];
  return `Clear ${names.slice(0, -1).join(', ')} and ${last} to unlock`;
}
