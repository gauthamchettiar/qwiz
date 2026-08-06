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
import { dirOf, fileNameOf } from './githubRef';
import type { QuizScriptSettings } from './quizScript';
import {
  emptyQuizGroup,
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
  /** Id of a quiz in the library. `''` on a card that's been added but not filled in yet — an
   * error rather than a silent omission, since a blank card is a half-finished thought, not a
   * request to publish a shorter group. */
  quizId: string;
  /** Folder within the group. `''` is the group root. In `gauntlet` this is the category; in
   * `folders` it's the section. */
  folder: string;
  /** Display override. Empty means "omit it", and the quiz's filename is shown instead — the
   * manifest is smaller and a rename in the library still flows through. */
  title: string;
  /** `journey` unlock dependencies. The form never writes these — it infers a straight chain (see
   * `buildQuizGroup`) — but code mode can, so they're carried rather than dropped on the way back
   * through a manifest an author has edited by hand. */
  requires: string[];
  /** Per-entry `:key=value` lines, for the same reason: expressible in the format, offered only by
   * code mode, and lost on a round-trip if the draft had nowhere to put them. */
  settings: QuizScriptSettings;
}

/** The group as the builder holds it: a `QuizGroup` (quizGroup.ts) with its entries still naming
 * LIBRARY QUIZZES rather than file paths, since the paths don't exist until the archive is built.
 *
 * Settings are a plain `:key=value` bag, exactly as a quiz's are — including `mode`, which used to
 * be a typed field with four sibling fields (`requireWin`, `rounds`, …) shadowing the settings it
 * would eventually become. One bag means one validation path: `validateSettingValue` in the form,
 * `parseQwizGroup` on the round-trip, and no third place deciding which keys a mode accepts. */
export interface GroupDraft {
  title: string;
  description: string;
  category: string;
  tags: string[];
  settings: QuizScriptSettings;
  entries: GroupEntryDraft[];
}

export function emptyGroupDraft(): GroupDraft {
  // `mode` is seeded rather than left implicit: it's the one key that changes what the rest of the
  // form even shows, and a settings list that starts empty would hide it behind "Add setting".
  return {
    title: '',
    description: '',
    category: '',
    tags: [],
    settings: { mode: 'folders' },
    entries: []
  };
}

export function emptyGroupEntryDraft(): GroupEntryDraft {
  return { quizId: '', folder: '', title: '', requires: [], settings: {} };
}

/** The mode this draft will publish under — `groupMode`'s fallback applied to a draft, so the form
 * and the parser can never disagree about what an absent or misspelt `:mode=` means. */
export function draftMode(draft: GroupDraft): QuizGroupMode {
  return groupMode({ ...emptyQuizGroup(), settings: draft.settings });
}

/** Filenames for every entry, deduplicated across the WHOLE group rather than per folder.
 *
 * Two quizzes with the same title in different folders would otherwise produce the same filename
 * slug, and therefore the same manifest `id` — which the parser rejects. Making the filename unique
 * globally means the id derived from it is unique too, so no entry ever needs an explicit `id:`
 * line just to disambiguate.
 *
 * Keyed by the entry's POSITION, not its `quizId`. The old checkbox list couldn't add a quiz twice;
 * a per-card quiz picker can, and a quizId-keyed map collapsed both entries onto one path — two
 * cards, one file, and a duplicate-`id` parse error explaining none of it. Position also happens to
 * be what `buildQuizGroup` iterates, so nothing has to look a path up by anything else. */
export function groupFilePaths(
  entries: readonly GroupEntryDraft[],
  quizzes: ReadonlyMap<string, Quiz>
): Map<number, string> {
  const used = new Set<string>();
  const paths = new Map<number, string>();

  entries.forEach((entry, index) => {
    const quiz = quizzes.get(entry.quizId);
    if (!quiz) return;

    const stem = slugify(quiz.title);
    let name = stem;
    for (let n = 2; used.has(name); n += 1) name = `${stem}-${n}`;
    used.add(name);

    const folder = entry.folder.trim().replace(/^\/+|\/+$/g, '');
    paths.set(index, folder ? `${folder}/${name}.qwiz` : `${name}.qwiz`);
  });

  return paths;
}

/** The group as the parser's own type, so it can be serialized by `serializeQwizGroup` — the same
 * function `parseQwizGroup`'s round-trip tests pin.
 *
 * Settings pass through untouched. There used to be a `settingsFor` here that emitted only the keys
 * the mode accepted, which meant the form could hold `:rounds=5` under `mode=folders` and quietly
 * publish a manifest without it. The round-trip check in `buildGroupFiles` reports that mismatch as
 * the parse error it is, so dropping keys was hiding the one thing worth saying. */
