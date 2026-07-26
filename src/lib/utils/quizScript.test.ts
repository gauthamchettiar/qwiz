import { describe, expect, it } from 'vitest';
import {
  coerceSetting,
  parseOptionContent,
  parseQuizScriptFrontmatter,
  parseQuizScriptQuestion,
  parseQwizFile,
  serializeQuizScript,
  serializeQuizScriptFrontmatter,
  serializeQuizScriptQuestion,
  settingValueSuggestions,
  suggestedSettingKeysForVariant,
  validateSettingValue
} from './quizScript';

describe('parseOptionContent', () => {
  it('detects a bare image line', () => {
    expect(parseOptionContent('![a cat](https://example.com/cat.png)')).toEqual({
      kind: 'image',
      alt: 'a cat',
      url: 'https://example.com/cat.png'
    });
  });

  it('detects an explicit <image> line', () => {
    expect(parseOptionContent('!<image>[a cat](https://example.com/cat.png)')).toEqual({
      kind: 'image',
      alt: 'a cat',
      url: 'https://example.com/cat.png'
    });
  });

  it('detects a <youtube> video line', () => {
    expect(parseOptionContent('!<youtube>[intro](https://youtu.be/abc)')).toEqual({
      kind: 'video',
      alt: 'intro',
      url: 'https://youtu.be/abc'
    });
  });

  it('falls back to plain text', () => {
    expect(parseOptionContent('just some text')).toEqual({ kind: 'text', text: 'just some text' });
  });
});

describe('coerceSetting', () => {
  it('coerces "true"/"false" to booleans', () => {
    expect(coerceSetting('true')).toBe(true);
    expect(coerceSetting('false')).toBe(false);
  });

  it('coerces numeric strings to numbers', () => {
    expect(coerceSetting('42')).toBe(42);
    expect(coerceSetting('-3.5')).toBe(-3.5);
  });

  it('leaves other strings as strings', () => {
    expect(coerceSetting('easy')).toBe('easy');
  });

  it('quoting forces a literal string even if it looks typed', () => {
    expect(coerceSetting('"true"')).toBe('true');
    expect(coerceSetting('"42"')).toBe('42');
  });
});

describe('validateSettingValue', () => {
  it('accepts a valid number setting', () => {
    expect(validateSettingValue('point', '5')).toEqual({ value: 5 });
  });

  it('rejects a non-numeric value for a number setting', () => {
    const result = validateSettingValue('point', 'abc');
    expect(result.value).toBe('abc');
    expect(result.error).toMatch(/must be a number/);
  });

  it('accepts true/false and yes/no for a boolean setting', () => {
    expect(validateSettingValue('shuffle', 'true')).toEqual({ value: true });
    expect(validateSettingValue('shuffle', 'yes')).toEqual({ value: true });
    expect(validateSettingValue('shuffle', 'no')).toEqual({ value: false });
  });

  it('rejects an invalid boolean value', () => {
    expect(validateSettingValue('shuffle', 'maybe').error).toMatch(/must be true\/false/);
  });

  it('accepts a valid enum value case-insensitively', () => {
    expect(validateSettingValue('difficulty', 'EASY')).toEqual({ value: 'easy' });
  });

  it('rejects an out-of-range enum value', () => {
    expect(validateSettingValue('difficulty', 'impossible').error).toMatch(/must be one of/);
  });

  it('rejects an unrecognized key entirely', () => {
    expect(validateSettingValue('not_a_real_key', '1').error).toMatch(/not a recognized setting/);
  });

  it('accepts option_display=grid2x2 and grid3x3', () => {
    expect(validateSettingValue('option_display', 'grid2x2')).toEqual({ value: 'grid2x2' });
    expect(validateSettingValue('option_display', 'grid3x3')).toEqual({ value: 'grid3x3' });
  });

  it('no longer accepts the old option_display=grid value — no backward-compat alias', () => {
    expect(validateSettingValue('option_display', 'grid').error).toMatch(/must be one of/);
  });
});

describe('suggestedSettingKeysForVariant / settingValueSuggestions', () => {
  it('excludes typed-only settings for single_choice/multiple_choice questions', () => {
    expect(suggestedSettingKeysForVariant('single_choice')).not.toContain('case_sensitive');
    expect(suggestedSettingKeysForVariant('multiple_choice')).not.toContain('case_sensitive');
  });

  it('excludes choice-only settings for a typed question', () => {
    expect(suggestedSettingKeysForVariant('typed')).not.toContain('shuffle');
  });

  it('suggests true/false for a boolean key and enum values for an enum key', () => {
    expect(settingValueSuggestions('shuffle')).toEqual(['true', 'false']);
    expect(settingValueSuggestions('difficulty')).toEqual(['easy', 'medium', 'hard']);
    expect(settingValueSuggestions('point')).toEqual([]);
  });
});

