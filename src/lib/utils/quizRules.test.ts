import { describe, expect, it } from 'vitest';
import { buildQuizRules, type QuizRule, type QuizRuleId } from './quizRules';
import { buildPlayRun, gradeRun, locksOnSubmit } from './grading';
import { QUIZ_SETTING_RULES, type QuizScriptQuestion, type QuizScriptSettings } from './quizScript';

function textOption(text: string, correct: boolean, points?: number) {
  return { content: { kind: 'text' as const, text }, correct, points };
}

function makeQuestion(overrides: Partial<QuizScriptQuestion> = {}): QuizScriptQuestion {
  return {
    variant: 'question',
    text: 'What is 2 + 2?',
    media: [],
    options: [textOption('4', true), textOption('5', false)],
    extras: [],
    settings: {},
    ...overrides
  };
}

function questions(count: number, settings: QuizScriptSettings = {}): QuizScriptQuestion[] {
  return Array.from({ length: count }, () => makeQuestion({ settings }));
}

/** Rules are looked up by id and asserted on icon/substring — never on a whole sentence, so the
 * wording stays editable without a test rewrite. */
function ruleById(rules: QuizRule[], id: QuizRuleId): QuizRule | undefined {
  return rules.find((r) => r.id === id);
}

function textOf(rules: QuizRule[], id: QuizRuleId): string {
  const rule = ruleById(rules, id);
  expect(rule, `expected a "${id}" rule`).toBeDefined();
  return rule!.text;
}

describe('buildQuizRules — the default quiz', () => {
  it('emits the rules that always apply, in player-useful order', () => {
    const rules = buildQuizRules(questions(2), {}, 2);
    expect(rules.map((r) => r.id)).toEqual([
      'questions',
      'shuffle',
      'navigation',
      'require_answer',
      'reveal_answers',
      'reveal_scores',
      'points',
      'win'
    ]);
  });

  it('emits nothing for settings that are off', () => {
    const rules = buildQuizRules(questions(2), {}, 2);
    for (const id of ['timer', 'on_timeout', 'reveal_screen', 'negative_marking'] as QuizRuleId[]) {
      expect(ruleById(rules, id)).toBeUndefined();
    }
  });

  it('never emits a duplicate id or an empty sentence', () => {
    const rules = buildQuizRules(questions(3), { timer_mode: 'per_quiz', timer_seconds: 60 }, 3);
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    expect(rules.every((r) => r.text.length > 0)).toBe(true);
  });

  it('is total against an empty run', () => {
    expect(() => buildQuizRules([], {}, 0)).not.toThrow();
    expect(textOf(buildQuizRules([], {}, 0), 'questions')).toBe('0 questions.');
  });
});

describe('buildQuizRules — the shape of the run', () => {
  it('counts questions, singular and plural', () => {
    expect(textOf(buildQuizRules(questions(1), {}, 1), 'questions')).toBe('1 question.');
    expect(textOf(buildQuizRules(questions(12), {}, 12), 'questions')).toBe('12 questions.');
  });

  it('names the bank it was sampled from under questions_per_run', () => {
    const text = textOf(buildQuizRules(questions(5), { questions_per_run: 5 }, 20), 'questions');
    expect(text).toContain('5 questions');
    expect(text).toContain('bank of 20');
  });

  it('shuffles by default, and not when explicitly off', () => {
    expect(ruleById(buildQuizRules(questions(2), {}, 2), 'shuffle')).toBeDefined();
    expect(
      ruleById(buildQuizRules(questions(2), { shuffle_questions: false }, 2), 'shuffle')
    ).toBeUndefined();
  });

  it('says nothing about shuffling a single question', () => {
    expect(ruleById(buildQuizRules(questions(1), {}, 1), 'shuffle')).toBeUndefined();
  });
});

describe('buildQuizRules — navigation', () => {
  const revealValues = ['after_every_question', 'at_end', 'never'] as const;

  // The drift test for `locksOnSubmit`: the rule the player reads has to describe the same
  // navigation model QuizPlayer actually implements, for every combination of the two settings.
  it.each(revealValues.flatMap((a) => revealValues.map((s) => [a, s] as const)))(
    'reveal_answers=%s + reveal_scores=%s matches locksOnSubmit',
    (reveal_answers, reveal_scores) => {
      const settings = { reveal_answers, reveal_scores };
      const rule = ruleById(buildQuizRules(questions(2), settings, 2), 'navigation');
      expect(rule?.icon).toBe(locksOnSubmit(settings) ? 'lock' : 'navigate');
    }
  );

  it('describes free navigation in deferred mode', () => {
    const rules = buildQuizRules(questions(2), { reveal_answers: 'at_end', reveal_scores: 'at_end' }, 2); // prettier-ignore
    expect(textOf(rules, 'navigation')).toContain('move back and forth');
  });
});

