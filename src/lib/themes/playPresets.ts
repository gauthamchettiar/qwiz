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
 * ## Why a preset is sixteen variables and not a stylesheet
 *
 * The first version of this file had each preset name colours element by element. Two things went
 * wrong, both predictable in hindsight: any element a preset forgot stayed on the app's own
 * defaults — so a themed run had unstyled patches, the verdict banner and the results ring and the
 * leave dialog among them — and nothing checked that the colours chosen could be read against each
 * other.
 *
 * So the mapping from ELEMENT to ROLE lives once, in `PLAY_BASE` below, and a preset only says what
 * its roles look like. Adding an element to `PLAY_BASE` themes it in every preset at once, and
 * `playPresets.test.ts` measures each preset's text pairs against WCAG AA — a preset cannot ship
 * unreadable.
 *
 * Every class named here is documented in `docs/play-classes.md`, which is a published API: themes
 * people have already written break if one is renamed.
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
  { id: 'terminal', label: 'Terminal', hint: 'Monospace on black, green on the answers' },
  { id: 'chalkboard', label: 'Chalkboard', hint: 'Classroom slate, chalk and mustard' },
  { id: 'swiss', label: 'Swiss', hint: 'Big type, white space, one red accent' },
  { id: 'neon', label: 'Neon', hint: 'Magenta and cyan glow on near-black' },
  { id: 'high-contrast', label: 'High Contrast', hint: 'Black, white and yellow, extra large' }
];

export function isKnownPlayPreset(id: string): boolean {
  return PLAY_PRESETS.some((preset) => preset.id === id);
}

/** The roles a preset defines. Text roles are named for what they sit ON, because that pairing is
 * the thing that has to be readable — `panelInk` means "ink on panel", not "slightly grey ink". */
export interface PlayRoles {
  /** The page behind everything, and the text directly on it (the header, the Back link). */
  page: string;
  pageInk: string;
  /** The question card, the results card, the leave dialog. */
  surface: string;
  surfaceInk: string;
  /** Quieter text on `surface` — progress, descriptions, captions. Still held to AA. */
  surfaceInkMuted: string;
  /** A block inset within a card: an option, a hint, a bank, the verdict banner. */
  panel: string;
  panelInk: string;
  border: string;
  /** Buttons and the progress fill. `accentInk` is the text ON accent. */
  accent: string;
  accentInk: string;
  correct: string;
  correctSurface: string;
  correctInk: string;
  wrong: string;
  wrongSurface: string;
  wrongInk: string;
}

/** Non-colour flourishes. Separate from `PlayRoles` because nothing here can fail a contrast check,
 * and mixing the two would make that test's job ambiguous. */
interface PlayShape {
  font: string;
  headingFont?: string;
  radius: string;
  /** Appended verbatim — the few rules a preset needs that aren't a role (Arcade's fat tiles,
   * Terminal's `[x]` prefixes). Keep these short: anything that turns out to be general belongs in
   * `PLAY_BASE` as a new role. */
  extra?: string;
}

/** Element → role. The single place that knows which class wears which colour.
 *
 * `!important` appears only where a Tailwind utility would otherwise re-apply on a state change:
 * an option's tone function rewrites its whole class string when it becomes selected or revealed,
 * and that lands after this in the cascade for that element.
 */