describe('parseQuizScriptQuestion', () => {
  it('parses a minimal choice question', () => {
    const source = ['What is H2O?', '{', '=Water', '~Salt', '}'].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.variant).toBe('question');
    expect(question.text).toBe('What is H2O?');
    expect(question.options).toEqual([
      { content: { kind: 'text', text: 'Water' }, correct: true },
      { content: { kind: 'text', text: 'Salt' }, correct: false }
    ]);
  });

  it('parses a compact variant header line for single_choice and multiple_choice', () => {
    for (const variant of ['single_choice', 'multiple_choice']) {
      const source = [`${variant}: What is H2O?`, '{', '=Water', '}'].join('\n');
      const { question, errors } = parseQuizScriptQuestion(source);
      expect(errors).toEqual([]);
      expect(question.variant).toBe(variant);
      expect(question.text).toBe('What is H2O?');
    }
  });

  it('rejects the old pre-split "choice" variant — no backward-compat alias', () => {
    const source = ['variant : choice', 'What is H2O?', '{', '=Water', '~Salt', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /Unknown variant "choice"/.test(e.message))).toBe(true);
  });

  it('rejects more than one correct option on a single_choice question', () => {
    const source = ['single_choice: Pick one', '{', '=a', '=b', '~c', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /single_choice.*requires exactly one/.test(e.message))).toBe(true);
  });

  it('allows exactly one correct option on a single_choice question', () => {
    const source = ['single_choice: Pick one', '{', '=a', '~b', '~c', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
  });

  it('allows any number of correct options on a multiple_choice question', () => {
    const source = ['multiple_choice: Pick some', '{', '=a', '=b', '~c', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
  });

  it('reads an explicit %N% point weight on an option', () => {
    const source = ['Pick a number', '{', '=Four %4%', '~Five %-1%', '}'].join('\n');
    const { question } = parseQuizScriptQuestion(source);
    expect(question.options[0].points).toBe(4);
    expect(question.options[1].points).toBe(-1);
  });

  it('forces every typed option to correct: true regardless of its marker', () => {
    const source = ['typed: Capital of France?', '{', '=Paris', '~Paris', '}'].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options.every((o) => o.correct)).toBe(true);
  });

  it('rejects an image/video option on a typed question', () => {
    const source = ['typed: pick', '{', '=![alt](url)', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /plain text/.test(e.message))).toBe(true);
  });

  it('errors when there are no options', () => {
    const { errors } = parseQuizScriptQuestion('Just some text with no block');
    expect(errors.some((e) => /no options/.test(e.message))).toBe(true);
  });

  it('errors when no option is marked correct', () => {
    const source = ['Question', '{', '~a', '~b', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /no option marked correct/.test(e.message))).toBe(true);
  });

  it('errors when numeric_tolerance and fuzzy_tolerance are both set', () => {
    const source = ['typed: q', '{', '=a', '}', ':numeric_tolerance=1', ':fuzzy_tolerance=10'].join(
      '\n'
    );
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /can't set both/.test(e.message))).toBe(true);
  });

  it('errors when a typed-only setting is used on a non-typed question', () => {
    const source = ['Question', '{', '=a', '~b', '}', ':case_sensitive=true'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /only applies to typed/.test(e.message))).toBe(true);
  });

  it('errors when a choice-only setting is used on a typed question', () => {
    const source = ['typed: q', '{', '=a', '}', ':shuffle=true'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(
      errors.some((e) => /only applies to single_choice\/multiple_choice/.test(e.message))
    ).toBe(true);
  });

  it('rejects min_answers/max_answers/partial_points on a single_choice question — it can never have "some but not all" or "more than one" selected', () => {
    const minSource = ['single_choice: q', '{', '=a', '~b', '}', ':min_answers=1'].join('\n');
    expect(
      parseQuizScriptQuestion(minSource).errors.some((e) =>
        /only applies to multiple_choice\/typed/.test(e.message)
      )
    ).toBe(true);

    const maxSource = ['single_choice: q', '{', '=a', '~b', '}', ':max_answers=1'].join('\n');
    expect(
      parseQuizScriptQuestion(maxSource).errors.some((e) =>
        /only applies to multiple_choice\/typed/.test(e.message)
      )
    ).toBe(true);

    const partialSource = ['single_choice: q', '{', '=a', '~b', '}', ':partial_points=true'].join(
      '\n'
    );
    expect(
      parseQuizScriptQuestion(partialSource).errors.some((e) =>
        /only applies to multiple_choice\/typed/.test(e.message)
      )
    ).toBe(true);
  });

  it('errors when max_answers is below the number of correct options without partial_points', () => {
    const source = ['Question', '{', '=a', '=b', '~c', '}', ':max_answers=1'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /exact match is impossible/.test(e.message))).toBe(true);
  });

  it('allows max_answers below correct-option count when partial_points is set', () => {
    const source = [
      'Question',
      '{',
      '=a',
      '=b',
      '~c',
      '}',
      ':max_answers=1',
      ':partial_points=true'
    ].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
  });

  it('errors when min_answers exceeds max_answers', () => {
    const source = ['Question', '{', '=a', '~b', '}', ':min_answers=2', ':max_answers=1'].join(
      '\n'
    );
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /cannot be greater than "max_answers"/.test(e.message))).toBe(true);
  });

  it('parses a question-level reveal hint alongside media', () => {
    const source = [
      'Question',
      '!<reveal>[Need a hint?](it rhymes with cat) %-1%',
      '{',
      '=hat',
      '~dog',
      '}'
    ].join('\n');
    const { question } = parseQuizScriptQuestion(source);
    expect(question.extras).toEqual([
      { label: 'Need a hint?', content: 'it rhymes with cat', points: -1 }
    ]);
  });

  it('treats a leading-backslash line as escaped literal text', () => {
    const source = ['\\=Not actually an option marker', '{', '=a', '}'].join('\n');
    const { question } = parseQuizScriptQuestion(source);
    expect(question.text).toBe('=Not actually an option marker');
  });
});

