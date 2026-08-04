import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQwizFile } from './quizScript';
import {
  GROUP_ENTRY_RULES,
  GROUP_FRONTMATTER_RULES,
  GROUP_MODES,
  GROUP_SETTING_MODES,
  GROUP_SETTING_RULES,
  groupMode,
  parseQwizGroup,
  serializeQwizGroup,
  slugFromPath
} from './quizGroup';

function parse(lines: string[]) {
  return parseQwizGroup(lines.join('\n'));
}

describe('parseQwizGroup — the happy paths', () => {
  it('reads a journey with prerequisites and per-entry settings', () => {
    const { group, errors } = parse([
      '---',
      'title: The Qwiz Trail',
      'description: Clear one to unlock the next.',
      'category: general knowledge',
      'tags: [trail, journey]',
      ':mode=journey',
      ':require_win=false',
      '---',
      '',
      'quiz: world-capitals.qwiz',
      'id: capitals',
      '',
      'quiz: spelling-bee.qwiz',
      'id: spelling',
      'requires: [capitals]',
      '',
      'quiz: grand-finale.qwiz',
      'id: finale',
      'requires: [spelling]',
      ':require_win=true'
    ]);

    expect(errors).toEqual([]);
    expect(group.title).toBe('The Qwiz Trail');
    expect(group.tags).toEqual(['trail', 'journey']);
    expect(groupMode(group)).toBe('journey');
    expect(group.entries).toHaveLength(3);
    expect(group.entries[1]).toMatchObject({
      id: 'spelling',
      path: 'spelling-bee.qwiz',
      requires: ['capitals']
    });
    expect(group.entries[2].settings.require_win).toBe(true);
  });

  it('defaults to folders mode, with no manifest frontmatter needed beyond the entries', () => {
    const { group, errors } = parse([
      '---',
      'title: Pub Quizzes',
      '---',
      '',
      'quiz: rounds/one.qwiz',
      '',
      'quiz: rounds/two.qwiz'
    ]);

    expect(errors).toEqual([]);
    expect(groupMode(group)).toBe('folders');
    // Ids come free from the filenames, so `id:` is only needed where something refers to it.
    expect(group.entries.map((e) => e.id)).toEqual(['one', 'two']);
  });

  it('accepts a title override, which is what lets a lobby render without fetching every quiz', () => {
    const { group, errors } = parse([
      '---',
      'title: Group',
      '---',
      '',
      'quiz: a.qwiz',
      'title: The Opening Round',
      'group: Week 1'
    ]);

    expect(errors).toEqual([]);
    expect(group.entries[0]).toMatchObject({ title: 'The Opening Round', group: 'Week 1' });
  });

  it('carries quiz-wide settings at group level, which is what makes merge mode work', () => {
    const { group, errors } = parse([
      '---',
      'title: Mega',
      ':mode=merge',
      ':shuffle_questions=true',
      ':questions_per_run=20',
      ':timer_mode=per_quiz',
      ':timer_seconds=600',
      '---',
      '',
      'quiz: a.qwiz'
    ]);

    expect(errors).toEqual([]);
    expect(group.settings).toMatchObject({
      questions_per_run: 20,
      timer_mode: 'per_quiz',
      timer_seconds: 600
    });
  });

  it('parses every mode it claims to support', () => {
    for (const mode of GROUP_MODES) {
      // `id:` is only mandatory in journey (so a `requires:` typo can't orphan a node), but it's
      // always legal — supplying it keeps this one loop valid across all six modes.
      const { group, errors } = parse(['---', `:mode=${mode}`, '---', '', 'quiz: a.qwiz', 'id: a']);
      expect(errors, `mode=${mode}`).toEqual([]);
      expect(groupMode(group)).toBe(mode);
    }
  });
});

