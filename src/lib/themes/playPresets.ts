/** The looks a quiz can be played in.
 *
 * Distinct from the thirteen themes in the header, and deliberately so. Those are *the app's*
 * colour schemes — Nord, Dracula, Solarized — chosen by whoever is using Qwiz, and they apply
 * everywhere including the builder. These are *a quiz's* look, chosen by its author, applying only
 * while it's being played, and they restyle the whole thing: type, spacing, borders, shape, not
 * just colour. A quiz can carry one, and it travels in the `.qwiz` file **by name**.
 *
 * That last part is what makes the trust model work. A preset is this app's own CSS: a file saying
 * `theme: arcade` is naming something we shipped, not carrying code, so it applies with no
 * questions asked. Only the CSS an author writes THEMSELVES (`theme-css:`) is arbitrary, and only
 * that gets the prompt. It also keeps files small enough for share links.
 *
 * Every preset targets the `.qwiz-*` classes documented in `docs/play-classes.md`. Those names are
 * a published API — themes people wrote will break if they're renamed.
 *
 * Written as CSS text rather than as a stylesheet file for the same reason as `presetCss.ts`:
 * Vite's CSS pipeline claims any `.css` file before the raw loader sees it. Loaded on demand, so
 * none of this is in the bundle of a page that never plays a themed quiz.
 */

export interface PlayPreset {
  id: string;
  label: string;
  /** One line, shown under the name in the picker. */
  hint: string;
}

/** In the order the picker offers them. `none` is first and is the default: most quizzes should
 * not carry a look at all, and should play in whatever theme the visitor has chosen for the app. */
export const PLAY_PRESETS: readonly PlayPreset[] = [
  { id: 'none', label: 'No theme', hint: 'Follows whichever theme the person has chosen' },
  { id: 'arcade', label: 'Arcade', hint: 'Big colour tiles, bold and loud' },
  { id: 'trivia-night', label: 'Trivia Night', hint: 'Clean quiz-page look, blue and compact' },
  { id: 'game-show', label: 'Game Show', hint: 'Deep blue and gold, serif capitals' },
  { id: 'paper', label: 'Paper', hint: 'Quiet serif, like a printed puzzle page' },
  { id: 'terminal', label: 'Terminal', hint: 'Monospace on black, green on the answers' }
];

export function isKnownPlayPreset(id: string): boolean {
  return PLAY_PRESETS.some((preset) => preset.id === id);
}

/* Shared notes for every preset below:
   - They set colours explicitly rather than leaning on the app's tokens, because a quiz's look
     has to be the same for a player using Nord as for one using Light. That's the whole promise.
   - Specificity ties with Tailwind's utilities (both a single class), and the injected <style> is
     appended last, so these win without needing `!important`. Where `!important` does appear it's
     against a utility that would otherwise re-apply on a state change.
   - `.qwiz-option` is a <label> wrapping a real radio/checkbox; the input is hidden in the loud
     presets, where a tile IS the control, and left alone in the quiet ones.
   - Each one styles `body` as well as the `.qwiz-*` elements. The injected stylesheet is removed
     the moment the player leaves, so this is scoped to the run in practice, and it's what lets a
     preset dress the whole page rather than stopping at the edge of the question card. */

