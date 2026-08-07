/** The chosen colour theme, persisted in the visitor's own browser exactly like their quizzes are.
 *
 * The second module allowed to touch `localStorage` (see CLAUDE.md §4). It stays separate from
 * `quizzes.ts` rather than joining it because the two have nothing to do with each other — a theme
 * is a display preference with no schema, no validation beyond "is this a theme we ship", and no
 * failure mode worth surfacing to the user. Merging them would put an unrelated key behind
 * `quizSchema`'s parse-don't-validate contract for no benefit.
 */

const STORAGE_KEY = 'qwiz:theme';

export interface ThemeOption {
  /** Written to `data-theme` on `<html>`, and matched by a selector in global.css. */
  id: string;
  label: string;
  /** Which end of the spectrum this sits at — the picker groups by it, and `system` resolves to
   * one of the two defaults through it. */
  mode: 'light' | 'dark';
}

/** Every theme the app ships, in the order the picker offers them. Adding one here plus a
 * `:root[data-theme='…']` block in global.css is the whole job — no component changes, because
 * every colour in the app is a token that block can override. */
export const THEMES: readonly ThemeOption[] = [
  { id: 'light', label: 'Light', mode: 'light' },
  { id: 'vscode-light', label: 'VS Code Light+', mode: 'light' },
  { id: 'solarized-light', label: 'Solarized Light', mode: 'light' },
  { id: 'gruvbox-light', label: 'Gruvbox Light', mode: 'light' },
  { id: 'dark', label: 'Dark', mode: 'dark' },
  { id: 'vscode-dark', label: 'VS Code Dark+', mode: 'dark' },
  { id: 'solarized-dark', label: 'Solarized Dark', mode: 'dark' },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', mode: 'dark' },
  { id: 'nord', label: 'Nord', mode: 'dark' },
  { id: 'dracula', label: 'Dracula', mode: 'dark' },
  { id: 'monokai', label: 'Monokai', mode: 'dark' },
  { id: 'one-dark', label: 'One Dark', mode: 'dark' },
  { id: 'tokyo-night', label: 'Tokyo Night', mode: 'dark' }
];

/** The themes of one mode, in listed order — the picker groups by this rather than showing one
 * long run, since "is it light or dark" is the first thing anyone is choosing between. */
export function themesByMode(mode: 'light' | 'dark'): ThemeOption[] {
  return THEMES.filter((t) => t.mode === mode);
}

/** Follow the OS. The default, so a visitor who has told their system they prefer dark gets dark
 * without having to find this app's own control. */
export const SYSTEM_THEME = 'system';

export function isKnownTheme(id: string): boolean {
  return id === SYSTEM_THEME || THEMES.some((t) => t.id === id);
}

/** The stored preference, or `system` when there isn't one (or it names a theme we no longer
 * ship — same "drop anything that doesn't match" rule `quizzes.ts` applies to its own records). */
export function readTheme(): string {
  if (typeof window === 'undefined') return SYSTEM_THEME;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && isKnownTheme(stored) ? stored : SYSTEM_THEME;
  } catch {
    return SYSTEM_THEME;
  }
}

/** Returns whether the write landed, same contract as `saveQuiz` — Safari's private mode throws on
 * every write. A caller can ignore it here in a way it can't for a quiz: losing a theme preference
 * costs nothing but re-picking it, so this deliberately doesn't surface an error to the user. */
export function saveTheme(id: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}

/** Resolves `system` to a concrete theme id, and applies it to `<html>`. Exported so both the
 * picker and the pre-paint bootstrap in Base.astro run the identical rule. */
export function applyTheme(id: string): void {
  const resolved =
    id === SYSTEM_THEME
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : id;
  document.documentElement.dataset.theme = resolved;
}

/* --------------------------------------------------------------------------------------------
   A quiz's own styling, while it is being played
   -------------------------------------------------------------------------------------------- */

const QUIZ_THEME_STYLE_ID = 'qwiz-quiz-theme';

/** What `data-theme` is parked on while a quiz's own styling is applied.
 *
 * No stylesheet matches it, and that is the entire point: with the attribute on `nord` or
 * `dracula`, everything the quiz's theme doesn't explicitly declare would keep falling through to
 * whichever theme the VISITOR happens to use, and the same quiz would look different for every
 * player — pieces of Solarized showing through Arcade. Parking it here leaves the `@theme` defaults
 * in global.css as the only thing underneath, which is one fixed baseline for everyone, and the
 * quiz's stylesheet paints over that.
 *
 * It also settles a specificity problem for free: `:root[data-theme='dark']` (0,1,1) outranks a
 * plain `:root` (0,1,0), so a theme setting colour tokens would otherwise lose to the app's own
 * block for every dark-mode visitor and be silently half-applied. */
const QUIZ_THEME_MODE = 'quiz';

/** Applies a quiz's stylesheet, and takes the app's own theme out of the picture while it's up.
 *
 * The CSS is injected verbatim. Deciding whether it's allowed to run at all is the caller's job,
 * and the visitor's decision — see `resolveThemeCss` and `themeTrust`.
 */
export function applyThemeCss(css: string): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(QUIZ_THEME_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = QUIZ_THEME_STYLE_ID;
    // Appended last, so it wins ties against the app's own stylesheet at equal specificity.
    document.head.append(style);
  }
  style.textContent = css;
  document.documentElement.dataset.theme = QUIZ_THEME_MODE;
}

/** Removes a quiz's stylesheet and puts the visitor's own theme back. Called when a play screen
 * unmounts, so leaving a quiz always returns the app to the way they keep it — styling is
 * something you pass through, never something a quiz leaves behind. */
export function clearThemeCss(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(QUIZ_THEME_STYLE_ID)?.remove();
  applyTheme(readTheme());
}