describe('parseQwizGroup — the closed set', () => {
  it('rejects an unknown frontmatter field', () => {
    const { errors } = parse(['---', 'author: someone', '---', '', 'quiz: a.qwiz']);
    expect(errors.join()).toMatch(/Unknown frontmatter field "author"/);
  });

  it('rejects an unknown setting rather than passing it through', () => {
    const { errors } = parse(['---', ':nonsense=1', '---', '', 'quiz: a.qwiz']);
    expect(errors.join()).toMatch(/not a recognized setting/);
  });

  it('rejects an unknown mode', () => {
    const { errors } = parse(['---', ':mode=carousel', '---', '', 'quiz: a.qwiz']);
    expect(errors.join()).toMatch(/must be one of/);
  });

  it('rejects a group-wide key used in a mode it means nothing in', () => {
    // An author writing :rounds=5 under a journey believes something is happening. It isn't.
    const { errors } = parse(['---', ':mode=journey', ':rounds=5', '---', '', 'quiz: a.qwiz']);
    expect(errors.join()).toMatch(/"rounds" only applies to gauntlet groups/);
  });

  it('rejects an entry key used in the wrong mode', () => {
    const withRequires = parse([
      '---',
      ':mode=folders',
      '---',
      '',
      'quiz: a.qwiz',
      'requires: [b]'
    ]);
    expect(withRequires.errors.join()).toMatch(/"requires" only applies to journey groups/);

    const withGroup = parse([
      '---',
      ':mode=journey',
      '---',
      '',
      'quiz: a.qwiz',
      'id: a',
      'group: X'
    ]);
    expect(withGroup.errors.join()).toMatch(/"group" only applies to folders groups/);
  });

  it('rejects an unknown key inside an entry', () => {
    const { errors } = parse(['---', '---', '', 'quiz: a.qwiz', 'colour: red']);
    expect(errors.join()).toMatch(/Unknown key "colour"/);
  });

  it('rejects a block with no quiz: line', () => {
    const { errors } = parse(['---', '---', '', 'id: orphan']);
    expect(errors.join()).toMatch(/needs a "quiz:" line/);
  });

  it('rejects a quiz: that is not a .qwiz file', () => {
    const { errors } = parse(['---', '---', '', 'quiz: notes.md']);
    expect(errors.join()).toMatch(/must point at a \.qwiz file/);
  });

  it('refuses a URL, so a manifest can never become a general-purpose fetcher', () => {
    const { errors } = parse(['---', '---', '', 'quiz: https://elsewhere.test/evil.qwiz']);
    expect(errors.join()).toMatch(/can't be a URL/);
  });

  it('refuses an absolute path', () => {
    const { errors } = parse(['---', '---', '', 'quiz: /etc/a.qwiz']);
    expect(errors.join()).toMatch(/isn't a valid path/);
  });

  it('reports an unclosed frontmatter fence', () => {
    const { errors } = parse(['---', 'title: X', '', 'quiz: a.qwiz']);
    expect(errors.join()).toMatch(/never closed/);
  });
});

describe('parseQwizGroup — journey integrity', () => {
  it('requires an explicit id, so a typo cannot silently orphan a node', () => {
    const { errors } = parse(['---', ':mode=journey', '---', '', 'quiz: a.qwiz']);
    expect(errors.join()).toMatch(/journey entry needs an "id:"/);
  });

  it('rejects a requires: naming something that is not in the group', () => {
    const { errors } = parse([
      '---',
      ':mode=journey',
      '---',
      '',
      'quiz: a.qwiz',
      'id: a',
      '',
      'quiz: b.qwiz',
      'id: b',
      'requires: [typo]'
    ]);
    expect(errors.join()).toMatch(/"b" requires "typo", which isn't a quiz in this group/);
  });

  it('rejects a cycle, which would render as a permanently locked group', () => {
    const { errors } = parse([
      '---',
      ':mode=journey',
      '---',
      '',
      'quiz: a.qwiz',
      'id: a',
      'requires: [b]',
      '',
      'quiz: b.qwiz',
      'id: b',
      'requires: [a]'
    ]);
    expect(errors.join()).toMatch(/loop in this journey/);
  });

  it('rejects a self-requirement, the smallest possible cycle', () => {
    const { errors } = parse([
      '---',
      ':mode=journey',
      '---',
      '',
      'quiz: a.qwiz',
      'id: a',
      'requires: [a]'
    ]);
    expect(errors.join()).toMatch(/loop in this journey/);
  });

  it('accepts a diamond, which is a DAG and not a cycle', () => {
    const { errors } = parse([
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
      'requires: [a]',
      '',
      'quiz: d.qwiz',
      'id: d',
      'requires: [b, c]'
    ]);
    expect(errors).toEqual([]);
  });

  it('rejects two entries sharing an id', () => {
    const { errors } = parse(['---', '---', '', 'quiz: rounds/a.qwiz', '', 'quiz: other/a.qwiz']);
    expect(errors.join()).toMatch(/share the id "a"/);
  });
});

describe('slugFromPath', () => {
  it('derives a referencable id from a filename', () => {
    expect(slugFromPath('rounds/World Capitals.qwiz')).toBe('world-capitals');
    expect(slugFromPath('a.qwiz')).toBe('a');
    expect(slugFromPath('deep/nested/Round_1.QWIZ')).toBe('round-1');
  });
});

describe('round-tripping', () => {
  const SOURCE = [
    '---',
    'title: The Qwiz Trail',
    'description: Clear one to unlock the next.',
    'category: general knowledge',
    'tags: [trail, journey]',
    ':mode=journey',
    ':require_win=false',
    '---',
    '',
    'quiz: world-capitals.qwiz',
    'id: capitals',
    '',
    'quiz: spelling-bee.qwiz',
    'id: spelling',
    'requires: [capitals]',
    '',
    'quiz: grand-finale.qwiz',
    'id: finale',
    'requires: [spelling]',
    ':require_win=true'
  ].join('\n');

  it('parses, serializes and parses back to the same group', () => {
    const first = parseQwizGroup(SOURCE);
    expect(first.errors).toEqual([]);

    const second = parseQwizGroup(serializeQwizGroup(first.group));
    expect(second.errors).toEqual([]);
    expect(second.group).toEqual(first.group);
  });

  it('round-trips a journey whose ids match their filename slugs', () => {
    // The case the TRAIL fixture above misses: its ids (capitals, spelling) differ from their
    // slugs (world-capitals, spelling-bee), so they were always written. An id EQUAL to its slug
    // used to be omitted as redundant — producing a journey this module could not read back,
    // since journey mode requires the line.
    const source = [
      '---',
      ':mode=journey',
      '---',
      '',
      'quiz: capitals.qwiz',
      'id: capitals',
      '',
      'quiz: spelling.qwiz',
      'id: spelling',
      'requires: [capitals]'
    ].join('\n');

    const first = parseQwizGroup(source);
    expect(first.errors).toEqual([]);

    const serialized = serializeQwizGroup(first.group);
    expect(serialized).toContain('id: capitals');

    const second = parseQwizGroup(serialized);
    expect(second.errors).toEqual([]);
    expect(second.group).toEqual(first.group);
  });

  it('round-trips a folders group with titles and section labels', () => {
    const source = [
      '---',
      'title: Pub Quizzes',
      'description: ',
      ':mode=folders',
      '---',
      '',
      'quiz: rounds/one.qwiz',
      'title: The Opening Round',
      'group: Week 1',
      ':timer_mode=per_quiz',
      ':timer_seconds=300'
    ].join('\n');

    const first = parseQwizGroup(source);
    expect(first.errors).toEqual([]);
    const second = parseQwizGroup(serializeQwizGroup(first.group));
    expect(second.errors).toEqual([]);
    expect(second.group).toEqual(first.group);
  });
});

// The example groups are the worked reference the docs link to and the app itself offers as
// "load an example" — the first thing anyone copies, so a broken one is a bug with an audience.
// Same reasoning as e2e/examples.spec.ts playing every example quiz.
describe('examples/groups', () => {
  const ROOT = 'examples/groups';

  /** Every `.qwizgroup` under examples/, hub included, found the way the app's own discovery does
   * rather than from a hard-coded list — adding a mode folder must not need this test edited. */
  const manifests = readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.qwizgroup'))
    .map((entry) => `${ROOT}/${entry}`)
    .sort();

  it('ships one group per mode, plus the hub that lists them', () => {
    const modes = manifests
      .map((path) => groupMode(parseQwizGroup(readFileSync(path, 'utf8')).group))
      .sort();
    // folders twice: the hub, and the folders example itself.
    expect(modes).toEqual([
      'folders',
      'folders',
      'gauntlet',
      'journey',
      'merge',
      'playlist',
      'shuffle'
    ]);
  });

  it.each(manifests)('%s parses with no errors', (path) => {
    expect(parseQwizGroup(readFileSync(path, 'utf8')).errors).toEqual([]);
  });

  it.each(manifests)('%s names quiz files that exist and themselves parse', (path) => {
    const { group } = parseQwizGroup(readFileSync(path, 'utf8'));
    const dir = path.slice(0, path.lastIndexOf('/'));

    for (const entry of group.entries) {
      const source = readFileSync(`${dir}/${entry.path}`, 'utf8');
      expect(parseQwizFile(source).errors, `${entry.path} should parse`).toEqual([]);
    }
  });

  it('gives the journey a coherent set of prerequisites', () => {
    const { group } = parseQwizGroup(readFileSync(`${ROOT}/journey/.qwizgroup`, 'utf8'));
    const ids = new Set(group.entries.map((e) => e.id));
    for (const entry of group.entries) {
      for (const required of entry.requires) expect(ids).toContain(required);
    }
  });

  it('gives the gauntlet enough questions for a full run', () => {
    const path = `${ROOT}/gauntlet/.qwizgroup`;
    const { group } = parseQwizGroup(readFileSync(path, 'utf8'));
    const total = group.entries.reduce(
      (sum, entry) =>
        sum +
        parseQwizFile(readFileSync(`${ROOT}/gauntlet/${entry.path}`, 'utf8')).questionCodes.length,
      0
    );
    // rounds x questions_per_pick, or the example runs dry before it finishes and demonstrates
    // the wrong thing.
    const needed =
      (typeof group.settings.rounds === 'number' ? group.settings.rounds : 10) *
      (typeof group.settings.questions_per_pick === 'number'
        ? group.settings.questions_per_pick
        : 1);
    expect(total).toBeGreaterThanOrEqual(needed);
  });

  it('files every gauntlet quiz under a category subfolder', () => {
    // Categories are top-level subfolders; a quiz at the gauntlet root would land in "General"
    // and make the example look like it had a stray category.
    const { group } = parseQwizGroup(readFileSync(`${ROOT}/gauntlet/.qwizgroup`, 'utf8'));
    for (const entry of group.entries) expect(entry.path).toContain('/');
  });
});

describe('the rules tables themselves', () => {
  it('scopes every group-only key to at least one mode', () => {
    for (const key of Object.keys(GROUP_SETTING_RULES)) {
      expect(GROUP_SETTING_MODES[key], `${key} has no mode scoping`).toBeDefined();
      expect(GROUP_SETTING_MODES[key].length).toBeGreaterThan(0);
    }
  });

  it('gives every enum a default that is one of its own accepted values', () => {
    // The `typed_input` bug settingsDoc.test.ts was written after, guarded here from the start.
    for (const [key, rule] of Object.entries(GROUP_FRONTMATTER_RULES)) {
      if (rule.values === undefined || rule.default === undefined) continue;
      expect(rule.values, `${key}'s default isn't one of its values`).toContain(
        String(rule.default)
      );
    }
  });

  it('lets an entry override any quiz-wide setting, plus require_win', () => {
    expect(GROUP_ENTRY_RULES.require_win).toBeDefined();
    expect(GROUP_ENTRY_RULES.timer_mode).toBeDefined();
    // Group-shape keys are NOT per-entry: a single quiz can't set the whole group's mode.
    expect(GROUP_ENTRY_RULES.mode).toBeUndefined();
    expect(GROUP_ENTRY_RULES.rounds).toBeUndefined();
  });
});