describe('character_input parsing', () => {
  it('parses bracket pre-reveal markers and strips them from the option text', () => {
    const source = ['character_input: word', '{', '=[P]a[r]is', '}'].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options[0]).toEqual({
      content: { kind: 'text', text: 'Paris' },
      correct: true,
      prerevealed: [0, 2]
    });
  });

  it('forces every option correct: true regardless of its marker, same as typed', () => {
    const source = ['character_input: word', '{', '~paris', '}'].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options[0].correct).toBe(true);
  });

  it('rejects an image/video option, same as typed', () => {
    const source = ['character_input: pick', '{', '=![alt](url)', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /plain text/.test(e.message))).toBe(true);
  });

  it('accepts its own settings (letter_bank, prereveal_mode, prereveal_count, letter_bank_chars)', () => {
    const source = [
      'character_input: word',
      '{',
      '=cat',
      '}',
      ':letter_bank=fixed',
      ':letter_bank_chars=catxyz',
      ':prereveal_mode=sequence',
      ':prereveal_count=1'
    ].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.settings).toEqual({
      letter_bank: 'fixed',
      letter_bank_chars: 'catxyz',
      prereveal_mode: 'sequence',
      prereveal_count: 1
    });
  });

  it('rejects a character_input-only setting on another variant', () => {
    const source = ['multiple_choice: q', '{', '=a', '~b', '}', ':letter_bank=alphabet'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /only applies to character_input/.test(e.message))).toBe(true);
  });

  it('case_sensitive applies to typed only, not character_input — a bank guess has no case to compare', () => {
    const typedSource = ['typed: q', '{', '=a', '}', ':case_sensitive=true'].join('\n');
    expect(parseQuizScriptQuestion(typedSource).errors).toEqual([]);

    const ciSource = ['character_input: q', '{', '=a', '}', ':case_sensitive=true'].join('\n');
    expect(
      parseQuizScriptQuestion(ciSource).errors.some((e) => /only applies to typed/.test(e.message))
    ).toBe(true);
  });
});