describe('buildQuizRules — skipping', () => {
  it('says every question is skippable when none requires an answer', () => {
    expect(ruleById(buildQuizRules(questions(2), {}, 2), 'require_answer')?.icon).toBe('skip');
    expect(textOf(buildQuizRules(questions(2), {}, 2), 'require_answer')).toContain('skipped');
  });

  it('distinguishes all questions from some', () => {
    const all = questions(2, { require_answer: true });
    expect(textOf(buildQuizRules(all, {}, 2), 'require_answer')).toContain('Every question');

    const some = [makeQuestion({ settings: { require_answer: true } }), makeQuestion()];
    expect(textOf(buildQuizRules(some, {}, 2), 'require_answer')).toContain('Some questions');
    expect(ruleById(buildQuizRules(some, {}, 2), 'require_answer')?.icon).toBe('required');
  });
});

describe('buildQuizRules — the clock', () => {
  it('describes a per-question timer and its timeout behaviour', () => {
    const rules = buildQuizRules(
      questions(2),
      { timer_mode: 'per_question', timer_seconds: 45 },
      2
    );
    expect(textOf(rules, 'timer')).toBe('45 seconds for each question.');
    expect(textOf(rules, 'on_timeout')).toContain('submitted as-is');
  });

  it('describes a per-quiz timer as one shared clock', () => {
    const rules = buildQuizRules(questions(2), { timer_mode: 'per_quiz', timer_seconds: 90 }, 2);
    expect(textOf(rules, 'timer')).toContain('1 minute 30 seconds');
    expect(textOf(rules, 'timer')).toContain('whole quiz');
  });

  it('spells durations as prose, not as a clock face', () => {
    const at = (seconds: number) =>
      textOf(buildQuizRules(questions(1), { timer_mode: 'per_quiz', timer_seconds: seconds }, 1), 'timer'); // prettier-ignore
    expect(at(1)).toContain('1 second ');
    expect(at(45)).toContain('45 seconds');
    expect(at(60)).toContain('1 minute ');
    expect(at(90)).toContain('1 minute 30 seconds');
    expect(at(120)).toContain('2 minutes');
  });

  it('reports lock_zero as losing the credit', () => {
    const rules = buildQuizRules(
      questions(2),
      { timer_mode: 'per_question', timer_seconds: 30, on_timeout: 'lock_zero' },
      2
    );
    expect(textOf(rules, 'on_timeout')).toContain('no credit');
  });

  it('stays silent when the timer is off, or set without seconds', () => {
    for (const settings of [
      {},
      { timer_mode: 'off' },
      { timer_mode: 'per_quiz' } // rejected by the parser, but this function stays total
    ] as QuizScriptSettings[]) {
      const rules = buildQuizRules(questions(2), settings, 2);
      expect(ruleById(rules, 'timer')).toBeUndefined();
      expect(ruleById(rules, 'on_timeout')).toBeUndefined();
    }
  });
});

describe('buildQuizRules — reveals', () => {
  it.each([
    ['after_every_question', 'eye', 'as soon as you submit'],
    ['at_end', 'eye', 'until the whole quiz is submitted'],
    ['never', 'eye-off', 'never revealed']
  ])('reveal_answers=%s', (value, icon, fragment) => {
    const rule = ruleById(buildQuizRules(questions(2), { reveal_answers: value }, 2), 'reveal_answers'); // prettier-ignore
    expect(rule?.icon).toBe(icon);
    expect(rule?.text).toContain(fragment);
  });

  it.each([
    ['after_every_question', 'eye', 'as soon as you submit'],
    ['at_end', 'eye', 'once the whole quiz is submitted'],
    ['never', 'eye-off', 'never shown']
  ])('reveal_scores=%s', (value, icon, fragment) => {
    const rule = ruleById(buildQuizRules(questions(2), { reveal_scores: value }, 2), 'reveal_scores'); // prettier-ignore
    expect(rule?.icon).toBe(icon);
    expect(rule?.text).toContain(fragment);
  });

  it('mentions an auto-advancing reveal screen', () => {
    const rules = buildQuizRules(questions(2), { reveal_screen_seconds: 5 }, 2);
    expect(textOf(rules, 'reveal_screen')).toContain('5 seconds');
  });

  it('mentions a skipped reveal screen', () => {
    const rules = buildQuizRules(
      questions(2),
      { reveal_answers: 'never', reveal_scores: 'after_every_question', show_reveal_screen: false },
      2
    );
    expect(textOf(rules, 'reveal_screen')).toContain('no pause');
  });

  it('says nothing about a reveal screen in deferred mode — there is none', () => {
    const rules = buildQuizRules(
      questions(2),
      {
        reveal_answers: 'at_end',
        reveal_scores: 'at_end',
        show_reveal_screen: false,
        reveal_screen_seconds: 5
      },
      2
    );
    expect(ruleById(rules, 'reveal_screen')).toBeUndefined();
  });
});

