/** Whether a quiz's own styling is currently applied to the page.
 *
 * **The app's first piece of cross-island state.** Every route until now hydrated exactly one
 * top-level island, so nothing needed sharing; this is the exception CLAUDE.md §4 anticipated, and
 * it takes the shape that file prescribes — a rune-backed module both islands import — rather than
 * DOM inspection or custom events between them. `QuizPlayer` writes it, the `ThemePicker` in the
 * header reads it, and neither knows the other exists.
 *
 * It exists because the two controls genuinely conflict. The header's theme picker sets the app's
 * colour tokens; a quiz's stylesheet sets whatever its author wanted, usually including colours.
 * Changing the first mid-run doesn't layer on top of the second, it fights it — half the page
 * follows the new theme and half stays in the quiz's, which reads as a rendering bug rather than
 * as a choice. So while a quiz's look is applied, the picker is disabled and says why.
 */

let active = $state(false);

export const quizTheme = {
  get active() {
    return active;
  },
  set active(next: boolean) {
    active = next;
  }
};
