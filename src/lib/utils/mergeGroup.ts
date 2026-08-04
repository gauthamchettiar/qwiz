/** Turning a whole group into one quiz — what `merge` and `shuffle` both do.
 *
 * The trick that makes these modes nearly free: a merged group IS a synthesised `.qwiz` document.
 * Concatenate every quiz's question blocks under the group's own frontmatter, hand the result to
 * `quizFromQwizSource`, and the existing player runs it with no idea it was assembled. No new
 * player, no new run machinery, and "Save a copy" works on it for the same reason.
 *
 * It also means an exam-style random draw needs no feature at all: `:questions_per_run=20` at group
 * level is already a quiz-wide setting, so it lands in the synthesised frontmatter and the player's
 * existing sampling does the rest.
 */

import {
  INHERITABLE_SETTING_KEYS,
  QUIZ_FRONTMATTER_RULES,
  parseQuizScriptQuestion,
  parseQwizFile,
  serializeQuizScript,
  settingAppliesToVariant,
  type QuizScriptFrontmatter,
  type QuizScriptSettings
} from './quizScript';
import { GROUP_SETTING_RULES, type QuizGroup } from './quizGroup';
import { shuffledArray } from './shuffle';

/** One source quiz, as fetched. */
export interface MergeSource {
  /** The entry's id, used only to report which source failed. */
  id: string;
  title: string;
  source: string;
}

export interface MergedDocument {
  source?: string;
  /** Sources that couldn't be parsed, named so the reader knows which file to fix. The rest still
   * merge — one broken quiz shouldn't make a whole group unplayable. */
  skipped: string[];
  errors: string[];
}

/** The group-level settings that belong on the merged quiz: every quiz-wide key, and none of the
 * group-shape ones (`mode`, `rounds`, `pick`…), which describe how the group is assembled rather
 * than how the resulting quiz plays. */
export function quizSettingsFrom(group: QuizGroup): QuizScriptSettings {
  const settings: QuizScriptSettings = {};
  for (const [key, value] of Object.entries(group.settings)) {
    if (key in GROUP_SETTING_RULES) continue;
    if (key in QUIZ_FRONTMATTER_RULES) settings[key] = value;
  }
  return settings;
}

/** Pushes a source quiz's own inheritable frontmatter settings down onto each of its questions.
 *
 * This is the subtlety that makes merging correct rather than merely working. A question inherits
 * quiz-wide settings from the document it's in — so lifting questions out of five documents and
 * dropping them under one new frontmatter would silently discard each source quiz's own defaults.
 * A quiz authored with `:points_wrong=-1` across all its questions would quietly stop penalising
 * wrong answers the moment it was merged into a group that didn't set it.
 *
 * Only settings the question doesn't already state itself are added, and only ones that actually
 * apply to its variant — so this can't introduce a setting the parser would then reject.
 */
export function inlineQuizSettings(
  frontmatter: QuizScriptFrontmatter,
  questionCodes: readonly string[]
): string[] {
  const inheritable = Object.entries(frontmatter.settings).filter(([key]) =>
    INHERITABLE_SETTING_KEYS.includes(key)
  );
  if (inheritable.length === 0) return [...questionCodes];

  return questionCodes.map((code) => {
    const { question, errors } = parseQuizScriptQuestion(code);
    // A question that doesn't parse is left exactly as it was; the caller reports it.
    if (errors.length > 0) return code;

    const extra = inheritable
      .filter(([key]) => !(key in question.settings))
      .filter(([key]) => settingAppliesToVariant(key, question.variant))
      .map(([key, value]) => `:${key}=${formatValue(value)}`);

    return extra.length === 0 ? code : `${code}\n${extra.join('\n')}`;
  });
}

/** Mirrors `formatSettingValue` in quizScript.ts: a string that looks like a boolean or a number
 * has to be re-quoted, or it changes type on the way back through the parser. */
function formatValue(value: string | number | boolean): string {
  if (typeof value !== 'string') return String(value);
  const looksTyped =
    value === 'true' || value === 'false' || (value !== '' && !Number.isNaN(Number(value)));
  return looksTyped ? `"${value}"` : value;
}

/** The whole group as one `.qwiz` document.
 *
 * `sources` must be in the order they should appear. In `shuffle` mode the caller has already
 * drawn and ordered them — this function stays deterministic so it can be tested as one. */
export function mergeGroupDocument(
  group: QuizGroup,
  sources: readonly MergeSource[],
  options: { shuffle?: boolean } = {}
): MergedDocument {
  const codes: string[] = [];
  const skipped: string[] = [];

  for (const item of sources) {
    const { frontmatter, questionCodes, errors } = parseQwizFile(item.source);
    if (errors.length > 0 || questionCodes.length === 0) {
      skipped.push(item.title || item.id);
      continue;
    }
    codes.push(...inlineQuizSettings(frontmatter, questionCodes));
  }

  if (codes.length === 0) {
    return {
      skipped,
      errors: [
        skipped.length > 0
          ? `None of this group's quizzes could be read: ${skipped.join(', ')}.`
          : "This group doesn't have any questions in it."
      ]
    };
  }

  const frontmatter: QuizScriptFrontmatter = {
    title: group.title || 'Quiz group',
    description: group.description,
    category: group.category,
    tags: group.tags,
    // An explicit Shuffle overrides whatever the manifest said. It already defaults to true, so
    // this only bites when an author pinned it off — and a player who ticked the box meant it.
    settings: options.shuffle
      ? { ...quizSettingsFrom(group), shuffle_questions: true }
      : quizSettingsFrom(group)
  };

  return { source: serializeQuizScript(frontmatter, codes), skipped, errors: [] };
}

/** The order a run plays its source quizzes in.
 *
 * Shuffling used to be a MODE (`shuffle`, drawing `:pick=N`); it's now a toggle on the folders
 * screen, because "in what order" is a choice the player makes at play time rather than a property
 * the author bakes into the file. Drawing a subset is still expressible, and still by the setting
 * that already did it: `questions_per_run`. */
export function orderSources<T>(sources: readonly T[], shuffle: boolean): T[] {
  return shuffle ? shuffledArray([...sources]) : [...sources];
}
