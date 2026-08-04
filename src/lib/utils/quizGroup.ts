/** The `.qwizgroup` manifest: how a repository says what its quizzes are and how they're meant to
 * be played together.
 *
 * It is deliberately the SAME format as a `.qwiz` file — a `---` frontmatter fence, then
 * blank-line-separated blocks — rather than YAML, TOML or JSON. Three reasons, in order of weight:
 * an author who already writes `.qwiz` files learns nothing new; it reuses `quizScript.ts`'s own
 * lexing and `validateSettingValue`, so there's one validation path rather than two that drift
 * (CLAUDE.md §6); and it adds no dependency, where YAML or TOML would add the first parsing
 * dependency to a project that hand-rolls its own parser.
 *
 * ```
 * ---
 * title: The Qwiz Trail
 * description: Clear one to unlock the next.
 * :mode=journey
 * :require_win=false
 * ---
 *
 * quiz: world-capitals.qwiz
 * id: capitals
 *
 * quiz: spelling-bee.qwiz
 * id: spelling
 * requires: [capitals]
 * ```
 *
 * Parsing is STRICT, matching the rest of the format: an unknown key, an out-of-range value, or a
 * key used in a mode it means nothing to is a parse error, never silently ignored. The prototype
 * this ports from degraded a broken manifest silently to a flat list; that's the wrong call here,
 * because the whole `.qwiz` contract is that a typo is reported, and having one file type report
 * typos while its sibling swallows them is worse than either rule applied consistently.
 */

import {
  FRONTMATTER_LINE,
  SETTING_LINE,
  parseFrontmatterFields,
  parseInlineArray,
  splitQuestionBlocks,
  stripQuotes,
  validateSettingValue,
  QUIZ_FRONTMATTER_RULES,
  type QuizScriptError,
  type QuizScriptSettings,
  type SettingRule
} from './quizScript';
import { fileNameOf, isQwizPath, isSafePath } from './githubRef';

export type QuizGroupMode = 'folders' | 'journey' | 'merge' | 'playlist' | 'gauntlet' | 'shuffle';

export const GROUP_MODES: readonly QuizGroupMode[] = [
  'folders',
  'journey',
  'merge',
  'playlist',
  'gauntlet',
  'shuffle'
];

/** Group-wide keys. Shaped as `SettingRule` so `validateSettingValue` — the single function every
 * `:key=value` in this project goes through — validates these with no special case, and so
 * `groupDoc.test.ts` can guard the docs the same way `settingsDoc.test.ts` does. */
export const GROUP_SETTING_RULES: Record<string, SettingRule> = {
  mode: {
    group: 'Group',
    kind: 'enum',
    values: [...GROUP_MODES],
    default: 'folders',
    description:
      'How this group\'s quizzes are presented and played. "folders": browse them as a tree and play any one (the default). "journey": each quiz unlocks the next, per its own "requires". "merge": every question from every quiz becomes one long quiz. "playlist": play them back to back in order, with one scoreboard. "gauntlet": pick a category each round from the group\'s subfolders. "shuffle": draw quizzes at random.\n\nAccepted values: folders, journey, merge, playlist, gauntlet, shuffle\nDefault: folders'
  },
  require_win: {
    group: 'Group',
    kind: 'boolean',
    default: false,
    description:
      'Whether clearing a quiz requires actually winning it (see points_to_win/percent_to_win) rather than merely finishing it. Set per entry to override it for one quiz. Only meaningful in "journey", where it decides what unlocks the next step.\n\nAccepted values: true, false\nDefault: false'
  },
  shuffle_quizzes: {
    group: 'Group',
    kind: 'boolean',
    default: false,
    description:
      'Whether the quizzes themselves are played in a random order, as opposed to shuffle_questions which randomises within one quiz. Only meaningful in "playlist".\n\nAccepted values: true, false\nDefault: false'
  },
  pick: {
    group: 'Group',
    kind: 'number',
    default: 1,
    description:
      'How many quizzes to draw from the group. Only meaningful in "shuffle".\n\nAccepted values: any number\nDefault: 1'
  },
  questions_per_pick: {
    group: 'Gauntlet',
    kind: 'number',
    default: 1,
    description:
      'How many questions are answered before the player chooses a category again. Only meaningful in "gauntlet".\n\nAccepted values: any number\nDefault: 1'
  },
  rounds: {
    group: 'Gauntlet',
    kind: 'number',
    default: 10,
    description:
      'How many category picks make up a full run. Only meaningful in "gauntlet".\n\nAccepted values: any number\nDefault: 10'
  },
  discover: {
    group: 'Group',
    kind: 'boolean',
    default: false,
    description:
      'Whether to also list every .qwiz file found in the repository, not just the ones this manifest names. Costs one GitHub API call against an hourly limit, which is why it\'s off by default — a manifest that lists its quizzes loads with no API calls at all. Only meaningful in "folders".\n\nAccepted values: true, false\nDefault: false'
  }
};

