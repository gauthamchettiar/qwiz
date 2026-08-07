import { describe, expect, it } from 'vitest';
import {
  coerceSetting,
  optionTargetText,
  parseOptionContent,
  parseQuizScriptFrontmatter,
  parseQuizScriptQuestion,
  parseQwizFile,
  QUIZ_FRONTMATTER_RULES,
  QUIZ_SETTING_RULES,
  resolveQuestionSettings,
  serializeQuizScript,
  serializeQuizScriptFrontmatter,
  serializeQuizScriptQuestion,
  settingDefaultValue,
  settingValueSuggestions,
  suggestedSettingKeysForVariant,
  validateSettingValue,
  type QuizScriptQuestion
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
    expect(validateSettingValue('points_correct', '5')).toEqual({ value: 5 });
  });

  it('rejects a non-numeric value for a number setting', () => {
    const result = validateSettingValue('points_correct', 'abc');
    expect(result.value).toBe('abc');
    expect(result.error).toMatch(/must be a number/);
  });

  it('accepts true/false and yes/no for a boolean setting', () => {
    expect(validateSettingValue('shuffle_options', 'true')).toEqual({ value: true });
    expect(validateSettingValue('shuffle_options', 'yes')).toEqual({ value: true });
    expect(validateSettingValue('shuffle_options', 'no')).toEqual({ value: false });
  });

  it('rejects an invalid boolean value', () => {
    expect(validateSettingValue('shuffle_options', 'maybe').error).toMatch(/must be true\/false/);
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

  it('accepts options_layout=grid2x2 and grid3x3', () => {
    expect(validateSettingValue('options_layout', 'grid2x2')).toEqual({ value: 'grid2x2' });
    expect(validateSettingValue('options_layout', 'grid3x3')).toEqual({ value: 'grid3x3' });
  });

  it('no longer accepts the old options_layout=grid value — no backward-compat alias', () => {
    expect(validateSettingValue('options_layout', 'grid').error).toMatch(/must be one of/);
  });
});

describe('suggestedSettingKeysForVariant / settingValueSuggestions', () => {
  it('excludes typed-only settings for pick_one/pick_many questions', () => {
    expect(suggestedSettingKeysForVariant('pick_one')).not.toContain('match_case');
    expect(suggestedSettingKeysForVariant('pick_many')).not.toContain('match_case');
  });

  it('excludes choice-only settings for a typed question', () => {
    expect(suggestedSettingKeysForVariant('type_answer')).not.toContain('shuffle_options');
  });

  it('suggests true/false for a boolean key and enum values for an enum key', () => {
    expect(settingValueSuggestions('shuffle_options')).toEqual(['true', 'false']);
    expect(settingValueSuggestions('difficulty')).toEqual(['easy', 'medium', 'hard']);
    expect(settingValueSuggestions('points_correct')).toEqual([]);
  });
});

