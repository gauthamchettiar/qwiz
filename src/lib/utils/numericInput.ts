/** Keeps a free-text field numeric, for the points fields in the question form.
 *
 * Why not `<input type="number">`, which enforces this for free: it comes with stepper arrows that
 * can't be removed without vendor-prefixed `appearance` CSS, and they're worse than useless on a
 * points field — two tiny hit targets nobody nudges a score with, eating horizontal room in a row
 * that's already tight on a phone. It also reports an empty string for ANY invalid content
 * (`"1e"`, `"--"`), so the form can't tell "cleared the field" from "typed something odd" and
 * silently loses the value either way.
 *
 * Filtering the text as it's typed keeps the field a plain text input, and keeps what the author
 * sees identical to what the form holds.
 */

/** `raw` reduced to the longest leading run that's still a valid (or still-being-typed) number.
 *
 * Accepts what a number legitimately looks like MID-TYPING as well as when finished: a lone `-`
 * and a trailing `.` are both kept, since "-" is the first keystroke of every negative number and
 * "1." of every decimal — rejecting them would make those untypeable. `Number('')`/`Number('-')`
 * are handled by the callers, which already treat a blank points field as "no explicit weight".
 *
 * Anything else is dropped rather than the whole edit being rejected, so pasting "12 pts" leaves
 * "12" instead of leaving the field unchanged with no explanation.
 */
export function sanitizeNumericInput(raw: string): string {
  let out = '';
  let seenDot = false;
  for (const char of raw) {
    // Only ever leading: "1-2" isn't a number being typed, it's two of them.
    if (char === '-') {
      if (out.length === 0) out += char;
      continue;
    }
    if (char === '.') {
      if (seenDot) continue;
      seenDot = true;
      out += char;
      continue;
    }
    if (char >= '0' && char <= '9') out += char;
  }
  return out;
}
