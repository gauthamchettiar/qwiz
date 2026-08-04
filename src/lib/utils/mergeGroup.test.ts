import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseQwizGroup } from './quizGroup';
import { parseQwizFile, parseQuizScriptQuestion } from './quizScript';
import {
  inlineQuizSettings,
  mergeGroupDocument,
  quizSettingsFrom,
  selectSources,
  type MergeSource
} from './mergeGroup';

function group(...frontmatter: string[]) {
  const { group: parsed, errors } = parseQwizGroup(
    ['---', ...frontmatter, '---', '', 'quiz: a.qwiz', '', 'quiz: b.qwiz'].join('\n')
  );
  expect(errors).toEqual([]);
  return parsed;
}

function source(id: string, title: string, ...lines: string[]): MergeSource {
  return { id, title, source: lines.join('\n') };
}

const QUIZ_A = source(
  'a',
  'Quiz A',
  '---',
  'title: Quiz A',
  '---',
  '',
  'What is 2 + 2?',
  '{',
  '=4',
  '~5',
  '}'
);

const QUIZ_B = source(
  'b',
  'Quiz B',
  '---',
  'title: Quiz B',
  '---',
  '',
  'type_answer: Capital of Italy?',
  '{',
  '=Rome',
  '}'
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mergeGroupDocument', () => {
  it('produces one document holding every question, which parses as a quiz', () => {
    const merged = mergeGroupDocument(group(':mode=merge', 'title: Mega'), [QUIZ_A, QUIZ_B]);

    expect(merged.errors).toEqual([]);
    const parsed = parseQwizFile(merged.source!);
    expect(parsed.errors).toEqual([]);
    expect(parsed.questionCodes).toHaveLength(2);
  });

  it('takes its title, description and rules from the group, not from any source quiz', () => {
    const merged = mergeGroupDocument(
      group(':mode=merge', 'title: Mega Quiz', 'description: All of it', ':points_to_win=3'),
      [QUIZ_A, QUIZ_B]
    );

    const { frontmatter } = parseQwizFile(merged.source!);
    expect(frontmatter.title).toBe('Mega Quiz');
    expect(frontmatter.description).toBe('All of it');
    expect(frontmatter.settings.points_to_win).toBe(3);
  });

  it('drops group-shape settings, which describe assembly rather than how the quiz plays', () => {
    const merged = mergeGroupDocument(group(':mode=shuffle', ':pick=1', ':questions_per_run=1'), [
      QUIZ_A
    ]);

    const { frontmatter } = parseQwizFile(merged.source!);
    expect(frontmatter.settings.questions_per_run).toBe(1);
    expect(frontmatter.settings.mode).toBeUndefined();
    expect(frontmatter.settings.pick).toBeUndefined();
  });

  it('skips a source that does not parse, and still merges the rest', () => {
    const broken = source(
      'x',
      'Broken One',
      '---',
      'title: Broken',
      '---',
      '',
      'pick_one: no options'
    );
    const merged = mergeGroupDocument(group(':mode=merge'), [QUIZ_A, broken, QUIZ_B]);

    expect(merged.skipped).toEqual(['Broken One']);
    expect(parseQwizFile(merged.source!).questionCodes).toHaveLength(2);
  });

  it('reports rather than producing an empty quiz when nothing could be read', () => {
    const broken = source('x', 'Broken', '---', 'title: B', '---', '', 'pick_one: no options');
    const merged = mergeGroupDocument(group(':mode=merge'), [broken]);

    expect(merged.source).toBeUndefined();
    expect(merged.errors.join()).toMatch(/None of this group's quizzes could be read: Broken/);
  });

  it('says so for a group with no sources at all', () => {
    const merged = mergeGroupDocument(group(':mode=merge'), []);
    expect(merged.errors.join()).toMatch(/doesn't have any questions/);
  });
});

describe('inlineQuizSettings — the subtlety that makes merging correct', () => {
  it("carries a source quiz's own inheritable settings down onto its questions", () => {
    // Without this, lifting questions out of a quiz that set :points_wrong=-1 across the board
    // would silently stop penalising wrong answers the moment it was merged.
    const penalised = source(
      'p',
      'Penalised',
      '---',
      'title: Penalised',
      ':points_wrong=-1',
      '---',
      '',
      'What is 2 + 2?',
      '{',
      '=4',
      '~5',
      '}'
    );

    const merged = mergeGroupDocument(group(':mode=merge'), [penalised]);
    const { questionCodes } = parseQwizFile(merged.source!);
    expect(parseQuizScriptQuestion(questionCodes[0]).question.settings.points_wrong).toBe(-1);
  });

  it('never overrides a setting the question already states itself', () => {
    const { frontmatter, questionCodes } = parseQwizFile(
      [
        '---',
        'title: T',
        ':points_correct=5',
        '---',
        '',
        'Q?',
        '{',
        '=A',
        '~B',
        '}',
        ':points_correct=2'
      ].join('\n')
    );
    const [code] = inlineQuizSettings(frontmatter, questionCodes);
    expect(parseQuizScriptQuestion(code).question.settings.points_correct).toBe(2);
  });

  it('never adds a setting the question variant would reject', () => {
    // `letter_bank` is guess_letters-only; pushing it onto a pick_one question would turn a valid
    // merged document into one the parser refuses.
    const { frontmatter, questionCodes } = parseQwizFile(
      ['---', 'title: T', ':letter_bank=alphabet', '---', '', 'Q?', '{', '=A', '~B', '}'].join('\n')
    );
    const [code] = inlineQuizSettings(frontmatter, questionCodes);
    expect(parseQuizScriptQuestion(code).errors).toEqual([]);
    expect(code).not.toContain('letter_bank');
  });

  it('re-quotes a string that would otherwise change type on the way back through', () => {
    const { frontmatter, questionCodes } = parseQwizFile(
      [
        '---',
        'title: T',
        ':letter_bank_chars="123"',
        '---',
        '',
        'guess_letters: Q?',
        '{',
        '=[A]bc',
        '}'
      ].join('\n')
    );
    const [code] = inlineQuizSettings(frontmatter, questionCodes);
    expect(parseQuizScriptQuestion(code).question.settings.letter_bank_chars).toBe('123');
  });

  it('leaves questions untouched when the source quiz sets nothing inheritable', () => {
    const { frontmatter, questionCodes } = parseQwizFile(
      ['---', 'title: T', '---', '', 'Q?', '{', '=A', '~B', '}'].join('\n')
    );
    expect(inlineQuizSettings(frontmatter, questionCodes)).toEqual(questionCodes);
  });
});

describe('quizSettingsFrom', () => {
  it('keeps quiz-wide keys and drops group-shape ones', () => {
    // `:pick` is legal only under shuffle — the parser rejects it anywhere else, which is why this
    // uses shuffle rather than merge to get a group-shape key into the settings at all.
    const settings = quizSettingsFrom(
      group(':mode=shuffle', ':pick=2', ':questions_per_run=5', ':shuffle_questions=false')
    );
    expect(settings).toEqual({ questions_per_run: 5, shuffle_questions: false });
  });
});

describe('selectSources', () => {
  it('takes every source, in order, for merge', () => {
    expect(selectSources(group(':mode=merge'), ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('draws :pick sources for shuffle', () => {
    const picked = selectSources(group(':mode=shuffle', ':pick=2'), ['a', 'b', 'c']);
    expect(picked).toHaveLength(2);
    expect(new Set(picked).size).toBe(2);
  });

  it('defaults shuffle to a single draw', () => {
    expect(selectSources(group(':mode=shuffle'), ['a', 'b', 'c'])).toHaveLength(1);
  });

  it('never asks for more than the group holds', () => {
    expect(selectSources(group(':mode=shuffle', ':pick=99'), ['a', 'b'])).toHaveLength(2);
  });

  it('actually randomises rather than always taking the first', () => {
    // Pinned to 0 so the assertion is about the selection, not about Math.random. A Fisher-Yates
    // pass with j=0 every time rotates the array, so the drawn item is provably not the first —
    // pinning to 0.99 would have made every swap a no-op and asserted nothing.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(selectSources(group(':mode=shuffle'), ['a', 'b', 'c'])).not.toEqual(['a']);
  });
});