describe('settingDefaultValue', () => {
  it('returns the boolean/enum/number default as a string', () => {
    expect(settingDefaultValue('shuffle_options')).toBe('false');
    expect(settingDefaultValue('options_layout')).toBe('list');
    expect(settingDefaultValue('points_correct')).toBe('1');
  });

  it('returns an empty string for a setting with no real default', () => {
    expect(settingDefaultValue('min_answers')).toBe('');
    expect(settingDefaultValue('number_tolerance')).toBe('');
  });

  it('reads from the quiz-wide table when passed QUIZ_SETTING_RULES', () => {
    expect(settingDefaultValue('timer_mode', QUIZ_SETTING_RULES)).toBe('off');
    expect(settingDefaultValue('shuffle_questions', QUIZ_SETTING_RULES)).toBe('true');
    expect(settingDefaultValue('points_to_win', QUIZ_SETTING_RULES)).toBe('');
  });

  it('returns an empty string for an unknown key', () => {
    expect(settingDefaultValue('not_a_real_key')).toBe('');
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

  it('parses a compact variant header line for pick_one and pick_many', () => {
    for (const variant of ['pick_one', 'pick_many']) {
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

  it('rejects more than one correct option on a pick_one question', () => {
    const source = ['pick_one: Pick one', '{', '=a', '=b', '~c', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /pick_one.*requires exactly one/.test(e.message))).toBe(true);
  });

  it('allows exactly one correct option on a pick_one question', () => {
    const source = ['pick_one: Pick one', '{', '=a', '~b', '~c', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
  });

  it('allows any number of correct options on a pick_many question', () => {
    const source = ['pick_many: Pick some', '{', '=a', '=b', '~c', '}'].join('\n');
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
    const source = ['type_answer: Capital of France?', '{', '=Paris', '~Paris', '}'].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options.every((o) => o.correct)).toBe(true);
  });

  it('rejects an image/video option on a typed question', () => {
    const source = ['type_answer: pick', '{', '=![alt](url)', '}'].join('\n');
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

  it('errors when number_tolerance and typo_tolerance are both set', () => {
    const source = [
      'type_answer: q',
      '{',
      '=a',
      '}',
      ':number_tolerance=1',
      ':typo_tolerance=10'
    ].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /can't set both/.test(e.message))).toBe(true);
  });

  it('errors when a typed-only setting is used on a non-typed question', () => {
    const source = ['Question', '{', '=a', '~b', '}', ':match_case=true'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /only applies to type_answer/.test(e.message))).toBe(true);
  });

  it('errors when a choice-only setting is used on a typed question', () => {
    const source = ['type_answer: q', '{', '=a', '}', ':shuffle_options=true'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /only applies to pick_one\/pick_many/.test(e.message))).toBe(true);
  });

  it('rejects min_answers/max_answers/partial_credit on a pick_one question — it can never have "some but not all" or "more than one" selected', () => {
    const minSource = ['pick_one: q', '{', '=a', '~b', '}', ':min_answers=1'].join('\n');
    expect(
      parseQuizScriptQuestion(minSource).errors.some((e) =>
        /only applies to pick_many\/type_answer/.test(e.message)
      )
    ).toBe(true);

    const maxSource = ['pick_one: q', '{', '=a', '~b', '}', ':max_answers=1'].join('\n');
    expect(
      parseQuizScriptQuestion(maxSource).errors.some((e) =>
        /only applies to pick_many\/type_answer/.test(e.message)
      )
    ).toBe(true);

    const partialSource = ['pick_one: q', '{', '=a', '~b', '}', ':partial_credit=true'].join('\n');
    expect(
      parseQuizScriptQuestion(partialSource).errors.some((e) =>
        /only applies to pick_many\/type_answer/.test(e.message)
      )
    ).toBe(true);
  });

  it('errors when max_answers is below the number of correct options without partial_credit', () => {
    const source = ['Question', '{', '=a', '=b', '~c', '}', ':max_answers=1'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /exact match is impossible/.test(e.message))).toBe(true);
  });

  it('allows max_answers below correct-option count when partial_credit is set', () => {
    const source = [
      'Question',
      '{',
      '=a',
      '=b',
      '~c',
      '}',
      ':max_answers=1',
      ':partial_credit=true'
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

  it('parses a question-level post-answer analysis line alongside media', () => {
    const source = [
      'Question',
      '!<analysis>[Why?](Water boils at 100C at sea level.)',
      '{',
      '=hat',
      '~dog',
      '}'
    ].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.analysis).toEqual({
      label: 'Why?',
      content: 'Water boils at 100C at sea level.'
    });
  });

  it('errors on a second "!<analysis>" line', () => {
    const source = [
      'Question',
      '!<analysis>[Why?](first)',
      '!<analysis>[Why again?](second)',
      '{',
      '=a',
      '~b',
      '}'
    ].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(question.analysis).toEqual({ label: 'Why?', content: 'first' });
    expect(errors.some((e) => /only have one "!<analysis>"/.test(e.message))).toBe(true);
  });

  it('escapes a question-text line that would otherwise be read as an analysis line', () => {
    const question: QuizScriptQuestion = {
      variant: 'question',
      text: '!<analysis>[not really](an analysis line)',
      media: [],
      options: [
        { content: { kind: 'text', text: 'a' }, correct: true },
        { content: { kind: 'text', text: 'b' }, correct: false }
      ],
      extras: [],
      settings: {}
    };
    const serialized = serializeQuizScriptQuestion(question);
    const { question: reparsed, errors } = parseQuizScriptQuestion(serialized);
    expect(errors).toEqual([]);
    expect(reparsed.text).toBe(question.text);
    expect(reparsed.analysis).toBeUndefined();
  });
});

describe('order parsing', () => {
  it('forces every option correct: true regardless of marker', () => {
    const source = ['order_items: Arrange chronologically', '{', '=First', '~Second', '}'].join(
      '\n'
    );
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options.every((o) => o.correct)).toBe(true);
  });

  it('errors when fewer than 2 items are given', () => {
    const source = ['order_items: Arrange', '{', '=Only one', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /needs at least 2 items/.test(e.message))).toBe(true);
  });

  it('allows image/video items, unlike typed/guess_letters', () => {
    const source = [
      'order_items: Arrange',
      '{',
      '=![first](https://example.com/1.png)',
      '=![second](https://example.com/2.png)',
      '}'
    ].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options[0].content).toEqual({
      kind: 'image',
      alt: 'first',
      url: 'https://example.com/1.png'
    });
  });
});

describe('match/group_items parsing', () => {
  it('parses "item -> target" pairs for match', () => {
    const source = [
      'match_pairs: Match capitals',
      '{',
      '=Paris -> France',
      '=Tokyo -> Japan',
      '}'
    ].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options).toEqual([
      {
        content: { kind: 'text', text: 'Paris' },
        correct: true,
        target: { kind: 'text', text: 'France' }
      },
      {
        content: { kind: 'text', text: 'Tokyo' },
        correct: true,
        target: { kind: 'text', text: 'Japan' }
      }
    ]);
  });

  it('group_items allows several items to share one target/bucket', () => {
    const source = [
      'group_items: Sort animals',
      '{',
      '=Fish -> Water',
      '=Frog -> Water',
      '=Lion -> Land',
      '}'
    ].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options.map((o) => optionTargetText(o))).toEqual(['Water', 'Water', 'Land']);
  });

  it('parses a picture on either side of the pairing', () => {
    const source = [
      'match_pairs: Match the landmark to its city',
      '{',
      '=![Eiffel Tower](eiffel.png) -> Paris',
      '=Colosseum -> ![Rome skyline](rome.png)',
      '}'
    ].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options[0].content).toEqual({
      kind: 'image',
      alt: 'Eiffel Tower',
      url: 'eiffel.png'
    });
    expect(question.options[0].target).toEqual({ kind: 'text', text: 'Paris' });
    expect(question.options[1].content).toEqual({ kind: 'text', text: 'Colosseum' });
    expect(question.options[1].target).toEqual({
      kind: 'image',
      alt: 'Rome skyline',
      url: 'rome.png'
    });
    // Round-trips: the `-> ` split has to survive re-serialization for either half to be editable
    // in form mode and then saved back.
    expect(serializeQuizScriptQuestion(question)).toBe(source);
  });

  it('allows a picture ITEM in group_items but not a picture bucket', () => {
    const ok = parseQuizScriptQuestion(
      ['group_items: Sort', '{', '=![A trout](trout.png) -> Water', '=Lion -> Land', '}'].join('\n')
    );
    expect(ok.errors).toEqual([]);
    expect(ok.question.options[0].content).toEqual({
      kind: 'image',
      alt: 'A trout',
      url: 'trout.png'
    });

    const bad = parseQuizScriptQuestion(
      ['group_items: Sort', '{', '=Trout -> ![Water](water.png)', '=Lion -> Land', '}'].join('\n')
    );
    expect(bad.errors[0].message).toContain('"group_items" buckets must be plain text');
  });

  it('tells two pictureless match targets apart by url, not by their shared empty alt', () => {
    const { errors } = parseQuizScriptQuestion(
      ['match_pairs: q', '{', '=A -> ![](one.png)', '=B -> ![](two.png)', '}'].join('\n')
    );
    expect(errors).toEqual([]);
  });

  it('errors when match targets are not unique', () => {
    const source = ['match_pairs: q', '{', '=A -> X', '=B -> X', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /targets must be unique/.test(e.message))).toBe(true);
  });

  it('does not error when group_items targets repeat', () => {
    const source = ['group_items: q', '{', '=A -> X', '=B -> X', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
  });

  it('errors when an option is missing its "-> target"', () => {
    const source = ['match_pairs: q', '{', '=A -> X', '=B', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /needs a "-> target" pairing/.test(e.message))).toBe(true);
  });

  it('errors when fewer than 2 items are given', () => {
    const source = ['match_pairs: q', '{', '=A -> X', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /needs at least 2 items/.test(e.message))).toBe(true);
  });
});