describe('buildQuizRules — scoring', () => {
  it('totals the points across the run', () => {
    const run = [makeQuestion({ settings: { points_correct: 3 } }), makeQuestion()];
    expect(textOf(buildQuizRules(run, {}, 2), 'points')).toContain('4 points');
  });

  it('says "1 point" for a single-point quiz', () => {
    expect(textOf(buildQuizRules(questions(1), {}, 1), 'points')).toContain('1 point ');
  });

  it('drops both points and win when nothing is scorable', () => {
    const run = [makeQuestion({ settings: { points_correct: 0 } })];
    const rules = buildQuizRules(run, {}, 1);
    expect(ruleById(rules, 'points')).toBeUndefined();
    expect(ruleById(rules, 'win')).toBeUndefined();
  });

  it('states the default percentage threshold', () => {
    expect(textOf(buildQuizRules(questions(2), {}, 2), 'win')).toContain('75%');
    expect(textOf(buildQuizRules(questions(2), { percent_to_win: 60 }, 2), 'win')).toContain('60%');
  });

  it('lets points_to_win override the percentage, exactly as gradeRun does', () => {
    const settings: QuizScriptSettings = { points_to_win: 12, percent_to_win: 99 };
    expect(textOf(buildQuizRules(questions(2), settings, 2), 'win')).toContain('12 points');
    // The rule promises 12 is enough — gradeRun has to agree, whatever percent_to_win says.
    expect(gradeRun([{ earned: 12, max: 100 }], settings).won).toBe(true);
    expect(gradeRun([{ earned: 11, max: 100 }], settings).won).toBe(false);
  });
});

describe('buildQuizRules — negative marking', () => {
  it('warns when every question can deduct points', () => {
    const run = questions(2, { points_wrong: -1 });
    expect(textOf(buildQuizRules(run, {}, 2), 'negative_marking')).toBe(
      'Wrong answers deduct points.'
    );
  });

  it('warns more narrowly when only some can', () => {
    const run = [
      makeQuestion({ options: [textOption('a', true), textOption('b', false, -2)] }),
      makeQuestion()
    ];
    expect(textOf(buildQuizRules(run, {}, 2), 'negative_marking')).toContain('Some questions');
  });

  it('stays silent for a zero penalty, or one that can never apply', () => {
    expect(
      ruleById(buildQuizRules(questions(2, { points_wrong: 0 }), {}, 2), 'negative_marking')
    ).toBeUndefined();
    // Typed variants force every option correct at parse time, so points_wrong never reaches them.
    const typed = [
      makeQuestion({
        variant: 'type_answer',
        options: [textOption('paris', true)],
        settings: { points_wrong: -1 }
      })
    ];
    expect(ruleById(buildQuizRules(typed, {}, 1), 'negative_marking')).toBeUndefined();
  });
});

describe('buildQuizRules — reading the run the way QuizPlayer feeds it', () => {
  it('sees quiz-wide defaults that buildPlayRun folded into each question', () => {
    const run = buildPlayRun(questions(2), {
      points_wrong: -1,
      require_answer: true,
      shuffle_questions: false
    });
    const rules = buildQuizRules(
      run.map((playQuestion) => playQuestion.question),
      { points_wrong: -1, require_answer: true, shuffle_questions: false },
      2
    );
    expect(textOf(rules, 'require_answer')).toContain('Every question');
    expect(textOf(rules, 'negative_marking')).toBe('Wrong answers deduct points.');
  });
});

// The same idea as settingsDoc.test.ts: nothing in the build notices when a new quiz-wide setting
// changes how a run behaves without the welcome screen ever mentioning it. Adding a key to
// QUIZ_SETTING_RULES fails here until someone has decided which side of the line it falls on.
describe('welcome-screen coverage of QUIZ_SETTING_RULES', () => {
  const SPOKEN_FOR = [
    'on_timeout',
    'percent_to_win',
    'points_to_win',
    'questions_per_run',
    'reveal_answers',
    'reveal_screen_seconds',
    'reveal_scores',
    'show_reveal_screen',
    'shuffle_questions',
    'timer_mode',
    'timer_seconds'
  ];

  /** Settings the rules list deliberately stays quiet about, with the reason. */
  const NOT_A_RULE: Record<string, string> = {
    show_running_score: 'a display affordance — the header is visible on screen, not a rule of play'
  };

  it('speaks for every quiz-wide setting that is not explicitly excused', () => {
    expect([...SPOKEN_FOR, ...Object.keys(NOT_A_RULE)].sort()).toEqual(
      Object.keys(QUIZ_SETTING_RULES).sort()
    );
  });
});