/** Which modes each group-wide key means anything in. A key set outside its modes is a parse error
 * rather than a silent no-op — the same closed-set reasoning `SETTING_RULES.appliesTo` applies to
 * question variants.
 *
 * Kept here rather than as a field on `SettingRule` on purpose: `appliesTo` on that interface
 * already means "which question variant", and overloading one field with two unrelated meanings
 * across three tables would be worse than a second map that says exactly what it is. */
export const GROUP_SETTING_MODES: Record<string, readonly QuizGroupMode[]> = {
  mode: GROUP_MODES,
  require_win: ['journey'],
  shuffle_quizzes: ['playlist'],
  pick: ['shuffle'],
  questions_per_pick: ['gauntlet'],
  rounds: ['gauntlet'],
  discover: ['folders']
};

/** Everything a manifest's frontmatter accepts: the group-only keys above plus every quiz-wide
 * key. The composition mirrors `QUIZ_FRONTMATTER_RULES = { ...QUIZ_SETTING_RULES, ...inheritable }`
 * exactly, and it's what makes `merge` nearly free — a quiz-wide setting written at group level is
 * simply the merged document's frontmatter, with no separate mechanism to build one. */
export const GROUP_FRONTMATTER_RULES: Record<string, SettingRule> = {
  ...GROUP_SETTING_RULES,
  ...QUIZ_FRONTMATTER_RULES
};

/** What a single `quiz:` block's `:key=value` lines accept: `require_win` plus any quiz-wide
 * setting, so one entry can be timed or scored differently from the rest of its group. */
export const GROUP_ENTRY_RULES: Record<string, SettingRule> = {
  require_win: GROUP_SETTING_RULES.require_win,
  ...QUIZ_FRONTMATTER_RULES
};

export interface QuizGroupEntry {
  /** Unique within the group. Defaults to the filename slug; `requires` refers to it. */
  id: string;
  /** As written in the manifest — relative to the manifest's own folder. Resolve with
   * `resolveEntryPath` (githubRef.ts) before fetching. */
  path: string;
  /** Display override. Its real value is that a lobby can render the whole group WITHOUT fetching
   * every quiz first just to learn its title. */
  title?: string;
  /** Section label in `folders` mode. Defaults to the quiz's own directory. */
  group?: string;
  /** Entry ids that must be cleared first — `journey` only. */
  requires: string[];
  settings: QuizScriptSettings;
}

export interface QuizGroup {
  title: string;
  description: string;
  category: string;
  tags: string[];
  settings: QuizScriptSettings;
  entries: QuizGroupEntry[];
}

export function emptyQuizGroup(): QuizGroup {
  return { title: '', description: '', category: '', tags: [], settings: {}, entries: [] };
}

export function groupMode(group: QuizGroup): QuizGroupMode {
  const mode = group.settings.mode;
  return typeof mode === 'string' && (GROUP_MODES as readonly string[]).includes(mode)
    ? (mode as QuizGroupMode)
    : 'folders';
}

/** An entry's id when the manifest doesn't give one: the filename without its extension, lowercased
 * and punctuation-collapsed, so `rounds/World Capitals.qwiz` becomes `world-capitals` and can be
 * referenced from `requires` without the author having to write an `id:` line for every entry. */