describe('fill_blanks parsing', () => {
  it('maps correct options to blanks in order and incorrect ones become bank distractors', () => {
    const source = [
      'fill_blanks: The ___ is the powerhouse of the ___.',
      '{',
      '=mitochondria',
      '=cell',
      '~nucleus',
      '}'
    ].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options.map((o) => [o.content, o.correct])).toEqual([
      [{ kind: 'text', text: 'mitochondria' }, true],
      [{ kind: 'text', text: 'cell' }, true],
      [{ kind: 'text', text: 'nucleus' }, false]
    ]);
  });

  it('errors when there are no "___" blanks', () => {
    const source = ['fill_blanks: No blanks here', '{', '=word', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /at least one "___" blank/.test(e.message))).toBe(true);
  });

  it('errors when the blank count and correct-answer count disagree', () => {
    const source = ['fill_blanks: One ___ blank', '{', '=a', '=b', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /1 blank\(s\).*2 correct/.test(e.message))).toBe(true);
  });
});

describe('guess_letters parsing', () => {
  it('parses bracket pre-reveal markers and strips them from the option text', () => {
    const source = ['guess_letters: word', '{', '=[P]a[r]is', '}'].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options[0]).toEqual({
      content: { kind: 'text', text: 'Paris' },
      correct: true,
      prerevealed: [0, 2]
    });
  });

  it('forces every option correct: true regardless of its marker, same as typed', () => {
    const source = ['guess_letters: word', '{', '~paris', '}'].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options[0].correct).toBe(true);
  });

  it('rejects an image/video option, same as typed', () => {
    const source = ['guess_letters: pick', '{', '=![alt](url)', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /plain text/.test(e.message))).toBe(true);
  });

  it('rejects more than one accepted answer — the guess mechanic is one fixed board', () => {
    const source = ['guess_letters: word', '{', '=paris', '~london', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(
      errors.some((e) => /"guess_letters" allows exactly one accepted answer/.test(e.message))
    ).toBe(true);
  });

  it('allows exactly one accepted answer', () => {
    const source = ['guess_letters: word', '{', '=paris', '}'].join('\n');
    expect(parseQuizScriptQuestion(source).errors).toEqual([]);
  });

  it('accepts its own settings (letter_bank, letter_reveal, letters_shown_at_start, letter_bank_chars)', () => {
    const source = [
      'guess_letters: word',
      '{',
      '=cat',
      '}',
      ':letter_bank=fixed',
      ':letter_bank_chars=catxyz',
      ':letter_reveal=sequence',
      ':letters_shown_at_start=1'
    ].join('\n');
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.settings).toEqual({
      letter_bank: 'fixed',
      letter_bank_chars: 'catxyz',
      letter_reveal: 'sequence',
      letters_shown_at_start: 1
    });
  });

  it('rejects a guess_letters-only setting on another variant', () => {
    const source = ['pick_many: q', '{', '=a', '~b', '}', ':letter_bank=alphabet'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /only applies to guess_letters/.test(e.message))).toBe(true);
  });

  it('match_case applies to typed only, not guess_letters — a bank guess has no case to compare', () => {
    const typedSource = ['type_answer: q', '{', '=a', '}', ':match_case=true'].join('\n');
    expect(parseQuizScriptQuestion(typedSource).errors).toEqual([]);

    const ciSource = ['guess_letters: q', '{', '=a', '}', ':match_case=true'].join('\n');
    expect(
      parseQuizScriptQuestion(ciSource).errors.some((e) =>
        /only applies to type_answer/.test(e.message)
      )
    ).toBe(true);
  });
});

