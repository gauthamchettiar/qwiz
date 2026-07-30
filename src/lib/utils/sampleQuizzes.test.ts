import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuizScriptQuestion, parseQwizFile } from './quizScript';

// Reads the real files in examples/ rather than the app's `import.meta.glob` view of them, so this
// is a check on the documents themselves: they're offered from the Import dialog as the first thing
// a new author ever sees, and one that doesn't parse would present the format as broken. Anything
// added to examples/ is covered automatically.
const EXAMPLES_DIR = 'examples';
const files = readdirSync(EXAMPLES_DIR)
  .filter((name) => name.endsWith('.qwiz'))
  .sort();

describe('examples/*.qwiz', () => {
  it('there are examples to load at all', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s parses with no errors and has usable metadata', (name) => {
    const source = readFileSync(`${EXAMPLES_DIR}/${name}`, 'utf8');
    const { frontmatter, questionCodes, errors } = parseQwizFile(source);

    expect(errors).toEqual([]);
    expect(questionCodes.length).toBeGreaterThan(0);
    // The dialog lists these two, so an example without them shows up as a blank row.
    expect(frontmatter.title.trim()).not.toBe('');
    expect(frontmatter.description.trim()).not.toBe('');

    for (const [index, code] of questionCodes.entries()) {
      const parsed = parseQuizScriptQuestion(code);
      expect(
        parsed.errors,
        `${name} question ${index + 1}: ${JSON.stringify(parsed.errors)}`
      ).toEqual([]);

      // A media or extra line the parser doesn't recognise isn't an error — it's just more question
      // text, silently. That's how a whole set of examples ended up with `!<hint>` lines (the real
      // tag is `!<reveal>`) that parsed perfectly and displayed as literal gibberish in the question.
      // Nothing beginning `!<` is ever meant to survive into the text.
      expect(
        parsed.question.text,
        `${name} question ${index + 1} has an unrecognised !<...> line, absorbed as question text`
      ).not.toMatch(/!</);
    }
  });
});