describe('setting interactions', () => {
  it('letter_bank=fixed with no letter_bank_chars is a parse error (would produce an empty, unplayable bank)', () => {
    const source = ['character_input: q', '{', '=cat', '}', ':letter_bank=fixed'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(
      errors.some((e) => /letter_bank=fixed.*requires.*letter_bank_chars/.test(e.message))
    ).toBe(true);
  });

  it('letter_bank=fixed with only non-letter characters is also a parse error', () => {
    const source = [
      'character_input: q',
      '{',
      '=cat',
      '}',
      ':letter_bank=fixed',
      ':letter_bank_chars=123'
    ].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(
      errors.some((e) => /letter_bank=fixed.*requires.*letter_bank_chars/.test(e.message))
    ).toBe(true);
  });

  it('letter_bank=fixed with at least one real letter is fine', () => {
    const source = [
      'character_input: q',
      '{',
      '=cat',
      '}',
      ':letter_bank=fixed',
      ':letter_bank_chars=c'
    ].join('\n');
    expect(parseQuizScriptQuestion(source).errors).toEqual([]);
  });

  it("points_to_win and percentage_points_to_win can't both be set on the same quiz", () => {
    // points_to_win always wins (see gradeRun) — setting both silently drops the percentage one,
    // which is worth flagging the same way numeric_tolerance/fuzzy_tolerance's conflict is.
    const source = [
      '---',
      'title: T',
      ':points_to_win=10',
      ':percentage_points_to_win=90',
      '---'
    ].join('\n');
    const { errors } = parseQuizScriptFrontmatter(source);
    expect(errors.some((e) => /can't both be set/.test(e.message))).toBe(true);
  });

  it('points_to_win alone, or percentage_points_to_win alone, is fine', () => {
    expect(
      parseQuizScriptFrontmatter(['---', 'title: T', ':points_to_win=10', '---'].join('\n')).errors
    ).toEqual([]);
    expect(
      parseQuizScriptFrontmatter(
        ['---', 'title: T', ':percentage_points_to_win=90', '---'].join('\n')
      ).errors
    ).toEqual([]);
  });

  it('timer_mode=per_question or per_quiz requires timer_duration', () => {
    for (const mode of ['per_question', 'per_quiz']) {
      const source = ['---', 'title: T', `:timer_mode=${mode}`, '---'].join('\n');
      expect(
        parseQuizScriptFrontmatter(source).errors.some((e) =>
          /"timer_duration" is required/.test(e.message)
        )
      ).toBe(true);
    }
  });

  it('timer_mode=per_quiz with timer_duration is fine regardless of reveal_answers/reveal_scores', () => {
    const source = [
      '---',
      'title: T',
      ':timer_mode=per_quiz',
      ':timer_duration=60',
      ':reveal_answers=at_end',
      ':reveal_scores=at_end',
      '---'
    ].join('\n');
    expect(parseQuizScriptFrontmatter(source).errors).toEqual([]);
  });

  it('timer_mode=per_question requires reveal_answers or reveal_scores set to after_every_question', () => {
    const source = [
      '---',
      'title: T',
      ':timer_mode=per_question',
      ':timer_duration=30',
      ':reveal_answers=at_end',
      ':reveal_scores=at_end',
      '---'
    ].join('\n');
    expect(
      parseQuizScriptFrontmatter(source).errors.some((e) =>
        /"timer_mode" of "per_question" requires/.test(e.message)
      )
    ).toBe(true);
  });

  it('timer_mode=per_question is fine when reveal_answers/reveal_scores default to after_every_question', () => {
    const source = [
      '---',
      'title: T',
      ':timer_mode=per_question',
      ':timer_duration=30',
      '---'
    ].join('\n');
    expect(parseQuizScriptFrontmatter(source).errors).toEqual([]);
  });

  it('intermediate_screen_duration requires show_intermediate_screen to not be false', () => {
    const source = [
      '---',
      'title: T',
      ':intermediate_screen_duration=5',
      ':show_intermediate_screen=false',
      '---'
    ].join('\n');
    expect(
      parseQuizScriptFrontmatter(source).errors.some((e) =>
        /"intermediate_screen_duration" can't be set/.test(e.message)
      )
    ).toBe(true);
  });

  it('intermediate_screen_duration alone (show_intermediate_screen defaulting true) is fine', () => {
    const source = ['---', 'title: T', ':intermediate_screen_duration=5', '---'].join('\n');
    expect(parseQuizScriptFrontmatter(source).errors).toEqual([]);
  });
});

describe('serializeQuizScriptQuestion round-trips through parseQuizScriptQuestion', () => {
  const cases = [
    [
      'plain question (defaults to multi-select)',
      ['What is H2O?', '{', '=Water', '~Salt', '}'].join('\n')
    ],
    [
      'single_choice header',
      ['single_choice: What is H2O?', '{', '=Water', '~Salt', '}'].join('\n')
    ],
    [
      'multiple_choice header',
      ['multiple_choice: Pick some', '{', '=Water', '=Steam', '~Salt', '}'].join('\n')
    ],
    [
      'typed with settings',
      ['typed: Capital of France?', '{', '=Paris', '}', ':fuzzy_tolerance=15'].join('\n')
    ],
    [
      'character_input with bracket pre-reveal and settings',
      [
        'character_input: Capital of France?',
        '{',
        '=[P]a[r]is',
        '}',
        ':letter_bank=alphabet',
        ':prereveal_mode=sequence',
        ':penalty=-1'
      ].join('\n')
    ],
    ['weighted options', ['Pick', '{', '=Four %4%', '~Five %-1%', '}'].join('\n')]
  ] as const;

  it.each(cases)('%s', (_label, source) => {
    const first = parseQuizScriptQuestion(source);
    expect(first.errors).toEqual([]);
    const roundTripped = serializeQuizScriptQuestion(first.question);
    const second = parseQuizScriptQuestion(roundTripped);
    expect(second.errors).toEqual([]);
    expect(second.question).toEqual(first.question);
  });
});

describe('parseQuizScriptFrontmatter / serializeQuizScriptFrontmatter', () => {
  it('parses title/description/category/tags and quiz-level settings', () => {
    const source = [
      '---',
      'title: Geography',
      'description: A quiz about the world',
      'category: geography',
      'tags: [easy, fun]',
      ':max_questions=5',
      '---'
    ].join('\n');
    const { frontmatter, errors } = parseQuizScriptFrontmatter(source);
    expect(errors).toEqual([]);
    expect(frontmatter).toEqual({
      title: 'Geography',
      description: 'A quiz about the world',
      category: 'geography',
      tags: ['easy', 'fun'],
      settings: { max_questions: 5 }
    });
  });

  it('errors when the block does not start with "---"', () => {
    const { errors } = parseQuizScriptFrontmatter('title: Geography\n---');
    expect(errors.some((e) => /must start with/.test(e.message))).toBe(true);
  });

  it('errors when show_intermediate_screen=false conflicts with the default reveal_answers', () => {
    const source = ['---', 'title: Q', ':show_intermediate_screen=false', '---'].join('\n');
    const { errors } = parseQuizScriptFrontmatter(source);
    expect(errors.some((e) => /show_intermediate_screen/.test(e.message))).toBe(true);
  });

  it('round-trips through serializeQuizScriptFrontmatter', () => {
    const source = [
      '---',
      'title: Geography',
      'description: A quiz about the world',
      'category: geography',
      'tags: [easy, fun]',
      ':max_questions=5',
      '---'
    ].join('\n');
    const first = parseQuizScriptFrontmatter(source);
    const serialized = serializeQuizScriptFrontmatter(first.frontmatter);
    const second = parseQuizScriptFrontmatter(serialized);
    expect(second.errors).toEqual([]);
    expect(second.frontmatter).toEqual(first.frontmatter);
  });

  it('escapes a multi-line description so it survives round-tripping', () => {
    const frontmatter = {
      title: 'T',
      description: 'line one\nline two',
      category: '',
      tags: [],
      settings: {}
    };
    const serialized = serializeQuizScriptFrontmatter(frontmatter);
    const { frontmatter: parsed } = parseQuizScriptFrontmatter(serialized);
    expect(parsed.description).toBe('line one\nline two');
  });
});

describe('parseQwizFile', () => {
  it('parses a whole document into frontmatter and per-question source blocks', () => {
    const source = [
      '---',
      'title: Geography',
      'description: ',
      'category: ',
      'tags: []',
      '---',
      '',
      'What is the capital of France?',
      '{',
      '=Paris',
      '~Lyon',
      '}',
      '',
      'typed: What is 2+2?',
      '{',
      '=4',
      '}'
    ].join('\n');
    const { frontmatter, questionCodes, errors } = parseQwizFile(source);
    expect(errors).toEqual([]);
    expect(frontmatter.title).toBe('Geography');
    expect(questionCodes).toHaveLength(2);
  });

  it('errors when the file has no questions', () => {
    const source = ['---', 'title: Empty', '---'].join('\n');
    const { errors } = parseQwizFile(source);
    expect(errors).toContain('File has no questions.');
  });

  it('errors when the file does not start with "---"', () => {
    const { errors } = parseQwizFile('not frontmatter at all\n\nQuestion\n{\n=a\n}');
    expect(errors.some((e) => e.startsWith('Line 1:'))).toBe(true);
  });

  it('prefixes per-question errors with the question number', () => {
    const source = ['---', 'title: T', '---', '', 'Question with no options'].join('\n');
    const { errors } = parseQwizFile(source);
    expect(errors.some((e) => e.startsWith('Question 1:'))).toBe(true);
  });
});

describe('serializeQuizScript', () => {
  it('joins the frontmatter and every question with a blank line between', () => {
    const doc = serializeQuizScript(
      { title: 'T', description: '', category: '', tags: [], settings: {} },
      ['Q1 body', 'Q2 body']
    );
    expect(doc).toBe(
      [
        serializeQuizScriptFrontmatter({
          title: 'T',
          description: '',
          category: '',
          tags: [],
          settings: {}
        }),
        'Q1 body',
        'Q2 body'
      ].join('\n\n')
    );
  });
});