const PLAY_BASE = `
body {
  background: var(--qp-page);
  color: var(--qp-page-ink);
  font-family: var(--qp-font);
}

/* The header strip a themed run sits under. Left on the app's own tokens it rendered the light
   theme's slate on whatever the preset made the page — 1.5:1 on every dark preset. */
.qwiz-back,
.qwiz-back:hover {
  color: var(--qp-page-ink);
}
.qwiz-home {
  background: var(--qp-surface);
  border-color: var(--qp-border);
  color: var(--qp-surface-ink);
}

.qwiz-welcome,
.qwiz-card,
.qwiz-results,
.qwiz-dialog {
  background: var(--qp-surface);
  border-color: var(--qp-border);
  border-radius: var(--qp-radius);
  color: var(--qp-surface-ink);
}
.qwiz-title,
.qwiz-results-title,
.qwiz-results-percent {
  color: var(--qp-surface-ink);
  font-family: var(--qp-heading-font);
}
.qwiz-description,
.qwiz-rules,
.qwiz-rules li,
.qwiz-progress,
.qwiz-score,
.qwiz-back-to-summary {
  color: var(--qp-surface-ink-muted);
}
.qwiz-question-text {
  color: var(--qp-surface-ink);
  font-family: var(--qp-heading-font);
}

.qwiz-start,
.qwiz-submit,
.qwiz-next {
  background: var(--qp-accent);
  border: none;
  border-radius: var(--qp-radius);
  color: var(--qp-accent-ink);
}
.qwiz-start:hover,
.qwiz-submit:hover,
.qwiz-next:hover {
  filter: brightness(1.08);
}

.qwiz-progressbar {
  background: var(--qp-panel);
}
.qwiz-progressbar-fill {
  background: var(--qp-accent);
}

/* An option's look is carried by VARIABLES rather than by competing rules.
   The state classes don't restate background-color; they set --qp-option-* on the same element,
   and there is exactly one declaration per property below. That matters because the previous
   shape — a base rule plus important state overrides — still lost to Tailwind's own
   bg-accent-surface, in a way that neither extra specificity nor important fixed, leaving a
   selected option wearing the unselected colour. One declaration cannot be outranked by another
   that doesn't exist. (Note for future edits: this whole stylesheet is a template literal, so a
   backtick in a comment here closes it and the file stops being CSS.) */
.qwiz-option {
  background-color: var(--qp-option-bg, var(--qp-panel)) !important;
  border-color: var(--qp-option-line, var(--qp-border)) !important;
  border-radius: var(--qp-radius);
}
.qwiz-option-label {
  color: var(--qp-option-ink, var(--qp-panel-ink));
}
/* Hover had no rule at all, so Tailwind's hover:bg-surface won — and under data-theme="quiz" that
   resolves to the LIGHT theme's near-white. Hovering any option on any dark preset turned it white
   while the label stayed white, which is why text seemed to vanish on almost every theme.
   Mixed toward the panel's own INK rather than lightened, so it darkens on light presets and
   lightens on dark ones without needing a hover colour per role. */
.qwiz-option:hover,
.qwiz-home:hover,
.qwiz-back-to-summary:hover {
  background-color: color-mix(
    in srgb,
    var(--qp-option-bg, var(--qp-panel)) 88%,
    var(--qp-panel-ink)
  ) !important;
}
.qwiz-back-to-summary:hover {
  color: var(--qp-surface-ink);
}
.qwiz-home:hover {
  background-color: color-mix(in srgb, var(--qp-surface) 88%, var(--qp-surface-ink)) !important;
}

.qwiz-option--selected {
  --qp-option-bg: var(--qp-accent);
  --qp-option-line: var(--qp-accent);
  --qp-option-ink: var(--qp-accent-ink);
}
.qwiz-option--correct {
  --qp-option-bg: var(--qp-correct-surface);
  --qp-option-line: var(--qp-correct);
  --qp-option-ink: var(--qp-correct-ink);
}
.qwiz-option--wrong {
  --qp-option-bg: var(--qp-wrong-surface);
  --qp-option-line: var(--qp-wrong);
  --qp-option-ink: var(--qp-wrong-ink);
}

/* The verdict banner and its points pill — the thing a player looks at after every single
   question, and one of the pieces the element-by-element presets had left unthemed. */
.qwiz-verdict {
  background: var(--qp-panel);
  border-color: var(--qp-border);
  border-radius: var(--qp-radius);
}
.qwiz-verdict-label {
  color: var(--qp-panel-ink);
}
.qwiz-verdict-score {
  background: var(--qp-accent);
  color: var(--qp-accent-ink);
}

.qwiz-results-head {
  background: var(--qp-panel) !important;
}

/* Anything without a role of its own still has to be legible: text inputs, the word and letter
   banks, board slots. A selector list rather than a class each, because the failure being avoided
   is "an element nobody remembered", and per-class rules are exactly what forgetting looks like. */
.qwiz-card input[type='text'],
.qwiz-card textarea,
.qwiz-welcome input[type='text'] {
  background: var(--qp-panel);
  border-color: var(--qp-border);
  color: var(--qp-panel-ink);
}
.qwiz-card input[type='text']::placeholder {
  color: var(--qp-surface-ink-muted);
}
`;