const ARCADE = `
/* Arcade — four fat colour tiles, the shape most people picture when they think "quiz app". */
body {
  background: #1a1040;
  color: #ece8fb;
}
.qwiz-back {
  color: #cfc6f5;
}
.qwiz-home {
  background: #2a1f5e;
  border-color: #4a3a8f;
  color: #cfc6f5;
}
.qwiz-welcome,
.qwiz-question {
  font-family: 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif;
}
.qwiz-welcome {
  background: #2a1f5e;
  border: none;
  border-radius: 1.25rem;
  color: #fff;
  padding: 2rem;
}
.qwiz-title {
  color: #fff;
  font-size: 2rem;
  letter-spacing: -0.02em;
}
.qwiz-description,
.qwiz-rules,
.qwiz-rules li {
  color: #cfc6f5;
}
.qwiz-start {
  background: #ff3355;
  border: none;
  border-radius: 999px;
  color: #fff;
  font-size: 1rem;
  height: 3rem;
  padding: 0 2rem;
}
.qwiz-question-text {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  padding: 1.5rem 1rem;
  background: #2a1f5e;
  border-radius: 1rem;
  color: #fff;
}
.qwiz-options {
  gap: 0.75rem;
}
.qwiz-card {
  background: #f2effc;
  border: none;
  border-radius: 1rem;
}
.qwiz-progress,
.qwiz-score {
  color: #5b4b9e;
  font-weight: 700;
}
.qwiz-option {
  border: none;
  border-radius: 0.75rem;
  font-size: 1.05rem;
  font-weight: 600;
  padding: 1.25rem;
  transition: transform 0.08s ease;
}
.qwiz-option-label {
  color: #fff;
}
.qwiz-submit {
  background: #ff3355;
  border-radius: 999px;
  color: #fff;
  font-size: 0.95rem;
  padding: 0.6rem 1.75rem;
}
.qwiz-option input {
  display: none;
}
/* Four colours by position, the way every game of this shape does it. */
.qwiz-option:nth-child(4n + 1) { background: #e21b3c; }
.qwiz-option:nth-child(4n + 2) { background: #1368ce; }
.qwiz-option:nth-child(4n + 3) { background: #d89e00; }
.qwiz-option:nth-child(4n + 4) { background: #26890c; }
.qwiz-option:hover {
  transform: scale(1.02);
}
.qwiz-option--selected {
  outline: 4px solid #fff;
  outline-offset: -4px;
}
.qwiz-option--correct {
  background: #26890c;
  outline: 4px solid #9bff7a;
  outline-offset: -4px;
}
.qwiz-option--wrong {
  background: #6b6b6b;
  opacity: 0.65;
}
`;

const TRIVIA_NIGHT = `
/* Trivia Night — the plain, dense, blue-accented look of a web trivia page. */
body {
  background: #eef1f5;
  color: #10243b;
}
.qwiz-back {
  color: #4a5b6d;
}
.qwiz-home {
  background: #ffffff;
  border-color: #d4d9e0;
  color: #4a5b6d;
}
.qwiz-welcome,
.qwiz-question {
  font-family: 'Helvetica Neue', Arial, sans-serif;
}
.qwiz-welcome {
  background: #fff;
  border: 1px solid #d4d9e0;
  border-radius: 0.25rem;
  border-top: 4px solid #1a6fc4;
}
.qwiz-title {
  color: #10243b;
  font-size: 1.75rem;
}
.qwiz-description {
  color: #4a5b6d;
}
.qwiz-start {
  background: #1a6fc4;
  border: none;
  border-radius: 0.25rem;
  color: #fff;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.qwiz-question-text {
  color: #10243b;
  font-size: 1.2rem;
  font-weight: 700;
  border-bottom: 2px solid #e3e7ec;
  padding-bottom: 0.75rem;
}
.qwiz-card {
  background: #fff;
  border: 1px solid #d4d9e0;
  border-radius: 0.25rem;
}
.qwiz-progress,
.qwiz-score {
  color: #4a5b6d;
  text-transform: uppercase;
}
.qwiz-option {
  background: #f7f9fb;
  border: 1px solid #d4d9e0;
  border-radius: 0.25rem;
  padding: 0.7rem 0.9rem;
}
.qwiz-option-label {
  color: #10243b;
}
.qwiz-submit {
  background: #1a6fc4;
  border-radius: 0.25rem;
  color: #fff;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.qwiz-option:hover {
  background: #eaf2fa;
  border-color: #1a6fc4;
}
.qwiz-option--selected {
  background: #eaf2fa;
  border-color: #1a6fc4;
  box-shadow: inset 3px 0 0 #1a6fc4;
}
.qwiz-option--correct {
  background: #e6f4ea;
  border-color: #1e7e34;
  box-shadow: inset 3px 0 0 #1e7e34;
}
.qwiz-option--wrong {
  background: #fdecea;
  border-color: #c62828;
  box-shadow: inset 3px 0 0 #c62828;
}
`;

