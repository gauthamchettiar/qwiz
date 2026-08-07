<script lang="ts">
  import { highlightCss, highlightQwiz, TOKEN_CLASS } from '@/lib/utils/qwizHighlight';

  // A `.qwiz` source editor with syntax highlighting, used by both the whole-document editor and
  // a question card's code mode.
  //
  // A real `<textarea>` with a highlighted `<pre>` layered UNDER it, the textarea's own text made
  // transparent so only its caret and selection show through. Not a contenteditable and not an
  // editor library: this keeps native undo/redo, IME composition, spellcheck, autofill and mobile
  // text selection for free, all of which a bespoke editor has to reimplement badly.
  //
  // The two layers must occupy identical space to the pixel, or the caret drifts away from the
  // glyphs beneath it. Everything that affects text metrics is therefore set once, on both, from
  // the same string (`LAYER`) — font, size, line height, padding, wrapping, tab size. The
  // tokenizer's concatenation invariant (see qwizHighlight.ts) is the other half of that contract.
  //
  // The textarea is `block` for the same reason and it is not cosmetic: a textarea defaults to
  // `inline-block`, which sits on a text baseline and leaves ~6px of descender space beneath it in
  // the wrapper. That made the wrapper — and so the `inset-0` highlight layer — six pixels taller
  // than the textarea, giving the two different scrollable ranges; the browser then clamped the
  // layer's scrollTop short of the textarea's and the highlighting drifted a few pixels out of
  // register at the bottom of a long document.
  let {
    value,
    ariaLabel,
    rows = 12,
    fill = false,
    language = 'qwiz',
    onInput,
    onCaretLine
  }: {
    value: string;
    ariaLabel: string;
    rows?: number;
    /** Which tokenizer to highlight with. `css` is for a quiz's theme, which is a CSS document
     * rather than a `.qwiz` one — same editor, same caret-alignment contract, different grammar. */
    language?: 'qwiz' | 'css';
    /** Fill the parent's height at `xl:` instead of being sized by `rows`, for the split view
     * where the editor and its preview share one height. Deliberately a responsive class rather
     * than a plain one: below `xl:` there's no preview and no height to fill, so the editor falls
     * back to `rows` and stays user-resizable. */
    fill?: boolean;
    onInput: (next: string) => void;
    /** Fires with the 1-based line the caret sits on, whenever it moves. Used by the split
     * preview to follow along; omit it and nothing tracks the caret. */
    onCaretLine?: (line: number) => void;
  } = $props();

  const LAYER =
    'w-full px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap break-words [tab-size:2]';

  let textarea: HTMLTextAreaElement | undefined = $state();
  const lines = $derived(language === 'css' ? highlightCss(value) : highlightQwiz(value));

  /** Puts the caret at the very start. Called on mount rather than left to the browser, which
   * restores the end of the text — landing an author at the bottom of a document they've just
   * opened to read from the top. */
  export function focusStart() {
    textarea?.focus();
    textarea?.setSelectionRange(0, 0);
    if (textarea) textarea.scrollTop = 0;
    reportCaret();
  }

  function reportCaret() {
    if (!textarea || !onCaretLine) return;
    // Lines before the caret, counted in the source itself — a visual/wrapped line count would
    // mean something different and wouldn't map to a question.
    onCaretLine(value.slice(0, textarea.selectionStart).split('\n').length);
  }

  let highlight: HTMLPreElement | undefined = $state();

  /** Keeps the highlighted layer registered with the textarea as it scrolls.
   *
   * Sets `scrollTop`/`scrollLeft` on the layer rather than translating it, which is what this did
   * first and which was wrong twice over. A transform moves the ELEMENT, so its content leaves the
   * box meant to clip it and paints over whatever sits above and below the editor; and because the
   * layer is `inset-0` it's only ever as tall as the VISIBLE box, so every line past the first
   * screenful had nothing to render into and came out blank. Scrolling an `overflow-hidden`
   * element — which is allowed programmatically, it just can't be done by the user — has neither
   * problem: the content is all present, and the clip stays where it is.
   *
   * Assigned imperatively rather than through reactive state because it has to land in the same
   * frame as the textarea's own scroll; a round trip through Svelte's scheduler shows as the
   * highlight lagging a fast scroll by a line or two. */
  function syncScroll(e: Event) {
    const ta = e.currentTarget as HTMLTextAreaElement;
    if (!highlight) return;
    highlight.scrollTop = ta.scrollTop;
    highlight.scrollLeft = ta.scrollLeft;
  }
</script>

<!-- The surface lives on this wrapper, not on the textarea: a background on the textarea
     would paint over the highlighted layer beneath it. -->
<div class="relative rounded-md bg-surface {fill ? 'xl:h-full' : ''}">
  <!-- aria-hidden: this is a visual copy of text the textarea already exposes. -->
  <pre
    bind:this={highlight}
    aria-hidden="true"
    class="{LAYER} pointer-events-none absolute inset-0 overflow-hidden rounded-md border border-transparent">{#each lines as tokens, i (i)}<span
        class="block min-h-5"
        >{#each tokens as token, j (j)}<span class={TOKEN_CLASS[token.kind]}>{token.text}</span
          >{/each}</span
      >{/each}</pre>

  <textarea
    bind:this={textarea}
    class="{LAYER} relative block resize-y rounded-md border border-line bg-transparent text-transparent caret-ink selection:bg-accent-surface-strong focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-subtle {fill
      ? 'xl:h-full xl:resize-none'
      : ''}"
    {rows}
    {value}
    aria-label={ariaLabel}
    spellcheck="false"
    oninput={(e) => onInput(e.currentTarget.value)}
    onscroll={syncScroll}
    onkeyup={reportCaret}
    onclick={reportCaret}
    onselect={reportCaret}></textarea>
</div>