export function slugFromPath(path: string): string {
  return fileNameOf(path)
    .replace(/\.qwiz$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Which entry keys are legal in which mode. Everything else about an entry (`quiz:`, `id:`,
 * `title:`) is universal. */
const ENTRY_KEY_MODES: Record<string, readonly QuizGroupMode[]> = {
  requires: ['journey'],
  group: ['folders']
};

function parseEntryBlock(
  block: { text: string; num: number }[],
  mode: QuizGroupMode,
  errors: QuizScriptError[]
): QuizGroupEntry | null {
  const entry: QuizGroupEntry = { id: '', path: '', requires: [], settings: {} };
  let sawQuiz = false;

  for (const { text, num } of block) {
    if (text === '') continue;

    const settingMatch = SETTING_LINE.exec(text);
    if (settingMatch) {
      const key = settingMatch[1];
      const { value, error } = validateSettingValue(key, settingMatch[2], GROUP_ENTRY_RULES);
      entry.settings[key] = value;
      if (error) errors.push({ line: num, message: `Setting "${key}" ${error}.` });
      continue;
    }

    const match = FRONTMATTER_LINE.exec(text);
    if (!match) {
      errors.push({ line: num, message: `Unrecognized line in a quiz entry: "${text}"` });
      continue;
    }

    const [, key, rawValue] = match;
    const value = stripQuotes(rawValue).trim();
    const allowedModes = ENTRY_KEY_MODES[key];
    if (allowedModes && !allowedModes.includes(mode)) {
      errors.push({
        line: num,
        message: `"${key}" only applies to ${allowedModes.join('/')} groups (this group's mode is "${mode}").`
      });
      continue;
    }

    switch (key) {
      case 'quiz':
        sawQuiz = true;
        entry.path = value;
        break;
      case 'id':
        entry.id = value;
        break;
      case 'title':
        entry.title = value;
        break;
      case 'group':
        entry.group = value;
        break;
      case 'requires':
        entry.requires = parseInlineArray(rawValue);
        break;
      default:
        errors.push({ line: num, message: `Unknown key "${key}" in a quiz entry.` });
    }
  }

  const firstLine = block[0]?.num ?? 1;

  if (!sawQuiz) {
    errors.push({
      line: firstLine,
      message: 'Every block in a .qwizgroup needs a "quiz:" line naming the file it plays.'
    });
    return null;
  }
  if (entry.path === '') {
    errors.push({ line: firstLine, message: '"quiz:" needs a path to a .qwiz file.' });
    return null;
  }
  if (!isQwizPath(entry.path)) {
    errors.push({
      line: firstLine,
      message: `"quiz: ${entry.path}" must point at a .qwiz file.`
    });
    return null;
  }
  // A manifest may only name files in its own repository. Absolute paths and URLs are refused
  // outright rather than resolved: allowing a manifest to reference an arbitrary URL would turn it
  // into a general-purpose fetcher and make the /group URL lie about what it loaded.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(entry.path)) {
    errors.push({
      line: firstLine,
      message: `"quiz: ${entry.path}" can't be a URL — a manifest may only name files in its own repository.`
    });
    return null;
  }
  if (!isSafePath(entry.path.replace(/^\.\//, ''))) {
    errors.push({
      line: firstLine,
      message: `"quiz: ${entry.path}" isn't a valid path inside this repository.`
    });
    return null;
  }

  // Required in journey specifically so a typo in `requires:` can't silently produce a node
  // nothing ever unlocks. Everywhere else a filename slug is a perfectly good identity.
  if (entry.id === '') {
    if (mode === 'journey') {
      errors.push({
        line: firstLine,
        message:
          'A journey entry needs an "id:" line, so other entries can name it in their "requires:".'
      });
      return null;
    }
    entry.id = slugFromPath(entry.path);
  }

  return entry;
}

/** Parses a whole `.qwizgroup` document. Errors are flat, human-readable strings in the same style
 * `parseQwizFile` produces — the group screen renders them through the same `ErrorList` as every
 * other parse failure, and a manifest's line numbers aren't shown anywhere for a reader to use. */
export function parseQwizGroup(source: string): { group: QuizGroup; errors: string[] } {
  const scriptErrors: QuizScriptError[] = [];
  const lines = source.split(/\r\n|\r|\n/);
  const group = emptyQuizGroup();

  let bodyStart = 0;
  if (lines[0]?.trim() === '---') {
    const closingIndex = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (closingIndex === -1) {
      scriptErrors.push({ line: 1, message: 'Frontmatter is opened with "---" but never closed.' });
    } else {
      const frontmatter = parseFrontmatterFields(
        lines,
        1,
        closingIndex,
        GROUP_FRONTMATTER_RULES,
        scriptErrors
      );
      group.title = frontmatter.title;
      group.description = frontmatter.description;
      group.category = frontmatter.category;
      group.tags = frontmatter.tags;
      group.settings = frontmatter.settings;
      bodyStart = closingIndex + 1;
    }
  }

  const mode = groupMode(group);

  // A key that means nothing in this mode is a mistake worth reporting, not a no-op: an author who
  // writes `:rounds=5` under `mode=journey` believes something is happening.
  for (const key of Object.keys(group.settings)) {
    const modes = GROUP_SETTING_MODES[key];
    if (modes && !modes.includes(mode)) {
      scriptErrors.push({
        line: 1,
        message: `"${key}" only applies to ${modes.join('/')} groups (this group's mode is "${mode}").`
      });
    }
  }

  for (const block of splitQuestionBlocks(lines, bodyStart)) {
    const entry = parseEntryBlock(block, mode, scriptErrors);
    if (entry) group.entries.push(entry);
  }

  const errors = scriptErrors.map((e) => `Line ${e.line}: ${e.message}`);

  const seen = new Set<string>();
  for (const entry of group.entries) {
    if (seen.has(entry.id)) {
      errors.push(
        `Two quizzes in this group share the id "${entry.id}" — ids have to be unique, since that's how a journey names what unlocks what.`
      );
    }
    seen.add(entry.id);
  }

  if (mode === 'journey') {
    for (const entry of group.entries) {
      for (const required of entry.requires) {
        if (!seen.has(required)) {
          errors.push(`"${entry.id}" requires "${required}", which isn't a quiz in this group.`);
        }
      }
    }
    for (const id of findCycle(group.entries)) {
      errors.push(
        `"${id}" is part of a loop in this journey's "requires:" — nothing in the loop could ever unlock.`
      );
    }
  }

  return { group, errors };
}

/** Entry ids caught in a `requires` cycle. A cycle would render as a permanently locked group with
 * no explanation, so it's a parse error rather than something discovered at play time. */
function findCycle(entries: readonly QuizGroupEntry[]): string[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const state = new Map<string, 'visiting' | 'done'>();
  const looping: string[] = [];

  const visit = (id: string): boolean => {
    const current = state.get(id);
    if (current === 'done') return false;
    if (current === 'visiting') return true;

    state.set(id, 'visiting');
    let inCycle = false;
    for (const required of byId.get(id)?.requires ?? []) {
      if (byId.has(required) && visit(required)) inCycle = true;
    }
    state.set(id, 'done');
    if (inCycle) looping.push(id);
    return inCycle;
  };

  for (const entry of entries) visit(entry.id);
  return looping;
}

/** The inverse of `parseQwizGroup`, so a manifest round-trips exactly the way a `.qwiz` document
 * does through `serializeQuizScript`. Nothing in the app writes a manifest today — a group is
 * authored in a text editor next to the quizzes it lists — but the round-trip is what the parser's
 * tests assert against, which is reason enough for it to exist and to stay correct. */
export function serializeQwizGroup(group: QuizGroup): string {
  const head: string[] = ['---'];
  head.push(`title: ${group.title}`);
  head.push(`description: ${group.description}`);
  if (group.category) head.push(`category: ${group.category}`);
  if (group.tags.length > 0) head.push(`tags: [${group.tags.join(', ')}]`);
  for (const [key, value] of Object.entries(group.settings)) {
    head.push(`:${key}=${String(value)}`);
  }
  head.push('---');

  // A journey ALWAYS gets an explicit `id:`, even one identical to the filename slug that would
  // otherwise be left implicit: `parseQwizGroup` requires the line in journey mode (so a typo in a
  // `requires:` can't orphan a node), which means omitting it produces a document this very module
  // can't read back. Everywhere else the slug is enough and the line is noise.
  const alwaysWriteIds = groupMode(group) === 'journey';

  const blocks = group.entries.map((entry) => {
    const lines = [`quiz: ${entry.path}`];
    if (entry.id && (alwaysWriteIds || entry.id !== slugFromPath(entry.path))) {
      lines.push(`id: ${entry.id}`);
    }
    if (entry.title) lines.push(`title: ${entry.title}`);
    if (entry.group) lines.push(`group: ${entry.group}`);
    if (entry.requires.length > 0) lines.push(`requires: [${entry.requires.join(', ')}]`);
    for (const [key, value] of Object.entries(entry.settings)) {
      lines.push(`:${key}=${String(value)}`);
    }
    return lines.join('\n');
  });

  return [head.join('\n'), ...blocks].join('\n\n');
}
