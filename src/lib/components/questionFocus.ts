/** What a view-mode click on a question region requests the form editor focus. Shared between
 * `QuestionView` (produces it) and `QuestionForm` (consumes it) so neither imports the other. */
export type FocusTarget =
  | { field: 'text' }
  | { field: 'media'; index: number }
  | { field: 'option'; index: number }
  | { field: 'extra'; index: number }
  | { field: 'settings' };