describe('setting interactions', () => {
  it('letter_bank=fixed with no letter_bank_chars is a parse error (would produce an empty, unplayable bank)', () => {
    const source = ['guess_letters: q', '{', '=cat', '}', ':letter_bank=fixed'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(
      errors.some((e) => /letter_bank=fixed.*requires.*letter_bank_chars/.test(e.message))
    ).toBe(true);
  });

  it('letter_bank=fixed with only non-letter characters is also a parse error', () => {
    const source = [
      'guess_letters: q',
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
      'guess_letters: q',
      '{',
      '=cat',
      '}',
      ':letter_bank=fixed',
      ':letter_bank_chars=c'
    ].join('\n');
    expect(parseQuizScriptQuestion(source).errors).toEqual([]);
  });

  it("points_to_win and percent_to_win can't both be set on the same quiz", () => {
    // points_to_win always wins (see gradeRun) — setting both silently drops the percentage one,
    // which is worth flagging the same way number_tolerance/typo_tolerance's conflict is.
    const source = ['---', 'title: T', ':points_to_win=10', ':percent_to_win=90', '---'].join('\n');
    const { errors } = parseQuizScriptFrontmatter(source);
    expect(errors.some((e) => /can't both be set/.test(e.message))).toBe(true);
  });

  it('points_to_win alone, or percent_to_win alone, is fine', () => {
    expect(
      parseQuizScriptFrontmatter(['---', 'title: T', ':points_to_win=10', '---'].join('\n')).errors
    ).toEqual([]);
    expect(
      parseQuizScriptFrontmatter(['---', 'title: T', ':percent_to_win=90', '---'].join('\n')).errors
    ).toEqual([]);
  });

  it('timer_mode=per_question or per_quiz requires timer_seconds', () => {
    for (const mode of ['per_question', 'per_quiz']) {
      const source = ['---', 'title: T', `:timer_mode=${mode}`, '---'].join('\n');
      expect(
        parseQuizScriptFrontmatter(source).errors.some((e) =>
          /"timer_seconds" is required/.test(e.message)
        )
      ).toBe(true);
    }
  });

  it('timer_mode=per_quiz with timer_seconds is fine regardless of reveal_answers/reveal_scores', () => {
    const source = [
      '---',
      'title: T',
      ':timer_mode=per_quiz',
      ':timer_seconds=60',
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
      ':timer_seconds=30',
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
    const source = ['---', 'title: T', ':timer_mode=per_question', ':timer_seconds=30', '---'].join(
      '\n'
    );
    expect(parseQuizScriptFrontmatter(source).errors).toEqual([]);
  });

  it('reveal_screen_seconds requires show_reveal_screen to not be false', () => {
    const source = [
      '---',
      'title: T',
      ':reveal_screen_seconds=5',
      ':show_reveal_screen=false',
      '---'
    ].join('\n');
    expect(
      parseQuizScriptFrontmatter(source).errors.some((e) =>
        /"reveal_screen_seconds" can't be set/.test(e.message)
      )
    ).toBe(true);
  });

  it('reveal_screen_seconds alone (show_reveal_screen defaulting true) is fine', () => {
    const source = ['---', 'title: T', ':reveal_screen_seconds=5', '---'].join('\n');
    expect(parseQuizScriptFrontmatter(source).errors).toEqual([]);
  });
});

describe('serializeQuizScriptQuestion round-trips through parseQuizScriptQuestion', () => {
  const cases = [
    [
      'plain question (defaults to multi-select)',
      ['What is H2O?', '{', '=Water', '~Salt', '}'].join('\n')
    ],
    ['pick_one header', ['pick_one: What is H2O?', '{', '=Water', '~Salt', '}'].join('\n')],
    [
      'pick_many header',
      ['pick_many: Pick some', '{', '=Water', '=Steam', '~Salt', '}'].join('\n')
    ],
    [
      'typed with settings',
      ['type_answer: Capital of France?', '{', '=Paris', '}', ':typo_tolerance=15'].join('\n')
    ],
    [
      'guess_letters with bracket pre-reveal and settings',
      [
        'guess_letters: Capital of France?',
        '{',
        '=[P]a[r]is',
        '}',
        ':letter_bank=alphabet',
        ':letter_reveal=sequence',
        ':points_wrong=-1'
      ].join('\n')
    ],
    ['weighted options', ['Pick', '{', '=Four %4%', '~Five %-1%', '}'].join('\n')],
    [
      'with post-answer analysis',
      [
        'What is H2O?',
        '!<analysis>[Why?](Two hydrogen atoms bond with one oxygen atom.)',
        '{',
        '=Water',
        '~Salt',
        '}'
      ].join('\n')
    ],
    [
      'order_items',
      ['order_items: Arrange chronologically', '{', '=First', '=Second', '=Third', '}'].join('\n')
    ],
    [
      'match with weighted pairs',
      ['match_pairs: Match capitals', '{', '=Paris -> France %2%', '=Tokyo -> Japan', '}'].join(
        '\n'
      )
    ],
    [
      'group_items with shared buckets',
      [
        'group_items: Sort animals',
        '{',
        '=Fish -> Water',
        '=Frog -> Water',
        '=Lion -> Land',
        '}'
      ].join('\n')
    ],
    [
      'fill_blanks with distractors',
      [
        'fill_blanks: The ___ is the powerhouse of the ___.',
        '{',
        '=mitochondria',
        '=cell',
        '~nucleus',
        '}'
      ].join('\n')
    ]
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
      ':questions_per_run=5',
      '---'
    ].join('\n');
    const { frontmatter, errors } = parseQuizScriptFrontmatter(source);
    expect(errors).toEqual([]);
    expect(frontmatter).toEqual({
      title: 'Geography',
      description: 'A quiz about the world',
      category: 'geography',
      tags: ['easy', 'fun'],
      settings: { questions_per_run: 5 }
    });
  });

  it('errors when the block does not start with "---"', () => {
    const { errors } = parseQuizScriptFrontmatter('title: Geography\n---');
    expect(errors.some((e) => /must start with/.test(e.message))).toBe(true);
  });

  describe('the theme fields', () => {
    const withTheme = (...body: string[]) => ['---', 'title: Geography', ...body, '---'].join('\n');

    it('reads the preset name off a single line', () => {
      const { frontmatter, errors } = parseQuizScriptFrontmatter(withTheme('theme: arcade'));
      expect(errors).toEqual([]);
      expect(frontmatter.themePreset).toBe('arcade');
      expect(frontmatter.themeCss).toBeUndefined();
    });

    it('accepts a preset name it does not recognize', () => {
      // A quiz naming a preset from a newer Qwiz has to open, unstyled, rather than refuse — the
      // format can't know what a future release ships.
      const { frontmatter, errors } = parseQuizScriptFrontmatter(
        withTheme('theme: from-the-future')
      );
      expect(errors).toEqual([]);
      expect(frontmatter.themePreset).toBe('from-the-future');
    });

    it('reads the indented css beneath theme-css, dedented', () => {
      const { frontmatter, errors } = parseQuizScriptFrontmatter(
        withTheme('theme-css:', '  .qwiz-option {', '    border-radius: 999px;', '  }')
      );
      expect(errors).toEqual([]);
      expect(frontmatter.themeCss).toBe('.qwiz-option {\n  border-radius: 999px;\n}');
    });

    it('carries both at once', () => {
      const { frontmatter } = parseQuizScriptFrontmatter(
        withTheme('theme: arcade', 'theme-css:', '  .qwiz-title { font-size: 3rem; }')
      );
      expect(frontmatter.themePreset).toBe('arcade');
      expect(frontmatter.themeCss).toBe('.qwiz-title { font-size: 3rem; }');
    });

    it('keeps blank lines inside the block, which css uses between rules', () => {
      const { frontmatter } = parseQuizScriptFrontmatter(
        withTheme('theme-css:', '  .a { color: red; }', '', '  .b { color: blue; }')
      );
      expect(frontmatter.themeCss).toBe('.a { color: red; }\n\n.b { color: blue; }');
    });

    it('ends at the first unindented line, so fields after it still parse', () => {
      const source = [
        '---',
        'theme-css:',
        '  .qwiz-option { color: red; }',
        'category: geography',
        'tags: [a]',
        '---'
      ].join('\n');
      const { frontmatter, errors } = parseQuizScriptFrontmatter(source);
      expect(errors).toEqual([]);
      expect(frontmatter.themeCss).toBe('.qwiz-option { color: red; }');
      expect(frontmatter.category).toBe('geography');
      expect(frontmatter.tags).toEqual(['a']);
    });

    // The reason the closing fence has to be unindented. A rule of dashes inside a CSS comment is
    // ordinary formatting, and matching the trimmed line would have closed the frontmatter here —
    // turning the rest of the stylesheet into "questions" and the real fence into a parse error.
    it('is not closed early by a line of dashes inside a css comment', () => {
      const { frontmatter, errors } = parseQuizScriptFrontmatter(
        withTheme('theme-css:', '  /* my look', '  --- */', '  .qwiz-title { color: #fff; }')
      );
      expect(errors).toEqual([]);
      expect(frontmatter.themeCss).toContain('--- */');
      expect(frontmatter.themeCss).toContain('#fff');
    });

    it('errors when nothing is indented beneath theme-css', () => {
      const { errors } = parseQuizScriptFrontmatter(
        ['---', 'title: Q', 'theme-css:', 'category: geography', '---'].join('\n')
      );
      expect(errors.some((e) => /no indented CSS/.test(e.message))).toBe(true);
    });

    it('are absent, not empty, on a quiz that carries no look', () => {
      const { frontmatter } = parseQuizScriptFrontmatter(['---', 'title: Q', '---'].join('\n'));
      expect(frontmatter.themePreset).toBeUndefined();
      expect(frontmatter.themeCss).toBeUndefined();
    });

    it('round-trips through serialize and back, unchanged', () => {
      const themeCss = '.qwiz-option {\n  border-radius: 999px;\n}\n\n.qwiz-title { color: #fff; }';
      const source = serializeQuizScriptFrontmatter({
        title: 'Geography',
        description: '',
        category: '',
        tags: [],
        settings: {},
        themePreset: 'arcade',
        themeCss
      });
      const { frontmatter, errors } = parseQuizScriptFrontmatter(source);
      expect(errors).toEqual([]);
      expect(frontmatter.themePreset).toBe('arcade');
      expect(frontmatter.themeCss).toBe(themeCss);
    });

    it('writes nothing for an absent or blank look', () => {
      const base = { title: 'Q', description: '', category: '', tags: [], settings: {} };
      expect(serializeQuizScriptFrontmatter(base)).not.toContain('theme');
      expect(
        serializeQuizScriptFrontmatter({ ...base, themePreset: '  ', themeCss: '   ' })
      ).not.toContain('theme');
    });
  });

  it('errors when show_reveal_screen=false conflicts with the default reveal_answers', () => {
    const source = ['---', 'title: Q', ':show_reveal_screen=false', '---'].join('\n');
    const { errors } = parseQuizScriptFrontmatter(source);
    expect(errors.some((e) => /show_reveal_screen/.test(e.message))).toBe(true);
  });

  it('round-trips through serializeQuizScriptFrontmatter', () => {
    const source = [
      '---',
      'title: Geography',
      'description: A quiz about the world',
      'category: geography',
      'tags: [easy, fun]',
      ':questions_per_run=5',
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
      'type_answer: What is 2+2?',
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

describe('resolveQuestionSettings (quiz-wide defaults)', () => {
  function question(overrides: Partial<QuizScriptQuestion> = {}): QuizScriptQuestion {
    return {
      variant: 'pick_many',
      text: 'q',
      media: [],
      options: [],
      extras: [],
      settings: {},
      ...overrides
    };
  }

  it('inherits a quiz-wide default onto a question that does not set it', () => {
    const resolved = resolveQuestionSettings(question(), { shuffle_options: true });
    expect(resolved.shuffle_options).toBe(true);
  });

  it("the question's own value always wins over the quiz-wide one", () => {
    const resolved = resolveQuestionSettings(question({ settings: { shuffle_options: false } }), {
      shuffle_options: true
    });
    expect(resolved.shuffle_options).toBe(false);
  });

  it('ignores quiz-only settings, which are not per-question defaults at all', () => {
    const resolved = resolveQuestionSettings(question(), {
      points_to_win: 10,
      timer_mode: 'per_quiz'
    });
    expect(resolved).toEqual({});
  });

  it('only inherits a setting that applies to this variant', () => {
    // letter_bank is guess_letters-only: it reaches that variant and no other, so a quiz can set
    // it once without it landing on questions that would have rejected it if authored directly.
    const quizWide = { letter_bank: 'auto' };
    expect(resolveQuestionSettings(question({ variant: 'guess_letters' }), quizWide)).toEqual({
      letter_bank: 'auto'
    });
    expect(resolveQuestionSettings(question({ variant: 'type_answer' }), quizWide)).toEqual({});
  });

  it('does not inherit the per-question-only counts, which mean nothing quiz-wide', () => {
    const resolved = resolveQuestionSettings(question(), { min_answers: 2, max_answers: 3 });
    expect(resolved).toEqual({});
  });

  it('accepts an inheritable key in the frontmatter, and still rejects a per-question-only one', () => {
    expect(validateSettingValue('shuffle_options', 'true', QUIZ_FRONTMATTER_RULES)).toEqual({
      value: true
    });
    expect(validateSettingValue('max_answers', '2', QUIZ_FRONTMATTER_RULES).error).toMatch(
      /not a recognized setting/
    );
  });

  it('parses inheritable settings out of a real frontmatter block', () => {
    const source = [
      '---',
      'title: T',
      ':shuffle_options=true',
      ':points_correct=3',
      '---',
      '',
      'q',
      '{',
      '=a',
      '}'
    ].join('\n');
    const { frontmatter, errors } = parseQwizFile(source);
    expect(errors).toEqual([]);
    expect(frontmatter.settings).toEqual({ shuffle_options: true, points_correct: 3 });
  });
});

describe('type_pattern parsing', () => {
  it('keeps the =/~ markers instead of forcing every option correct', () => {
    const source = ['type_pattern: Any four-digit year', '{', '=[0-9]{4}', '~19[0-9]{2}', '}'].join(
      '\n'
    );
    const { question, errors } = parseQuizScriptQuestion(source);
    expect(errors).toEqual([]);
    expect(question.options.map((o) => o.correct)).toEqual([true, false]);
  });

  it('rejects a pattern that is not a valid regular expression', () => {
    const source = ['type_pattern: q', '{', '=(unclosed', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /isn't a valid regular expression/.test(e.message))).toBe(true);
  });

  it('rejects a question with no correct pattern — nothing could ever be right', () => {
    const source = ['type_pattern: q', '{', '~[0-9]+', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /at least one "=" pattern/.test(e.message))).toBe(true);
  });

  it('rejects an image/video pattern', () => {
    const source = ['type_pattern: q', '{', '=![a](https://x/y.png)', '}'].join('\n');
    const { errors } = parseQuizScriptQuestion(source);
    expect(errors.some((e) => /must be plain text/.test(e.message))).toBe(true);
  });

  it('round-trips through serialize + parse with its markers intact', () => {
    const source = ['type_pattern: q', '{', '=a+', '~b+', '}'].join('\n');
    const first = parseQuizScriptQuestion(source);
    expect(first.errors).toEqual([]);
    const second = parseQuizScriptQuestion(serializeQuizScriptQuestion(first.question));
    expect(second.errors).toEqual([]);
    expect(second.question).toEqual(first.question);
  });

  it('only offers settings that mean something for a regex answer', () => {
    const keys = suggestedSettingKeysForVariant('type_pattern');
    expect(keys).toContain('match_case');
    expect(keys).toContain('points_correct');
    // Fuzzy/numeric matching and the character-box display have nothing to act on here.
    expect(keys).not.toContain('typo_tolerance');
    expect(keys).not.toContain('number_tolerance');
    expect(keys).not.toContain('typed_input');
  });
});
