import {
  effectivePoints,
  locksOnSubmit,
  questionMaxPoints,
  settingBoolean,
  settingNumber,
  settingString
} from './grading';
import type { QuizScriptQuestion, QuizScriptSettings } from './quizScript';

/** Stable identity for a rule — the setting (or derived concept) it speaks for. Tests assert on
 * ids and icons rather than prose, so the wording stays free to be edited without a test rewrite
 * (the same discipline `settingsDoc.test.ts` follows). Also the `{#each}` key. */
export type QuizRuleId =
  | 'questions'
  | 'shuffle'
  | 'navigation'
  | 'require_answer'
  | 'timer'
  | 'on_timeout'
  | 'reveal_answers'
  | 'reveal_scores'
  | 'reveal_screen'
  | 'points'
  | 'negative_marking'
  | 'win';

/** A closed set of icon NAMES, not components: this module is framework-free (CLAUDE.md §3), so it
 * can't reference `@lucide/svelte`. `QuizPlayer` holds the one `Record<QuizRuleIcon, …>` that
 * resolves these, which the compiler then forces to stay exhaustive. */
export type QuizRuleIcon =
  | 'list'
  | 'shuffle'
  | 'lock'
  | 'navigate'
  | 'required'
  | 'skip'
  | 'timer'
  | 'alarm'
  | 'eye'
  | 'eye-off'
  | 'fast-forward'
  | 'points'
  | 'penalty'
  | 'trophy';

export interface QuizRule {
  id: QuizRuleId;
  icon: QuizRuleIcon;
  /** One complete sentence, ready to render as-is. */
  text: string;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "45 seconds" / "1 minute" / "1 minute 30 seconds" / "2 minutes" — prose, deliberately NOT the
 * "M:SS" the player's countdown badge uses. A badge is a clock and a sentence isn't; "1:30 for
 * each question" reads like a typo mid-paragraph, which is why this doesn't just reuse
 * `formatSeconds` out of QuizPlayer. */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return plural(seconds, 'second');
  if (seconds === 0) return plural(minutes, 'minute');
  return `${plural(minutes, 'minute')} ${plural(seconds, 'second')}`;
}

/** Whether answering this question can cost points. Runs every option through `effectivePoints`
 * rather than reading `points_wrong` directly, so it agrees with grading on both sources at once
 * (an explicit `%-N%` weight, or a negative `points_wrong` default) AND on the variants where
 * `points_wrong` is a no-op — every typed variant forces its options `correct: true` at parse
 * time, so a quiz-wide `points_wrong: -1` never actually reaches them and mustn't be announced as
 * if it did.
 *
 * Hint costs (`!<reveal>` extras with negative points) are deliberately NOT counted here: those
 * are opt-in, and the player sees each one's price on the button before pressing it — folding them
 * into "wrong answers deduct points" would make that sentence false. */
function hasNegativeMarking(question: QuizScriptQuestion): boolean {
  return question.options.some((option) => effectivePoints(option, question.settings) < 0);
}

/** The rules of one specific quiz, in the order a player wants them: the shape of the run, what
 * they have to do, the clock, what they'll be shown, then how it's scored.
 *
 * `questions` are the run's questions exactly as `buildPlayRun` produced them — quiz-wide defaults
 * already folded in by `resolveQuestionSettings` — so the per-question rules (`require_answer`,
 * `points_wrong`, both inheritable) read one merged settings object instead of looking in two
 * places. `bankSize` is the AUTHORED question count, so a `questions_per_run` subset can be
 * phrased as "5 of 20" rather than a bare number that quietly hides the sampling.
 *
 * Only rules that actually apply are emitted. A list that grows a line for every non-behaviour
 * ("questions are in a fixed order", "there is no timer") is noise, and noise is exactly what
 * makes a player skip the screen this list exists for. */