const GAME_SHOW = `
/* Game Show — deep blue board, gold serif capitals, the television version. */
body {
  background: #02052e;
  color: #ffe9a8;
}
.qwiz-back {
  color: #ffe9a8;
}
.qwiz-home {
  background: #0a13b8;
  border-color: #d4a017;
  color: #ffe9a8;
}
.qwiz-welcome,
.qwiz-question {
  font-family: 'Times New Roman', Georgia, serif;
}
.qwiz-welcome {
  background: #060ce9;
  border: 4px solid #d4a017;
  border-radius: 0;
  color: #fff;
  padding: 2rem;
  text-align: center;
}
.qwiz-title {
  color: #fff;
  font-size: 2.25rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-shadow: 3px 3px 0 #000;
  text-transform: uppercase;
}
.qwiz-description,
.qwiz-rules,
.qwiz-rules li {
  color: #ffe9a8;
}
.qwiz-start {
  background: #d4a017;
  border: none;
  border-radius: 0;
  color: #060ce9;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.qwiz-question-text {
  background: #060ce9;
  border: 3px solid #d4a017;
  color: #fff;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1.5rem;
  text-align: center;
  text-shadow: 2px 2px 0 #000;
  text-transform: uppercase;
}
.qwiz-card {
  background: #04086b;
  border: 3px solid #d4a017;
  border-radius: 0;
}
.qwiz-progress,
.qwiz-score {
  color: #ffe9a8;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.qwiz-option {
  background: #0a13b8;
  border: 2px solid #d4a017;
  border-radius: 0;
  font-size: 1.05rem;
  letter-spacing: 0.03em;
  padding: 1rem;
  text-transform: uppercase;
}
.qwiz-option-label {
  color: #fff;
}
.qwiz-option--selected .qwiz-option-label,
.qwiz-option--correct .qwiz-option-label {
  color: #060ce9;
}
.qwiz-option--wrong .qwiz-option-label {
  color: #999;
}
.qwiz-submit {
  background: #d4a017;
  border-radius: 0;
  color: #060ce9;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.qwiz-option input {
  display: none;
}
.qwiz-option:hover {
  background: #1a24d8;
}
.qwiz-option--selected {
  background: #d4a017;
  color: #060ce9;
}
.qwiz-option--correct {
  background: #d4a017;
  color: #060ce9;
  font-weight: 700;
}
.qwiz-option--wrong {
  background: #2a2a2a;
  border-color: #666;
  color: #999;
}
`;

const PAPER = `
/* Paper — a printed puzzle page: serif, generous margins, hairline rules, no fill. */
body {
  background: #f2ede1;
  color: #2e2a24;
}
.qwiz-back {
  color: #5c554a;
}
.qwiz-home {
  background: #fdfcf8;
  border-color: #ddd6c7;
  color: #5c554a;
}
.qwiz-welcome,
.qwiz-question {
  font-family: Georgia, 'Iowan Old Style', serif;
}
.qwiz-welcome {
  background: #fdfcf8;
  border: 1px solid #ddd6c7;
  border-radius: 0;
  padding: 2.5rem;
}
.qwiz-title {
  color: #1a1814;
  font-size: 2rem;
  font-weight: 400;
  letter-spacing: -0.01em;
}
.qwiz-description {
  color: #5c554a;
  font-style: italic;
}
.qwiz-start {
  background: #1a1814;
  border: none;
  border-radius: 0;
  color: #fdfcf8;
  font-family: Georgia, serif;
  letter-spacing: 0.05em;
}
.qwiz-question-text {
  color: #1a1814;
  font-size: 1.35rem;
  font-weight: 400;
  line-height: 1.5;
}
.qwiz-card {
  background: #fdfcf8;
  border: 1px solid #ddd6c7;
  border-radius: 0;
}
.qwiz-progress,
.qwiz-score {
  color: #7a7060;
  font-family: Georgia, serif;
  font-style: italic;
}
.qwiz-option {
  background: transparent;
  border: none;
  border-bottom: 1px solid #e5ded1;
  border-radius: 0;
  padding: 0.85rem 0.25rem;
}
.qwiz-option-label {
  color: #2e2a24;
}
.qwiz-option--correct .qwiz-option-label {
  color: #2f6b3f;
  font-weight: 700;
}
.qwiz-option--wrong .qwiz-option-label {
  color: #9a3b32;
  text-decoration: line-through;
}
.qwiz-submit {
  background: #1a1814;
  border-radius: 0;
  color: #fdfcf8;
  font-family: Georgia, serif;
}
.qwiz-option:hover {
  background: #f5f1e8;
}
.qwiz-option--selected {
  background: #f0ebdf;
  border-bottom-color: #1a1814;
}
.qwiz-option--correct {
  border-bottom: 2px solid #2f6b3f;
  color: #2f6b3f;
  font-weight: 700;
}
.qwiz-option--wrong {
  color: #9a3b32;
  text-decoration: line-through;
}
`;

