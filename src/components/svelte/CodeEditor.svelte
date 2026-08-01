<script lang="ts">
  import { highlightQwiz, TOKEN_CLASS } from '@/lib/utils/qwizHighlight';

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
  let {
    value,
    ariaLabel,
    rows = 12,
    onInput,
    onCaretLine
  }: {
    value: string;
    ariaLabel: string;
    rows?: number;
    onInput: (next: string) => void;
    /** Fires with the 1-based line the caret sits on, whenever it moves. Used by the split
     * preview to follow along; omit it and nothing tracks the caret. */
    onCaretLine?: (line: number) => void;
  } = $props();

  const LAYER =
    'w-full px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap break-words [tab-size:2]';

  let textarea: HTMLTextAreaElement | undefined = $state();
  const lines = $derived(highlightQwiz(value));

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

  // The highlighted layer doesn't scroll on its own; it's moved to match the textarea so the two
  // stay registered when the content is taller than the box.
  let scrollTop = $state(0);
  let scrollLeft = $state(0);
</script>

<!-- The surface lives on this wrapper, not on the textarea: a background on the textarea
     would paint over the highlighted layer beneath it. -->
<div class="relative rounded-md bg-surface">
  <!-- aria-hidden: this is a visual copy of text the textarea already exposes. -->
  <pre
    aria-hidden="true"
    class="{LAYER} pointer-events-none absolute inset-0 overflow-hidden rounded-md border border-transparent"
    style="transform: translate({-scrollLeft}px, {-scrollTop}px)">{#each lines as tokens, i (i)}<span
        class="block min-h-5"
        >{#each tokens as token, j (j)}<span class={TOKEN_CLASS[token.kind]}>{token.text}</span
          >{/each}</span
      >{/each}</pre>

  <textarea
    bind:this={textarea}
    class="{LAYER} relative resize-y rounded-md border border-line bg-transparent text-transparent caret-ink selection:bg-accent-surface-strong focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-subtle"
    {rows}
    {value}
    aria-label={ariaLabel}
    spellcheck="false"
    oninput={(e) => onInput(e.currentTarget.value)}
    onscroll={(e) => {
      scrollTop = e.currentTarget.scrollTop;
      scrollLeft = e.currentTarget.scrollLeft;
    }}
    onkeyup={reportCaret}
    onclick={reportCaret}
    onselect={reportCaret}></textarea>
</div>
