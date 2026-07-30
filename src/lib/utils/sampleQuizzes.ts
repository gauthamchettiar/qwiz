import { parseQwizFile } from './quizScript';

/** The example `.qwiz` documents offered from the Import dialog's "Load a sample" modal, so a new
 * author sees the format in action rather than starting from a blank page.
 *
 * These are real files in `examples/`, not strings embedded here: an example is a `.qwiz` document,
 * so it should BE one — editable in a normal editor, diffable, playable by dropping it straight
 * into the import box, and impossible to drift out of sync with the format through TypeScript
 * escaping. Vite inlines them at build time (`?raw`), so this stays a fully static site with no
 * runtime fetch.
 *
 * Together they exercise every variant, every setting and every media form the parser supports;
 * `sampleQuizzes.test.ts` parses each one and fails the build if any is invalid. */
export interface SampleQuiz {
  title: string;
  description: string;
  code: string;
}

// Eager + `?raw` so the contents are bundled as plain strings rather than fetched at runtime.
// Sorted by filename, which is why they're numbered — the dialog lists them in that order.
const files = import.meta.glob('/examples/*.qwiz', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

export const sampleQuizzes: SampleQuiz[] = Object.keys(files)
  .sort()
  .map((path) => {
    const code = files[path];
    // Title and description come from the document's own frontmatter rather than being repeated
    // here, so an example can never be listed under a name it doesn't actually have.
    const { frontmatter } = parseQwizFile(code);
    return { title: frontmatter.title, description: frontmatter.description, code };
  });
