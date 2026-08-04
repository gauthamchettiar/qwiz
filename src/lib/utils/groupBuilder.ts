/** Turning quizzes in the library into a publishable group: the `.qwizgroup` manifest plus the
 * `.qwiz` files it names, ready to be zipped and pushed to a repository.
 *
 * The app can't create a repository for anyone — that would need a GitHub token with write access,
 * and the whole remote feature rests on reading public files signed out (CLAUDE.md §1). So the
 * deliverable is a folder: download it, drop it in a repo, push. Everything up to that point,
 * including getting the manifest right, is what this does.
 *
 * The load-bearing decision is that the generated manifest is **validated by being parsed back**
 * (see `buildGroupFiles`). Writing a serializer that agrees with the parser by inspection is how
 * the two drift; running the real parser over the real output means a group that can't be read
 * can't be downloaded either.
 */

import { slugify } from './download';
import {
  groupMode,
  parseQwizGroup,
  serializeQwizGroup,
  slugFromPath,
  type QuizGroup,
  type QuizGroupEntry,
  type QuizGroupMode
} from './quizGroup';
import { qwizSourceFromQuiz } from './qwizDocument';
import type { ZipEntry } from './zip';
import type { Quiz } from '@/lib/schemas/quiz';

export interface GroupEntryDraft {
  /** Id of a quiz in the library. */
  quizId: string;
  /** Folder within the group. `''` is the group root. In `gauntlet` this is the category; in
   * `folders` it's the section. */
  folder: string;
  /** Display override. Empty means "omit it", and the quiz's filename is shown instead — the
   * manifest is smaller and a rename in the library still flows through. */
  title: string;
}

export interface GroupDraft {
  title: string;
  description: string;
  category: string;
  tags: string[];
  mode: QuizGroupMode;
  /** journey */
  requireWin: boolean;
  /** gauntlet */
  questionsPerPick: number;
  rounds: number;
  /** merge — 0 means "every question", matching the setting being absent. */
  questionsPerRun: number;
  entries: GroupEntryDraft[];
}

export function emptyGroupDraft(): GroupDraft {
  return {
    title: '',
    description: '',
    category: '',
    tags: [],
    mode: 'folders',
    requireWin: false,
    questionsPerPick: 1,
    rounds: 5,
    questionsPerRun: 0,
    entries: []
  };
}

/** Filenames for every entry, deduplicated across the WHOLE group rather than per folder.
 *
 * Two quizzes with the same title in different folders would otherwise produce the same filename
 * slug, and therefore the same manifest `id` — which the parser rejects. Making the filename unique
 * globally means the id derived from it is unique too, so no entry ever needs an explicit `id:`
 * line just to disambiguate. */
export function groupFilePaths(
  entries: readonly GroupEntryDraft[],
  quizzes: ReadonlyMap<string, Quiz>
): Map<string, string> {
  const used = new Set<string>();
  const paths = new Map<string, string>();

  for (const entry of entries) {
    const quiz = quizzes.get(entry.quizId);
    if (!quiz) continue;

    const stem = slugify(quiz.title);
    let name = stem;
    for (let n = 2; used.has(name); n += 1) name = `${stem}-${n}`;
    used.add(name);

    const folder = entry.folder.trim().replace(/^\/+|\/+$/g, '');
    paths.set(entry.quizId, folder ? `${folder}/${name}.qwiz` : `${name}.qwiz`);
  }

  return paths;
}

/** Only the settings that apply to this mode. A key outside its mode is a parse error, not a
 * harmless extra — so the draft carries a value for every mode and this drops the irrelevant ones
 * rather than the form having to remember which is which. */
function settingsFor(draft: GroupDraft): QuizGroup['settings'] {
  const settings: QuizGroup['settings'] = { mode: draft.mode };

  if (draft.mode === 'journey' && draft.requireWin) settings.require_win = true;
  if (draft.mode === 'gauntlet') {
    settings.questions_per_pick = Math.max(1, Math.floor(draft.questionsPerPick));
    settings.rounds = Math.max(1, Math.floor(draft.rounds));
  }
  // A quiz-wide setting, legal in any mode, but only meaningful where the group becomes one quiz.
  if (draft.mode === 'merge' && draft.questionsPerRun > 0) {
    settings.questions_per_run = Math.floor(draft.questionsPerRun);
  }

  return settings;
}

/** The group as the parser's own type, so it can be serialized by `serializeQwizGroup` — the same
 * function `parseQwizGroup`'s round-trip tests pin. */