export function buildQuizRules(
  questions: readonly QuizScriptQuestion[],
  quizSettings: QuizScriptSettings,
  bankSize: number
): QuizRule[] {
  const rules: QuizRule[] = [];
  const count = questions.length;

  rules.push({
    id: 'questions',
    icon: 'list',
    text:
      bankSize > count
        ? `${plural(count, 'question')}, drawn at random from a bank of ${bankSize}.`
        : `${plural(count, 'question')}.`
  });

  // Shuffling one question is a no-op, so saying so would be a rule about nothing.
  if (quizSettings.shuffle_questions !== false && count > 1) {
    rules.push({
      id: 'shuffle',
      icon: 'shuffle',
      text: 'Questions come in a random order — a different one every run.'
    });
  }

  const locks = locksOnSubmit(quizSettings);
  rules.push({
    id: 'navigation',
    icon: locks ? 'lock' : 'navigate',
    text: locks
      ? "Submitting an answer locks that question in — there's no going back."
      : 'You can move back and forth between questions and change any answer, then submit the whole quiz at the end.'
  });

  const required = questions.filter((q) => settingBoolean(q.settings.require_answer)).length;
  rules.push({
    id: 'require_answer',
    icon: required === 0 ? 'skip' : 'required',
    text:
      required === 0
        ? 'Any question can be skipped.'
        : required === count
          ? 'Every question has to be answered before you can submit it.'
          : 'Some questions have to be answered before you can submit them.'
  });

  // Gated on `timer_seconds` being present even though the parser rejects a timer without it
  // (see QUIZ_SETTING_RULES.timer_mode) — staying total is cheaper than reasoning about whether
  // every caller's settings came through the parser.
  const timerMode = settingString(quizSettings.timer_mode, 'off');
  const timerSeconds = settingNumber(quizSettings.timer_seconds);
  if ((timerMode === 'per_question' || timerMode === 'per_quiz') && timerSeconds !== undefined) {
    rules.push({
      id: 'timer',
      icon: 'timer',
      text:
        timerMode === 'per_question'
          ? `${formatDuration(timerSeconds)} for each question.`
          : `${formatDuration(timerSeconds)} for the whole quiz — one shared clock.`
    });
    rules.push({
      id: 'on_timeout',
      icon: 'alarm',
      text:
        settingString(quizSettings.on_timeout, 'auto_submit') === 'lock_zero'
          ? "When the clock runs out, the question locks with no credit — anything you'd entered doesn't count."
          : "When the clock runs out, whatever you've entered is submitted as-is."
    });
  }

  const revealAnswers = settingString(quizSettings.reveal_answers, 'after_every_question');
  rules.push({
    id: 'reveal_answers',
    icon: revealAnswers === 'never' ? 'eye-off' : 'eye',
    text:
      revealAnswers === 'after_every_question'
        ? 'Correct answers are revealed as soon as you submit each question.'
        : revealAnswers === 'at_end'
          ? 'Correct answers stay hidden until the whole quiz is submitted.'
          : 'Correct answers are never revealed, not even in the end-of-quiz review.'
  });

  const revealScores = settingString(quizSettings.reveal_scores, 'after_every_question');
  rules.push({
    id: 'reveal_scores',
    icon: revealScores === 'never' ? 'eye-off' : 'eye',
    text:
      revealScores === 'after_every_question'
        ? 'Points are shown as soon as you submit each question.'
        : revealScores === 'at_end'
          ? 'Points are only shown once the whole quiz is submitted.'
          : 'Points are never shown, not even at the end.'
  });

  // Both branches describe the reveal screen, which only exists when something is revealed live —
  // in deferred mode there's nothing between questions to pause on or skip.
  if (locks) {
    const revealScreenSeconds = settingNumber(quizSettings.reveal_screen_seconds);
    if (quizSettings.show_reveal_screen === false) {
      rules.push({
        id: 'reveal_screen',
        icon: 'fast-forward',
        text: "There's no pause between questions — each question's points flash beside the running score."
      });
    } else if (revealScreenSeconds !== undefined) {
      rules.push({
        id: 'reveal_screen',
        icon: 'fast-forward',
        text: `Each reveal screen moves on by itself after ${formatDuration(revealScreenSeconds)}.`
      });
    }
  }

  // Safe to show even under reveal_scores=never: a question's max never depends on how it's
  // answered (see `questionMaxPoints`), which is the same reasoning QuizPlayer already documents
  // for showing the total in its running-score header.
  const totalPoints = questions.reduce((sum, q) => sum + questionMaxPoints(q), 0);
  if (totalPoints > 0) {
    rules.push({
      id: 'points',
      icon: 'points',
      text: `${plural(totalPoints, 'point')} up for grabs.`
    });
  }

  const negative = questions.filter(hasNegativeMarking).length;
  if (negative > 0) {
    rules.push({
      id: 'negative_marking',
      icon: 'penalty',
      text:
        negative === count
          ? 'Wrong answers deduct points.'
          : 'Some questions deduct points for a wrong answer.'
    });
  }

  // Mirrors `gradeRun`'s own branch exactly (points_to_win wins, else percent_to_win ?? 75) — a
  // unit test pins the two together so they can't drift. Suppressed alongside `points` at a zero
  // total, where "75% of the available points" would be a threshold over nothing.
  if (totalPoints > 0) {
    const pointsToWin = settingNumber(quizSettings.points_to_win);
    rules.push({
      id: 'win',
      icon: 'trophy',
      text:
        pointsToWin !== undefined
          ? `Score ${plural(pointsToWin, 'point')} or more to win.`
          : `Score ${settingNumber(quizSettings.percent_to_win) ?? 75}% or more of the available points to win.`
    });
  }

  return rules;
}
