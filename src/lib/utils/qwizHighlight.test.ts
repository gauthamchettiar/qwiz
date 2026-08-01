import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { highlightQwiz, TOKEN_CLASS, type Token } from './qwizHighlight';

const text = (tokens: Token[]) => tokens.map((t) => t.text).join('');
const kinds = (tokens: Token[]) => tokens.map((t) => t.kind);

describe('the concatenation invariant', () => {
  // The one property the overlay depends on: rendered tokens must occupy exactly the same
  // characters as the textarea beneath them, or the caret drifts away from the text under it.
  it('reproduces every line of every example file exactly', () => {
    for (const file of readdirSync('examples').filter((f) => f.endsWith('.qwiz'))) {
      const source = readFileSync(`examples/${file}`, 'utf8');
      const lines = source.split('\n');
      const highlighted = highlightQwiz(source);
      expect(highlighted).toHaveLength(lines.length);
      highlighted.forEach((tokens, i) => {
        expect(text(tokens), `${file} line ${i + 1}`).toBe(lines[i]);
      });
    }
  });

  it('holds for half-typed source, which is what an editor mostly contains', () => {
    for (const line of ['!<reveal>[Hint](', '=Paris ->', ':points_correct=', 'pick_one:', '~']) {
      expect(text(highlightQwiz(line)[0])).toBe(line);
    }
  });

  it('preserves trailing and leading whitespace', () => {
    expect(text(highlightQwiz('  =Paris  ')[0])).toBe('  =Paris  ');
  });
});

describe('classification', () => {
  it('marks a variant header, its prompt and the block punctuation', () => {
    const [header, brace] = highlightQwiz('pick_one: Which bird?\n{');
    expect(kinds(header)).toEqual(['variant', 'punctuation', 'prompt']);
    expect(kinds(brace)).toEqual(['punctuation']);
  });

  it('splits an option into marker, text and weight', () => {
    expect(kinds(highlightQwiz('=Starlings %2%')[0])).toEqual(['marker', 'plain', 'weight']);
  });

  it('splits a pairing into item, arrow and target', () => {
    expect(kinds(highlightQwiz('=Paris -> France')[0])).toEqual([
      'marker',
      'plain',
      'punctuation',
      'target'
    ]);
  });

  it('splits a setting into key and value', () => {
    expect(kinds(highlightQwiz(':points_correct=2')[0])).toEqual([
      'settingKey',
      'punctuation',
      'settingValue'
    ]);
  });

  it('splits media into tag, label and url', () => {
    expect(kinds(highlightQwiz('![A flag](x.png)')[0])).toEqual([
      'tag',
      'punctuation',
      'label',
      'punctuation',
      'punctuation',
      'url',
      'punctuation'
    ]);
  });

  it('treats a variant-looking line inside an option block as an option, not a header', () => {
    // `pick_one: x` between braces is option text; only outside one does it start a question.
    const lines = highlightQwiz('pick_one: q\n{\n=pick_one: not a header\n}');
    expect(kinds(lines[0])[0]).toBe('variant');
    expect(kinds(lines[2])[0]).toBe('marker');
  });

  it('reads frontmatter keys differently from question lines', () => {
    const lines = highlightQwiz('---\ntitle: My Quiz\n---\npick_one: q');
    expect(kinds(lines[1])).toEqual(['frontmatterKey', 'punctuation', 'settingValue']);
    expect(kinds(lines[3])[0]).toBe('variant');
  });
});

describe('TOKEN_CLASS', () => {
  it('styles every kind the tokenizer can emit', () => {
    const emitted = new Set<string>();
    for (const file of readdirSync('examples').filter((f) => f.endsWith('.qwiz'))) {
      for (const line of highlightQwiz(readFileSync(`examples/${file}`, 'utf8'))) {
        for (const t of line) emitted.add(t.kind);
      }
    }
    for (const kind of emitted) expect(TOKEN_CLASS[kind as keyof typeof TOKEN_CLASS]).toBeTruthy();
  });

  it('names only semantic colour tokens, never a palette shade', () => {
    // Same rule as the rest of the app (CLAUDE.md §5) — an editor must follow the active theme.
    for (const cls of Object.values(TOKEN_CLASS)) {
      expect(cls).not.toMatch(/\b(slate|indigo|green|red|amber)-\d+/);
    }
  });
});