/** A preset's `:root` block, the shared mapping, then its own flourishes. */
function stylesheet(roles: PlayRoles, shape: PlayShape): string {
  return `:root {
  --qp-page: ${roles.page};
  --qp-page-ink: ${roles.pageInk};
  --qp-surface: ${roles.surface};
  --qp-surface-ink: ${roles.surfaceInk};
  --qp-surface-ink-muted: ${roles.surfaceInkMuted};
  --qp-panel: ${roles.panel};
  --qp-panel-ink: ${roles.panelInk};
  --qp-border: ${roles.border};
  --qp-accent: ${roles.accent};
  --qp-accent-ink: ${roles.accentInk};
  --qp-correct: ${roles.correct};
  --qp-correct-surface: ${roles.correctSurface};
  --qp-correct-ink: ${roles.correctInk};
  --qp-wrong: ${roles.wrong};
  --qp-wrong-surface: ${roles.wrongSurface};
  --qp-wrong-ink: ${roles.wrongInk};
  --qp-font: ${shape.font};
  --qp-heading-font: ${shape.headingFont ?? shape.font};
  --qp-radius: ${shape.radius};
}
${PLAY_BASE}${shape.extra ?? ''}`;
}

/** Every preset's roles, exported so `playPresets.test.ts` can measure them. */
export const PRESET_ROLES: Record<string, PlayRoles> = {
  arcade: {
    page: '#1a1040',
    pageInk: '#e9e4fb',
    surface: '#2a1f5e',
    surfaceInk: '#ffffff',
    surfaceInkMuted: '#cfc6f5',
    panel: '#3b2d7a',
    panelInk: '#ffffff',
    border: '#5a49a8',
    accent: '#c81338',
    accentInk: '#ffffff',
    correct: '#4ade80',
    correctSurface: '#14532d',
    correctInk: '#bbf7d0',
    wrong: '#f87171',
    wrongSurface: '#5c1a1a',
    wrongInk: '#fecaca'
  },
  'trivia-night': {
    page: '#eef1f5',
    pageInk: '#1d3450',
    surface: '#ffffff',
    surfaceInk: '#10243b',
    surfaceInkMuted: '#4a5b6d',
    panel: '#f4f7fa',
    panelInk: '#10243b',
    border: '#c9d2dc',
    accent: '#1a6fc4',
    accentInk: '#ffffff',
    correct: '#1e7e34',
    correctSurface: '#e6f4ea',
    correctInk: '#125524',
    wrong: '#c62828',
    wrongSurface: '#fdecea',
    wrongInk: '#8f1d1d'
  },
  'game-show': {
    page: '#02052e',
    pageInk: '#ffe9a8',
    surface: '#0a13b8',
    surfaceInk: '#ffffff',
    surfaceInkMuted: '#ffe9a8',
    panel: '#1620d4',
    panelInk: '#ffffff',
    border: '#d4a017',
    accent: '#d4a017',
    accentInk: '#1a1300',
    correct: '#ffd24a',
    correctSurface: '#4a3600',
    correctInk: '#ffe9a8',
    wrong: '#9aa0b5',
    wrongSurface: '#2a2f45',
    wrongInk: '#d7dbe6'
  },
  paper: {
    page: '#f2ede1',
    pageInk: '#3a352c',
    surface: '#fdfcf8',
    surfaceInk: '#1a1814',
    surfaceInkMuted: '#5c554a',
    panel: '#f7f3e9',
    panelInk: '#2e2a24',
    border: '#cdc4ae',
    accent: '#1a1814',
    accentInk: '#fdfcf8',
    correct: '#2f6b3f',
    correctSurface: '#e8f0e6',
    correctInk: '#1f4a2c',
    wrong: '#9a3b32',
    wrongSurface: '#f7e9e6',
    wrongInk: '#7a2a22'
  },
  chalkboard: {
    page: '#1e2b24',
    pageInk: '#e8e6d9',
    surface: '#2f4438',
    surfaceInk: '#f5f3e7',
    surfaceInkMuted: '#c3cfc0',
    panel: '#3a5244',
    panelInk: '#f5f3e7',
    border: '#63836d',
    accent: '#e8c34a',
    accentInk: '#1e2b24',
    correct: '#a8d5a2',
    correctSurface: '#1f3a28',
    correctInk: '#d4ecd0',
    wrong: '#e89b8c',
    wrongSurface: '#4a2620',
    wrongInk: '#f7d5cd'
  },
  swiss: {
    page: '#ffffff',
    pageInk: '#111111',
    surface: '#ffffff',
    surfaceInk: '#111111',
    surfaceInkMuted: '#595959',
    panel: '#f0f0f0',
    panelInk: '#111111',
    border: '#111111',
    accent: '#c1121f',
    accentInk: '#ffffff',
    correct: '#0a7d3c',
    correctSurface: '#eaf5ee',
    correctInk: '#07542a',
    wrong: '#c1121f',
    wrongSurface: '#fdeaec',
    wrongInk: '#8c0d16'
  },
  neon: {
    page: '#08060f',
    pageInk: '#d8c8ff',
    surface: '#14102a',
    surfaceInk: '#f0e6ff',
    surfaceInkMuted: '#b9a6e8',
    panel: '#1e1840',
    panelInk: '#f0e6ff',
    border: '#7d4bbd',
    accent: '#ff2d95',
    accentInk: '#14000a',
    correct: '#2bf5c8',
    correctSurface: '#06322a',
    correctInk: '#b6ffee',
    wrong: '#ff5c7a',
    wrongSurface: '#3a0a1a',
    wrongInk: '#ffd0da'
  },
  'high-contrast': {
    page: '#000000',
    pageInk: '#ffffff',
    surface: '#000000',
    surfaceInk: '#ffffff',
    surfaceInkMuted: '#ebebeb',
    panel: '#141414',
    panelInk: '#ffffff',
    border: '#ffffff',
    accent: '#ffd400',
    accentInk: '#000000',
    correct: '#00e676',
    correctSurface: '#00301a',
    correctInk: '#c8ffdf',
    wrong: '#ff6b6b',
    wrongSurface: '#3a0000',
    wrongInk: '#ffdada'
  },
  terminal: {
    page: '#050805',
    pageInk: '#8fd48f',
    surface: '#0b0f0b',
    surfaceInk: '#b8ffb8',
    surfaceInkMuted: '#7cc47c',
    panel: '#111a11',
    panelInk: '#b8ffb8',
    border: '#2f9e2f',
    accent: '#7dff7d',
    accentInk: '#041604',
    correct: '#7dff7d',
    correctSurface: '#0d2a0d',
    correctInk: '#b6ffb6',
    wrong: '#ff8080',
    wrongSurface: '#2a0d0d',
    wrongInk: '#ffc2c2'
  }
};

