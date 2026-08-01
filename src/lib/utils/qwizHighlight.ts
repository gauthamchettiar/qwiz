/** Syntax highlighting for `.qwiz` source, as plain data — no DOM, no framework.
 *
 * The format is strictly line-oriented (see quizScript.ts), so this is a line tokenizer rather
 * than a parser: each line is classified on its own, with only two bits of carried context (are we
 * inside the `--- ---` frontmatter fence, and inside a `{ }` option block). That's deliberate —
 * highlighting has to work on source that doesn't parse yet, which is most of the time while
 * someone is typing, so it must never depend on the document being valid.
 *
 * **The concatenation invariant**: joining a line's token texts always reproduces the line exactly,
 * character for character. The rendered output is layered behind a transparent `<textarea>` and
 * has to occupy identical space; a tokenizer that dropped or normalized so much as a space would
 * drift the caret away from the text under it. `qwizHighlight.test.ts` asserts this over every
 * line of every example file rather than trusting it.
 */

export type TokenKind =
  | 'plain'
  | 'variant'
  | 'prompt'
  | 'punctuation'
  | 'marker'
  | 'weight'
  | 'target'
  | 'settingKey'
  | 'settingValue'
  | 'tag'
  | 'label'
  | 'url'
  | 'frontmatterKey';

export interface Token {
  text: string;
  kind: TokenKind;
}

/** Mirrors quizScript.ts's own line patterns. Kept as a separate, deliberately laxer set: those
 * decide what a line MEANS and are strict about it, while these decide what a line LOOKS like and
 * should still colour something half-typed. `!<reveal>[Hint](` with no closing paren is not a
 * valid reveal, but it's obviously a reveal being written, and colouring it as one is the point. */
const FENCE = /^---\s*$/;
const VARIANT_HEADER = /^([a-z_]+)(\s*:)(.*)$/;
const SETTING = /^(:)([A-Za-z_][\w-]*)(\s*=\s*)(.*)$/;
const FRONTMATTER = /^([A-Za-z_][\w-]*)(\s*:\s*)(.*)$/;
const MEDIA = /^(!(?:<[a-z]+>)?)(\[)([^\]]*)(\])(\()([^)]*)(\)?)(.*)$/;
const WEIGHT = /^(.*?)(\s*%-?\d+(?:\.\d+)?%)$/;
const TARGET = /^(.*?)(\s->\s)(.*)$/;

function push(tokens: Token[], text: string, kind: TokenKind): void {
  if (text !== '') tokens.push({ text, kind });
}

/** Splits an option's body into its text, an optional `-> target`, and an optional `%N%` weight —
 * the three parts that can follow a `=`/`~` marker. Media inside an option is handled first by
 * the caller, since `![alt](url) -> target` is both at once. */
function optionBody(body: string, tokens: Token[]): void {
  const weighted = WEIGHT.exec(body);
  const weight = weighted ? weighted[2] : '';
  const rest = weighted ? weighted[1] : body;

  const targeted = TARGET.exec(rest);
  if (targeted) {
    mediaOrPlain(targeted[1], tokens);
    push(tokens, targeted[2], 'punctuation');
    mediaOrPlain(targeted[3], tokens, 'target');
  } else {
    mediaOrPlain(rest, tokens);
  }
  push(tokens, weight, 'weight');
}

/** A fragment that may be `![alt](url)` / `!<youtube>[alt](url)`, or may just be words. */
function mediaOrPlain(text: string, tokens: Token[], plainKind: TokenKind = 'plain'): void {
  const media = MEDIA.exec(text);
  if (!media) {
    push(tokens, text, plainKind);
    return;
  }
  push(tokens, media[1], 'tag');
  push(tokens, media[2], 'punctuation');
  push(tokens, media[3], 'label');
  push(tokens, media[4], 'punctuation');
  push(tokens, media[5], 'punctuation');
  push(tokens, media[6], 'url');
  push(tokens, media[7], 'punctuation');
  push(tokens, media[8], plainKind);
}