const TERMINAL = `
/* Terminal — monospace on black. The joke writes itself, but it reads genuinely well. */
body {
  background: #050805;
  color: #b8ffb8;
}
.qwiz-back {
  color: #6ba86b;
}
.qwiz-home {
  background: #0b0f0b;
  border-color: #1f7a1f;
  color: #6ba86b;
}
.qwiz-welcome,
.qwiz-question {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.qwiz-welcome {
  background: #0b0f0b;
  border: 1px solid #1f7a1f;
  border-radius: 0;
  color: #b8ffb8;
  padding: 1.75rem;
}
.qwiz-title {
  color: #7dff7d;
  font-size: 1.5rem;
  font-weight: 400;
}
.qwiz-title::before {
  content: '$ ';
  color: #1f7a1f;
}
.qwiz-description,
.qwiz-rules,
.qwiz-rules li {
  color: #8fd48f;
}
.qwiz-start {
  background: #7dff7d;
  border: none;
  border-radius: 0;
  color: #0b0f0b;
  font-family: inherit;
  font-weight: 700;
}
.qwiz-question-text {
  background: #0b0f0b;
  border-left: 3px solid #1f7a1f;
  color: #b8ffb8;
  font-size: 1.05rem;
  padding: 1rem;
}
.qwiz-card {
  background: #0b0f0b;
  border: 1px solid #1f7a1f;
  border-radius: 0;
}
.qwiz-progress,
.qwiz-score {
  color: #6ba86b;
  font-family: ui-monospace, Menlo, monospace;
}
.qwiz-option {
  background: #0b0f0b;
  border: 1px dashed #1f7a1f;
  border-radius: 0;
  padding: 0.7rem 0.9rem;
}
.qwiz-option-label {
  color: #b8ffb8;
}
.qwiz-option--correct .qwiz-option-label {
  color: #7dff7d;
}
.qwiz-option--wrong .qwiz-option-label {
  color: #ff8080;
}
.qwiz-submit {
  background: #7dff7d;
  border-radius: 0;
  color: #0b0f0b;
  font-family: ui-monospace, Menlo, monospace;
  font-weight: 700;
}
.qwiz-option input {
  display: none;
}
.qwiz-option::before {
  content: '[ ] ';
  color: #1f7a1f;
}
.qwiz-option:hover {
  background: #101a10;
}
.qwiz-option--selected::before {
  content: '[x] ';
  color: #7dff7d;
}
.qwiz-option--selected {
  border-style: solid;
  border-color: #7dff7d;
}
.qwiz-option--correct {
  border-color: #7dff7d;
  color: #7dff7d;
}
.qwiz-option--correct::before {
  content: '[\\2713] ';
}
.qwiz-option--wrong {
  border-color: #a83232;
  color: #ff8080;
}
.qwiz-option--wrong::before {
  content: '[\\00d7] ';
}
`;

const STYLESHEETS: Record<string, string> = {
  arcade: ARCADE,
  'trivia-night': TRIVIA_NIGHT,
  'game-show': GAME_SHOW,
  paper: PAPER,
  terminal: TERMINAL
};

/** A preset's stylesheet, or `''` for `none` and for any id we don't ship — an unknown preset
 * plays in the visitor's own theme rather than failing, since a quiz naming a preset from a newer
 * version of Qwiz is a thing that will happen. */
export function playPresetCss(id: string | undefined): string {
  return id ? (STYLESHEETS[id] ?? '') : '';
}