export function buildQuizGroup(draft: GroupDraft, quizzes: ReadonlyMap<string, Quiz>): QuizGroup {
  const paths = groupFilePaths(draft.entries, quizzes);
  const mode = draftMode(draft);
  const entries: QuizGroupEntry[] = [];

  draft.entries.forEach((item, index) => {
    const path = paths.get(index);
    if (!path) return;

    const id = slugFromPath(path);
    entries.push({
      id,
      path,
      requires: [...item.requires],
      settings: { ...item.settings },
      ...(item.title.trim() ? { title: item.title.trim() } : {}),
      // `group:` is folders-only; anywhere else it's a parse error. The folder is already in the
      // path, so nothing is lost by omitting it.
      ...(mode === 'folders' && item.folder.trim() ? { group: item.folder.trim() } : {})
    });
  });

  // A journey needs an unlock order, and a straight chain is the one the builder can infer without
  // asking. Branching DAGs are expressible in the format but not in the form — so the chain is
  // inferred only when NOTHING declares its own dependencies, which is what lets a DAG written in
  // code mode survive being applied back rather than being flattened into a line.
  if (mode === 'journey' && entries.every((entry) => entry.requires.length === 0)) {
    entries.forEach((entry, i) => {
      entry.requires = i === 0 ? [] : [entries[i - 1].id];
    });
  }

  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: draft.category.trim(),
    tags: draft.tags,
    settings: { ...draft.settings },
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

  const mode = draftMode(draft);

  if (draft.entries.length === 0) {
    errors.push('Pick at least one quiz to include in the group.');
  }
  // A card added but never filled in. Reported rather than skipped: the entry is on screen, so
  // silently publishing a group without it would look like the download had lost one.
  if (draft.entries.some((entry) => !entry.quizId)) {
    errors.push('Every entry needs a quiz — pick one from your library.');
  }
  if (!draft.title.trim()) {
    errors.push('Give the group a title — it names the whole set wherever it appears.');
  }
  if (mode === 'gauntlet') {
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
  for (const [index, path] of paths) {
    const quiz = quizzes.get(draft.entries[index].quizId);
    if (quiz) quizByPath.set(path, quiz);
  }

  const files: ZipEntry[] = [{ name: '.qwizgroup', content: manifest }];
  for (const entry of group.entries) {
    const quiz = quizByPath.get(entry.path);
    if (quiz) files.push({ name: entry.path, content: qwizSourceFromQuiz(quiz) });
  }

  return { files, manifest, errors: [] };
}

/** The inverse of `buildQuizGroup`: a manifest an author has edited by hand, mapped back onto the
 * draft the form edits. What code mode's Apply runs.
 *
 * The hard part is that a manifest names FILES and a draft names LIBRARY QUIZZES, and the filename
 * is generated (`slugify(quiz.title)`, plus a `-2` where two quizzes share a title). So entries are
 * matched by their filename STEM against the paths the pre-edit draft would have produced — the
 * folder deliberately isn't part of the key, because moving a quiz between folders is the edit
 * people actually come here to make, and it changes the path but never the stem.
 *
 * A stem that matches nothing is an error naming the path, never a dropped entry: an author who
 * renames `quiz: capitals.qwiz` to something not in their library has made a mistake worth being
 * told about, and an entry vanishing from the form on Apply is the worst possible way to say it.
 *
 * The one thing this can't resolve is two quizzes with the SAME title reordered in code mode —
 * `capitals.qwiz` and `capitals-2.qwiz` would swap which library quiz they mean. It's a real edge
 * and it isn't worth a mechanism: both entries still resolve, to two quizzes with the same name.
 *
 * Two callers, one function. Code mode's Apply passes the draft it's editing, so an entry resolves
 * to the quiz it already meant. **Re-opening a saved group** passes an empty draft, and everything
 * falls through to the LIBRARY-wide map below — which is why that fallback exists rather than the
 * load path getting a near-copy of this. */
export function draftFromQuizGroup(
  group: QuizGroup,
  previous: GroupDraft,
  quizzes: ReadonlyMap<string, Quiz>
): { draft: GroupDraft; errors: string[] } {
  const stemOf = (path: string) => fileNameOf(path).replace(/\.qwiz$/i, '');

  // Whole library first, the draft's own paths over the top: a quiz the draft already places wins,
  // but anything it doesn't know about can still be found by the name the builder would have given
  // its file. Later `set`s overwrite, hence this order.
  const quizIdByStem = new Map<string, string>();
  for (const quiz of quizzes.values()) quizIdByStem.set(slugify(quiz.title), quiz.id);
  for (const [index, path] of groupFilePaths(previous.entries, quizzes)) {
    quizIdByStem.set(stemOf(path), previous.entries[index].quizId);
  }

  /** The stem as written, then with a `-2`-style disambiguator stripped. `groupFilePaths` appends
   * that suffix when two quizzes share a title, so `world-capitals-2.qwiz` has to find the same
   * quiz `world-capitals.qwiz` does. Exact match is tried first, so a quiz genuinely titled
   * "Round 2" resolves as itself rather than being read as a second "Round". */
  function resolve(path: string): string | undefined {
    const stem = stemOf(path);
    return quizIdByStem.get(stem) ?? quizIdByStem.get(stem.replace(/-\d+$/, ''));
  }

  const errors: string[] = [];
  const entries: GroupEntryDraft[] = [];

  for (const entry of group.entries) {
    const quizId = resolve(entry.path);
    if (!quizId) {
      errors.push(
        `"${entry.path}" isn't a quiz in your library — add it from the list rather than naming a file here.`
      );
      continue;
    }
    entries.push({
      quizId,
      // The path is where the file actually goes, so it wins; `group:` only fills in for a
      // folders-mode entry labelled without being moved.
      folder: dirOf(entry.path) || entry.group || '',
      title: entry.title ?? '',
      requires: [...entry.requires],
      settings: { ...entry.settings }
    });
  }

  return {
    draft: {
      title: group.title,
      description: group.description,
      category: group.category,
      tags: [...group.tags],
      settings: { ...group.settings },
      entries
    },
    errors
  };
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