interface LineContext {
  inFrontmatter: boolean;
  inOptions: boolean;
}

function tokenizeLine(line: string, ctx: LineContext): Token[] {
  const tokens: Token[] = [];

  if (FENCE.test(line)) {
    push(tokens, line, 'punctuation');
    return tokens;
  }

  if (ctx.inFrontmatter) {
    const setting = SETTING.exec(line);
    if (setting) {
      push(tokens, setting[1] + setting[2], 'settingKey');
      push(tokens, setting[3], 'punctuation');
      push(tokens, setting[4], 'settingValue');
      return tokens;
    }
    const front = FRONTMATTER.exec(line);
    if (front) {
      push(tokens, front[1], 'frontmatterKey');
      push(tokens, front[2], 'punctuation');
      push(tokens, front[3], 'settingValue');
      return tokens;
    }
    push(tokens, line, 'plain');
    return tokens;
  }

  if (line === '{' || line === '}') {
    push(tokens, line, 'punctuation');
    return tokens;
  }

  const setting = SETTING.exec(line);
  if (setting) {
    push(tokens, setting[1] + setting[2], 'settingKey');
    push(tokens, setting[3], 'punctuation');
    push(tokens, setting[4], 'settingValue');
    return tokens;
  }

  if (line.startsWith('=') || line.startsWith('~')) {
    push(tokens, line[0], 'marker');
    optionBody(line.slice(1), tokens);
    return tokens;
  }

  // A `!<tag>[…](…)` line: media, a reveal, or an analysis note.
  if (line.startsWith('!')) {
    optionBody(line, tokens);
    return tokens;
  }

  // Only outside an option block can a line be a variant header — `pick_one: text` inside `{ }`
  // would be an option, not a new question.
  if (!ctx.inOptions) {
    const header = VARIANT_HEADER.exec(line);
    if (header) {
      push(tokens, header[1], 'variant');
      push(tokens, header[2], 'punctuation');
      push(tokens, header[3], 'prompt');
      return tokens;
    }
  }

  push(tokens, line, 'plain');
  return tokens;
}

/** Tokenizes a whole `.qwiz` document, one token list per line, in source order. */
export function highlightQwiz(source: string): Token[][] {
  const lines = source.split('\n');
  const ctx: LineContext = { inFrontmatter: false, inOptions: false };
  let seenOpeningFence = false;

  return lines.map((line) => {
    // The fence itself is tokenized in whichever state it's toggling out of, so both `---` lines
    // colour the same.
    const isFence = FENCE.test(line);
    const tokens = tokenizeLine(line, ctx);

    if (isFence && !seenOpeningFence) {
      seenOpeningFence = true;
      ctx.inFrontmatter = true;
    } else if (isFence && ctx.inFrontmatter) {
      ctx.inFrontmatter = false;
    } else if (!ctx.inFrontmatter) {
      if (line === '{') ctx.inOptions = true;
      else if (line === '}') ctx.inOptions = false;
    }
    return tokens;
  });
}

/** The class each token kind renders with. Themed through the same semantic tokens as the rest of
 * the app (see global.css), so an editor follows whichever theme is active rather than carrying a
 * second, hard-coded palette of its own. */
export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: 'text-ink',
  variant: 'font-semibold text-accent-ink',
  prompt: 'text-ink',
  punctuation: 'text-ink-faint',
  marker: 'font-semibold text-positive-ink-soft',
  weight: 'text-warning-ink-strong',
  target: 'text-ink-muted',
  settingKey: 'text-accent-ink-soft',
  settingValue: 'text-positive-ink',
  tag: 'font-semibold text-negative-ink',
  frontmatterKey: 'font-semibold text-accent-ink',
  label: 'text-ink-muted',
  url: 'text-ink-subtle underline decoration-dotted underline-offset-2'
};