const SHAPES: Record<string, PlayShape> = {
  arcade: {
    font: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
    radius: '0.9rem',
    extra: `
.qwiz-question-text {
  background: var(--qp-panel);
  font-size: 1.5rem;
  padding: 1.5rem 1rem;
  text-align: center;
}
.qwiz-option {
  font-size: 1.05rem;
  font-weight: 600;
  padding: 1.25rem;
}
.qwiz-option input {
  display: none;
}
.qwiz-start,
.qwiz-submit {
  border-radius: 999px;
  padding: 0.6rem 1.75rem;
}
`
  },
  'trivia-night': {
    font: "'Helvetica Neue', Arial, sans-serif",
    radius: '0.25rem',
    extra: `
.qwiz-question-text {
  border-bottom: 2px solid var(--qp-border);
  font-size: 1.2rem;
  font-weight: 700;
  padding-bottom: 0.75rem;
}
.qwiz-start,
.qwiz-submit,
.qwiz-next {
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
`
  },
  'game-show': {
    font: "'Times New Roman', Georgia, serif",
    radius: '0',
    extra: `
.qwiz-welcome,
.qwiz-card,
.qwiz-results {
  border-width: 3px;
}
.qwiz-title,
.qwiz-question-text {
  letter-spacing: 0.05em;
  text-align: center;
  text-shadow: 2px 2px 0 #000;
  text-transform: uppercase;
}
.qwiz-option {
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.qwiz-option input {
  display: none;
}
.qwiz-start,
.qwiz-submit,
.qwiz-next {
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
`
  },
  paper: {
    font: "Georgia, 'Iowan Old Style', serif",
    radius: '0',
    extra: `
.qwiz-title {
  font-weight: 400;
}
.qwiz-description {
  font-style: italic;
}
.qwiz-question-text {
  font-size: 1.35rem;
  font-weight: 400;
  line-height: 1.5;
}
.qwiz-option {
  border: none;
  border-bottom: 1px solid var(--qp-border);
  padding: 0.85rem 0.25rem;
}
.qwiz-option--selected,
.qwiz-option--correct,
.qwiz-option--wrong {
  /* The surface colour, not the transparent keyword: an option here sits directly on the card so
     it looks identical, but a keyword cannot be blended, and the hover rule mixing it toward the
     ink produced a translucent dark under dark text at 1.02:1. */
  --qp-option-bg: var(--qp-surface);
  border-bottom-width: 2px;
}
.qwiz-option--selected .qwiz-option-label {
  color: var(--qp-surface-ink);
  font-weight: 700;
}
.qwiz-option--correct .qwiz-option-label {
  color: var(--qp-correct);
  font-weight: 700;
}
.qwiz-option--wrong .qwiz-option-label {
  color: var(--qp-wrong);
  text-decoration: line-through;
}
`
  },
  chalkboard: {
    font: "Georgia, 'Iowan Old Style', serif",
    radius: '0',
    extra: `
.qwiz-title,
.qwiz-question-text {
  letter-spacing: 0.02em;
}
.qwiz-welcome,
.qwiz-card,
.qwiz-results {
  border-width: 2px;
}
.qwiz-option {
  border-style: dotted;
}
`
  },
  swiss: {
    font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    radius: '0',
    extra: `
/* The only preset with no boxes at all: rules instead of borders, and the type doing the work.
   That silhouette is the whole idea, so the cards drop their edges entirely. */
.qwiz-welcome,
.qwiz-card,
.qwiz-results {
  border: none;
  border-top: 3px solid var(--qp-border);
  padding-top: 1.5rem;
}
.qwiz-title {
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
}
.qwiz-question-text {
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.qwiz-option {
  border: none;
  border-bottom: 1px solid var(--qp-border);
}
.qwiz-progress,
.qwiz-score {
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
`
  },
  neon: {
    font: "'Segoe UI', system-ui, sans-serif",
    radius: '0.4rem',
    extra: `
.qwiz-title,
.qwiz-question-text {
  text-shadow: 0 0 12px var(--qp-accent);
}
.qwiz-welcome,
.qwiz-card,
.qwiz-results {
  box-shadow: 0 0 24px rgba(255, 45, 149, 0.25);
}
.qwiz-option--selected,
.qwiz-option--correct {
  box-shadow: 0 0 14px var(--qp-option-line);
}
.qwiz-start,
.qwiz-submit,
.qwiz-next {
  box-shadow: 0 0 16px var(--qp-accent);
  font-weight: 700;
  letter-spacing: 0.04em;
}
`
  },
  'high-contrast': {
    font: "system-ui, 'Segoe UI', Arial, sans-serif",
    radius: '0',
    extra: `
/* Not a mood — the preset for anyone who needs the page to stop being subtle. Everything is
   larger, every edge is 3px, and nothing relies on a tint to carry meaning. */
.qwiz-welcome,
.qwiz-card,
.qwiz-results,
.qwiz-option {
  border-width: 3px;
}
.qwiz-title {
  font-size: 2.25rem;
}
.qwiz-question-text {
  font-size: 1.5rem;
  font-weight: 700;
}
.qwiz-option {
  font-size: 1.15rem;
  padding: 1rem;
}
.qwiz-description,
.qwiz-rules,
.qwiz-rules li,
.qwiz-progress,
.qwiz-score {
  font-size: 1rem;
}
.qwiz-start,
.qwiz-submit,
.qwiz-next {
  font-size: 1.05rem;
  font-weight: 700;
  padding: 0.6rem 1.5rem;
}
`
  },
  terminal: {
    font: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    radius: '0',
    extra: `
.qwiz-title::before {
  color: var(--qp-border);
  content: '$ ';
}
.qwiz-question-text {
  border-left: 3px solid var(--qp-border);
  padding: 0.75rem 1rem;
}
.qwiz-option {
  border-style: dashed;
}
.qwiz-option input {
  display: none;
}
.qwiz-option-label::before {
  content: '[ ] ';
}
.qwiz-option--selected .qwiz-option-label::before {
  content: '[x] ';
}
.qwiz-option--correct .qwiz-option-label::before {
  content: '[\\2713] ';
}
.qwiz-option--wrong .qwiz-option-label::before {
  content: '[\\00d7] ';
}
`
  }
};

/** A preset's stylesheet, or `''` for `none` and for any id we don't ship — an unknown preset plays
 * in the visitor's own theme rather than failing, since a quiz naming a preset from a newer version
 * of Qwiz is a thing that will happen. */
export function playPresetCss(id: string | undefined): string {
  if (!id) return '';
  const roles = PRESET_ROLES[id];
  const shape = SHAPES[id];
  return roles && shape ? stylesheet(roles, shape) : '';
}
