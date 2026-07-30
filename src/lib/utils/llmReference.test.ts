import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuizScriptQuestion, parseQwizFile } from './quizScript';

// docs/llm-reference.md is written to be pasted to a model as the whole specification of the
// format, so a wrong example there produces wrong output at scale and silently. Every example in it
// that claims to be complete is parsed here:
//
//   ```qwiz            — a whole file, frontmatter included
//   ```qwiz-question   — one question block
//
// Deliberately-partial snippets (placeholders like `<variant>`, bare option blocks, single media
// lines) are left untagged and skipped. This is exactly the check that would have caught the
// `!<hint>` tag, which parses without error and quietly becomes question text.
const REFERENCE = 'docs/llm-reference.md';

function blocks(tag: string): string[] {
  const source = readFileSync(REFERENCE, 'utf8');
  const found: string[] = [];
  const pattern = new RegExp(`^\`\`\`${tag}\\n([\\s\\S]*?)^\`\`\`$`, 'gm');
  for (const match of source.matchAll(pattern)) found.push(match[1]);
  return found;
}

const files = blocks('qwiz');
const questions = blocks('qwiz-question');

describe('docs/llm-reference.md examples', () => {
  it('has whole-file and single-question examples to check', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(questions.length).toBeGreaterThan(0);
  });

  it.each(files.map((code, i) => [i + 1, code] as const))(
    'whole-file example %i parses cleanly',
    (_i, code) => {
      const { questionCodes, errors } = parseQwizFile(code);
      expect(errors).toEqual([]);
      expect(questionCodes.length).toBeGreaterThan(0);
      for (const question of questionCodes) {
        const parsed = parseQuizScriptQuestion(question);
        expect(parsed.errors).toEqual([]);
        expect(parsed.question.text).not.toMatch(/!</);
      }
    }
  );

  it.each(questions.map((code, i) => [i + 1, code] as const))(
    'question example %i parses cleanly',
    (_i, code) => {
      const parsed = parseQuizScriptQuestion(code);
      expect(parsed.errors).toEqual([]);
      expect(parsed.question.options.length).toBeGreaterThan(0);
      expect(parsed.question.text).not.toMatch(/!</);
    }
  );

  it('documents every variant the parser accepts', () => {
    const source = readFileSync(REFERENCE, 'utf8');
    for (const variant of [
      'single_choice',
      'multiple_choice',
      'typed',
      'character_input',
      'order',
      'match',
      'categorise',
      'fill_in_blanks'
    ]) {
      expect(source, `${variant} is missing from the reference`).toContain(`### \`${variant}\``);
    }
  });
});
