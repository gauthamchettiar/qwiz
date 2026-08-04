import { describe, expect, it } from 'vitest';
import { parseQwizGroup, type QuizGroup } from './quizGroup';
import {
  blockedLabel,
  entryRequiresWin,
  journeyDepth,
  journeyNodes,
  journeyProgressCount,
  journeyStages,
  type JourneyProgress
} from './journey';

/** A three-step chain: capitals → spelling → finale, where only the finale must be won. */
const TRAIL = [
  '---',
  ':mode=journey',
  ':require_win=false',
  '---',
  '',
  'quiz: a.qwiz',
  'id: capitals',
  '',
  'quiz: b.qwiz',
  'id: spelling',
  'requires: [capitals]',
  '',
  'quiz: c.qwiz',
  'id: finale',
  'requires: [spelling]',
  ':require_win=true'
].join('\n');

function build(source: string): QuizGroup {
  const { group, errors } = parseQwizGroup(source);
  expect(errors).toEqual([]);
  return group;
}

function statuses(group: QuizGroup, progress: JourneyProgress) {
  return Object.fromEntries(journeyNodes(group, progress).map((n) => [n.entry.id, n.status]));
}

describe('journeyNodes', () => {
  const group = build(TRAIL);

  it('opens only the entries with no prerequisites', () => {
    expect(statuses(group, {})).toEqual({
      capitals: 'unlocked',
      spelling: 'locked',
      finale: 'locked'
    });
  });

  it('unlocks the next step once its prerequisite is merely completed', () => {
    // require_win is false for this group, so finishing is enough.
    expect(statuses(group, { capitals: { completed: true, won: false } })).toMatchObject({
      capitals: 'completed',
      spelling: 'unlocked'
    });
  });

  it("holds a step whose prerequisite demands a win the player hasn't managed", () => {
    const strict = build(TRAIL.replace(':require_win=false', ':require_win=true'));
    expect(statuses(strict, { capitals: { completed: true, won: false } })).toMatchObject({
      capitals: 'attempted',
      spelling: 'locked'
    });
    expect(statuses(strict, { capitals: { completed: true, won: true } })).toMatchObject({
      capitals: 'won',
      spelling: 'unlocked'
    });
  });

  it('judges a prerequisite by what THAT entry required, not by what is waiting on it', () => {
    // `finale` is require_win; nothing depends on it here, but the same rule is what makes a boss
    // quiz a real gate when something does.
    const played: JourneyProgress = {
      capitals: { completed: true, won: false },
      spelling: { completed: true, won: false },
      finale: { completed: true, won: false }
    };
    // Completed but not won, and the entry demands a win — a status of its own, so the map can
    // say "you've been here and it didn't count" rather than showing it as untouched.
    expect(statuses(group, played).finale).toBe('attempted');
    expect(statuses(group, { ...played, finale: { completed: true, won: true } }).finale).toBe(
      'won'
    );
  });

  it('names what a locked entry is waiting on rather than just counting', () => {
    const [, spelling] = journeyNodes(group, {});
    expect(spelling.blockedBy).toEqual(['capitals']);
  });

  it('treats a missing prerequisite as blocking, never as silently open', () => {
    // The parser rejects this, so it can only arrive from a group built some other way — and
    // quietly opening a gate would be the worse failure.
    const orphaned: QuizGroup = {
      ...group,
      entries: [{ id: 'lonely', path: 'x.qwiz', requires: ['ghost'], settings: {} }]
    };
    expect(journeyNodes(orphaned, {})[0]).toMatchObject({
      status: 'locked',
      blockedBy: ['ghost']
    });
  });

  it('reports every requirement of a node waiting on several', () => {
    const diamond = build(
      [
        '---',
        ':mode=journey',
        '---',
        '',
        'quiz: a.qwiz',
        'id: a',
        '',
        'quiz: b.qwiz',
        'id: b',
        '',
        'quiz: c.qwiz',
        'id: c',
        'requires: [a, b]'
      ].join('\n')
    );
    const c = journeyNodes(diamond, { a: { completed: true, won: false } }).find(
      (n) => n.entry.id === 'c'
    );
    expect(c?.blockedBy).toEqual(['b']);
  });
});

describe('entryRequiresWin', () => {
  const group = build(TRAIL);

  it('takes the group default, and lets an entry override it', () => {
    const [capitals, , finale] = group.entries;
    expect(entryRequiresWin(group, capitals)).toBe(false);
    expect(entryRequiresWin(group, finale)).toBe(true);
  });

  it('lets an entry opt OUT of a strict group, not just into one', () => {
    const strict = build(
      [
        '---',
        ':mode=journey',
        ':require_win=true',
        '---',
        '',
        'quiz: a.qwiz',
        'id: a',
        ':require_win=false'
      ].join('\n')
    );
    expect(entryRequiresWin(strict, strict.entries[0])).toBe(false);
  });
});

