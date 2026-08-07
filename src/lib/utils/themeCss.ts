/** What a quiz's own styling is allowed to do, and to whom.
 *
 * A quiz can be played with a look of its author's choosing. That look has two ingredients, and
 * they are trusted very differently:
 *
 *   - a PRESET, named by the file (`theme: arcade`). The stylesheet is this app's own — see
 *     `lib/themes/playPresets.ts` — so a `.qwiz` naming one carries no code, and it applies with
 *     nothing asked of the player.
 *   - `theme-css:`, which is whatever the author typed. That is arbitrary CSS about to run in this
 *     app's origin: it can beacon behaviour (`background-image: url(…)` fires when its selector
 *     matches, so `:has()`/`:checked` selectors can report what a player picked) and it can cover
 *     or fake the app's own chrome. CSS cannot read `localStorage`, but that is small comfort. So
 *     it runs only when the player says so, and a quiz they wrote themselves never asks.
 *
 * This module is small on purpose. An earlier version parsed and filtered theme CSS down to colour
 * tokens, so an untrusted theme could be partly applied; that made sense while a theme WAS 53
 * colours. Once a theme also moves and resizes things, a filtered stylesheet renders as a broken
 * page rather than a safe one, and "apply it or don't" is the only honest question left.
 */

/** Whether this visitor has agreed to run the CSS a quiz's author wrote. See `Quiz.themeTrust`. */
export type ThemeTrust = 'none' | 'full';

/** The stylesheet to apply for a quiz, or `null` for "leave the visitor's own theme alone".
 *
 * The whole trust model in one function, so the decision lives somewhere testable rather than
 * spread across a component's conditionals. Two ingredients, treated very differently:
 *
 *   - the PRESET is this app's own CSS, named by the file rather than carried in it. There is
 *     nothing in a name to distrust, so it always applies.
 *   - `themeCss` is whatever the author typed. It runs only on an explicit `full`, and `undefined`
 *     means nobody has been asked yet — which applies nothing, because applying it before the
 *     question is answered would make the question rhetorical.
 *
 * There is no middle setting. When a theme was 53 colour tokens, "colours only" was a graceful
 * degradation; now that it also moves and resizes things, a half-applied stylesheet looks broken
 * rather than safe.
 */
export function resolveThemeCss(
  presetCss: string,
  themeCss: string | undefined,
  trust: ThemeTrust | undefined
): string | null {
  const custom = trust === 'full' && themeCss && themeCss.trim() !== '' ? themeCss : '';
  const combined = [presetCss.trim(), custom.trim()].filter((part) => part !== '').join('\n\n');
  return combined === '' ? null : combined;
}

/** True when a quiz carries CSS its author wrote and nobody has been asked about it yet — what the
 * welcome screen's prompt keys off. A preset alone never triggers this. */
export function needsThemeDecision(themeCss: string | undefined, trust: ThemeTrust | undefined) {
  return Boolean(themeCss && themeCss.trim() !== '' && !trust);
}