export function buildQuizGroup(draft: GroupDraft, quizzes: ReadonlyMap<string, Quiz>): QuizGroup {
  const paths = groupFilePaths(draft.entries, quizzes);
  const entries: QuizGroupEntry[] = [];

  for (const item of draft.entries) {
    const path = paths.get(item.quizId);
    if (!path) continue;

    const id = slugFromPath(path);
    entries.push({
      id,
      path,
      requires: [],
      settings: {},
      ...(item.title.trim() ? { title: item.title.trim() } : {}),
      // `group:` is folders-only; anywhere else it's a parse error. The folder is already in the
      // path, so nothing is lost by omitting it.
      ...(draft.mode === 'folders' && item.folder.trim() ? { group: item.folder.trim() } : {})
    });
  }

  // A journey needs an unlock order, and a straight chain is the one the builder can infer without
  // asking. Branching DAGs are expressible in the format but not here — the file is text, and
  // hand-editing `requires:` afterwards is both easy and documented.
  if (draft.mode === 'journey') {
    entries.forEach((entry, i) => {
      entry.requires = i === 0 ? [] : [entries[i - 1].id];
    });
  }

  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: draft.category.trim(),
    tags: draft.tags,
    settings: settingsFor(draft),
    entries
  };
}

export interface BuiltGroup {
  /** `.qwizgroup` first, then one file per quiz — the archive's contents. */
  files: ZipEntry[];
  /** The manifest on its own, for the live preview. */
  manifest: string;
  errors: string[];
}

/** Everything the download needs, or the reasons it can't be produced. */
export function buildGroupFiles(draft: GroupDraft, quizzes: ReadonlyMap<string, Quiz>): BuiltGroup {
  const errors: string[] = [];

  if (draft.entries.length === 0) {
    errors.push('Pick at least one quiz to include in the group.');
  }
  if (!draft.title.trim()) {
    errors.push('Give the group a title — it names the whole set wherever it appears.');
  }
  if (draft.mode === 'gauntlet') {
    // Categories ARE the mode. Without folders every quiz lands in "General" and the picker has
    // exactly one thing to pick, which isn't a gauntlet.
    const foldered = draft.entries.filter((entry) => entry.folder.trim()).length;
    if (foldered < draft.entries.length) {
      errors.push(
        'A gauntlet needs every quiz in a category folder — that is what the player chooses between.'
      );
    }
    const categories = new Set(draft.entries.map((entry) => entry.folder.trim()));
    if (categories.size < 2 && draft.entries.length > 0) {
      errors.push('A gauntlet needs at least two categories to choose between.');
    }
  }

  const group = buildQuizGroup(draft, quizzes);
  const manifest = serializeQwizGroup(group);

  // The real check: read back what was just written. A manifest this app can't parse is one no
  // author should be handed, and this is the only way to be sure the serializer and the parser
  // still agree.
  const reparsed = parseQwizGroup(manifest);
  errors.push(...reparsed.errors);

  if (errors.length > 0) return { files: [], manifest, errors };

  // Path -> quiz, so each file is found once rather than by re-deriving every path per entry.
  const paths = groupFilePaths(draft.entries, quizzes);
  const quizByPath = new Map<string, Quiz>();
  for (const [quizId, path] of paths) {
    const quiz = quizzes.get(quizId);
    if (quiz) quizByPath.set(path, quiz);
  }

  const files: ZipEntry[] = [{ name: '.qwizgroup', content: manifest }];
  for (const entry of group.entries) {
    const quiz = quizByPath.get(entry.path);
    if (quiz) files.push({ name: entry.path, content: qwizSourceFromQuiz(quiz) });
  }

  return { files, manifest, errors: [] };
}

/** What the downloaded archive is called. Checked against the raw title rather than the slug,
 * because `slugify` already falls back to "quiz" for an empty string — so `|| 'quiz-group'` here
 * would never have fired. */
export function groupZipName(draft: GroupDraft): string {
  return draft.title.trim() ? `${slugify(draft.title)}.zip` : 'quiz-group.zip';
}

/** Whether this mode uses per-entry folders at all, so the form can hide a column that would mean
 * nothing — `journey` and `merge` both ignore where a file sits. */
export function modeUsesFolders(mode: QuizGroupMode): boolean {
  return mode === 'folders' || mode === 'gauntlet';
}

/** One line describing what this mode will do, shown under the picker. */
export function modeSummary(mode: QuizGroupMode): string {
  switch (mode) {
    case 'journey':
      return 'Each quiz unlocks the next, in the order below.';
    case 'merge':
      return 'Every question from every quiz becomes one long quiz.';
    case 'gauntlet':
      return 'Players pick a category each round. Put each quiz in a category folder.';
    default:
      return 'Players browse a folder tree, play any quiz, or play the whole set with the Merge and Shuffle toggles.';
  }
}

export { groupMode };