describe('journeyDepth', () => {
  it('measures the longest chain behind each entry', () => {
    const depths = journeyDepth(build(TRAIL).entries);
    expect(depths.get('capitals')).toBe(0);
    expect(depths.get('spelling')).toBe(1);
    expect(depths.get('finale')).toBe(2);
  });

  it('takes the LONGEST path, so a shortcut cannot pull a node forward', () => {
    const group = build(
      [
        '---',
        ':mode=journey',
        '---',
        '',
        'quiz: a.qwiz',
        'id: a',
        '',
        'quiz: b.qwiz',
        'id: b',
        'requires: [a]',
        '',
        'quiz: c.qwiz',
        'id: c',
        'requires: [a, b]'
      ].join('\n')
    );
    expect(journeyDepth(group.entries).get('c')).toBe(2);
  });

  it('terminates on a cycle instead of recursing until the stack gives out', () => {
    // Unreachable through the parser, which rejects cycles — guarded anyway, because that is a
    // fact about a different module.
    const cyclic = [
      { id: 'a', path: 'a.qwiz', requires: ['b'], settings: {} },
      { id: 'b', path: 'b.qwiz', requires: ['a'], settings: {} }
    ];
    expect(() => journeyDepth(cyclic)).not.toThrow();
  });
});

describe('journeyStages', () => {
  it('labels the run from Start to Finish', () => {
    const stages = journeyStages(journeyNodes(build(TRAIL), {}));
    expect(stages.map((s) => s.label)).toEqual(['Start', 'Stage 2', 'Finish']);
  });

  it('puts entries that can be played in any order side by side', () => {
    const parallel = build(
      [
        '---',
        ':mode=journey',
        '---',
        '',
        'quiz: a.qwiz',
        'id: a',
        '',
        'quiz: b.qwiz',
        'id: b',
        '',
        'quiz: c.qwiz',
        'id: c',
        'requires: [a, b]'
      ].join('\n')
    );
    const stages = journeyStages(journeyNodes(parallel, {}));
    expect(stages).toHaveLength(2);
    expect(stages[0].nodes.map((n) => n.entry.id)).toEqual(['a', 'b']);
    expect(stages[1].nodes.map((n) => n.entry.id)).toEqual(['c']);
  });

  it('calls a single stage Start rather than Finish', () => {
    const flat = build(['---', ':mode=journey', '---', '', 'quiz: a.qwiz', 'id: a'].join('\n'));
    expect(journeyStages(journeyNodes(flat, {})).map((s) => s.label)).toEqual(['Start']);
  });
});

describe('journeyProgressCount', () => {
  it('never counts an attempted require_win node as cleared', () => {
    const group = build(TRAIL);
    // The prerequisites have to be cleared first, or `finale` is `locked` — which takes precedence
    // over every other status, since a node you can't reach has no other state worth reporting.
    const nodes = journeyNodes(group, {
      capitals: { completed: true, won: false },
      spelling: { completed: true, won: false },
      finale: { completed: true, won: false }
    });
    expect(nodes.find((n) => n.entry.id === 'finale')?.status).toBe('attempted');
    // Two cleared, not three: finishing the finale didn't count, which is the point of require_win.
    expect(journeyProgressCount(nodes).cleared).toBe(2);
  });

  it('counts what a player would count', () => {
    const group = build(TRAIL);
    expect(journeyProgressCount(journeyNodes(group, {}))).toEqual({ cleared: 0, total: 3 });
    expect(
      journeyProgressCount(
        journeyNodes(group, {
          capitals: { completed: true, won: false },
          spelling: { completed: true, won: true }
        })
      )
    ).toEqual({ cleared: 2, total: 3 });
  });
});

describe('blockedLabel', () => {
  const label = (id: string) => id[0].toUpperCase() + id.slice(1);

  it('reads as a sentence for one, two and three prerequisites', () => {
    expect(blockedLabel(['capitals'], label)).toBe('Clear Capitals to unlock');
    expect(blockedLabel(['capitals', 'spelling'], label)).toBe(
      'Clear Capitals and Spelling to unlock'
    );
    expect(blockedLabel(['a', 'b', 'c'], label)).toBe('Clear A, B and C to unlock');
  });

  it('is empty when nothing blocks', () => {
    expect(blockedLabel([], label)).toBe('');
  });
});
