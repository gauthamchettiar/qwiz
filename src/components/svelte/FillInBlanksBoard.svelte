<script lang="ts">
  import { CircleCheck, CircleX, GripVertical } from '@lucide/svelte';
  import { optionContentKey, optionLabelText, type QuizScriptOption } from '@/lib/utils/quizScript';
  import { draggable, type DragState } from '@/lib/utils/dragDrop';
  import OptionContent from './OptionContent.svelte';

  // Presentation-only fill_blanks board: the question text split on "___" with an interactive
  // blank widget dropped in at each split point — all fill/pick logic lives in the caller
  // (QuestionPlayer.svelte), same division of responsibility as OrderBoard.svelte/etc. In
  // `mode="pick"`, blanks are picked-and-placed the same tap-then-tap way as order/match/
  // group_items (or dragged — see lib/utils/dragDrop.ts); in `mode="type"` each blank is a plain
  // inline text input, no bank involved.
  //
  // Two drop groups rather than one, because the two directions move different things: a BANK WORD
  // is dragged onto a blank (`WORD_GROUP`, whose zones are blank indices), while a FILLED BLANK is
  // dragged back onto the bank to empty it (`BLANK_GROUP`, whose only zone is the bank itself). One
  // group would make a blank both a valid source and a valid target for itself, and the two carry
  // unrelated ids — an option index versus a blank index.
  //
  // A bank word is tracked by its original OPTION INDEX (`blankPicks`), not by the text it happens
  // to show. That's what lets a word be a picture, and it also makes "which bank buttons are used
  // up" exact for two words spelled the same — matching back by text could only ever guess, and
  // used to mark both of them used when one was placed.
  let {
    text,
    options,
    bankOrder,
    blankAnswers,
    blankPicks,
    answerOptions,
    picked,
    mode,
    locked = false,
    revealAnswers = false,
    onPickBankWord,
    onClickBlank,
    onTypeBlank,
    onDropWord,
    onDropBlankBack
  }: {
    text: string;
    options: QuizScriptOption[];
    /** Display order for the word bank (bank mode only), as indices into `options`. */
    bankOrder: number[];
    /** `mode="type"` only: one entry per blank, in left-to-right order — the text typed there. */
    blankAnswers: string[];
    /** `mode="pick"` only: one entry per blank, in left-to-right order — the original option index
     * of the bank word placed there, or `null` while empty. */
    blankPicks: (number | null)[];
    /** The blank-answer options, in blank order — used to check correctness once locked. */
    answerOptions: QuizScriptOption[];
    /** bank mode only: the original option index of the bank word currently picked up. */
    picked: number | null;
    mode: 'pick' | 'type';
    locked?: boolean;
    revealAnswers?: boolean;
    onPickBankWord: (optionIndex: number) => void;
    onClickBlank: (blankIndex: number) => void;
    onTypeBlank: (blankIndex: number, value: string) => void;
    /** A dragged bank word released on blank `blankIndex`. */
    onDropWord: (optionIndex: number, blankIndex: number) => void;
    /** A dragged filled blank released on the word bank (`SOURCE_ZONE`), emptying it. */
    onDropBlankBack: (blankIndex: number, zone: number) => void;
  } = $props();

  const WORD_GROUP = 'fib-word';
  const BLANK_GROUP = 'fib-blank';
  const SOURCE_ZONE = -1;

  const segments = $derived(text.split('___'));
  const usedOptions = $derived(new Set(blankPicks.filter((p) => p !== null)));

  /** The option currently sitting in blank `i`, or `null` while it's empty. */
  function placedIn(blankIndex: number): QuizScriptOption | null {
    const optionIndex = blankPicks[blankIndex];
    return optionIndex === null || optionIndex === undefined
      ? null
      : (options[optionIndex] ?? null);
  }

  let wordDrag = $state<DragState | null>(null);
  let blankDrag = $state<DragState | null>(null);
  const placing = $derived(picked !== null || wordDrag !== null);

  /** Locked AND revealing — gates both the green/red tinting and the answer key beside it. */
  const showing = $derived(locked && revealAnswers);

  /** A blank's border+background as a SINGLE mutually-exclusive class string — see
   * QuestionPlayer's `choiceOptionTone` for why a "base plus reveal override" pair of class strings
   * silently resolves the wrong way. */
  function blankTone(blankIndex: number): string {
    const filled = placedIn(blankIndex) !== null;
    if (showing && filled) {
      return isBlankCorrect(blankIndex)
        ? 'border-positive-line bg-positive-surface'
        : 'border-negative-line bg-negative-surface';
    }
    if (wordDrag?.overZone === blankIndex) {
      return 'border-accent-line-strong bg-accent-surface-strong ring-2 ring-accent-line-faint';
    }
    if (placing) return 'border-accent-line-subtle bg-accent-surface/50 hover:bg-accent-surface';
    if (filled) return 'border-line bg-surface';
    return 'border-dashed border-line';
  }

  /** Same, for `answer_mode=type`'s inline text inputs. */
  function typedBlankTone(blankIndex: number): string {
    if (showing) {
      return isBlankCorrect(blankIndex)
        ? 'border-positive-line bg-positive-surface'
        : 'border-negative-line bg-negative-surface';
    }
    return 'border-line focus:border-line-strong disabled:bg-surface-hover';
  }

  /** The words this blank was authored to hold — what the review screen reveals for one the player
   * got wrong or never filled in, and what a `mode="type"` blank is matched against. A picture
   * answer contributes its alt text, the only words it has (see `optionLabelText`). */
  function expectedText(blankIndex: number): string {
    const answer = answerOptions[blankIndex];
    return answer ? optionLabelText(answer) : '';
  }

  /** Display only, but through the same `optionContentKey` grading compares by
   * (`gradeFillInBlanksQuestion`) rather than a second rule that could drift from it: what the
   * placed word IS decides, not which button it came from, so two bank words spelled the same are
   * interchangeable to a player who cannot tell them apart. */
  function isBlankCorrect(blankIndex: number): boolean {
    if (mode === 'type') {
      return (
        blankAnswers[blankIndex] !== '' && blankAnswers[blankIndex] === expectedText(blankIndex)
      );
    }
    const placed = placedIn(blankIndex);
    const answer = answerOptions[blankIndex];
    if (!placed || !answer) return false;
    return optionContentKey(placed.content) === optionContentKey(answer.content);
  }
</script>

<div class="space-y-3">
  <!-- Segment and blank written tight against each other (no line break between `{segment}` and the
       `{#if}`): template whitespace becomes real whitespace in the output, which under
       `whitespace-pre-wrap` showed up as a stray space before the sentence's own punctuation
       ("...of the cell ."). The authored text already carries whatever spacing it needs. -->
  <p class="whitespace-pre-wrap text-base font-medium text-ink">
    {#each segments as segment, i (i)}{segment}{#if i < segments.length - 1}
        {#if mode === 'type'}
          <!-- Field and its revealed answer share one inline-flex wrapper so the answer can never
               introduce whitespace into the sentence's own running text (see the comment on this
               <p>) — the gap between them is layout, not a text node. -->
          <span class="mx-0.5 inline-flex items-baseline gap-1 align-middle">
            <input
              class="w-28 rounded-md border px-1.5 py-0.5 text-sm text-ink focus:outline-none {typedBlankTone(
                i
              )}"
              value={blankAnswers[i] ?? ''}
              disabled={locked}
              oninput={(e) => onTypeBlank(i, e.currentTarget.value)}
              aria-label={showing && !isBlankCorrect(i)
                ? `Blank ${i + 1} — the answer was ${expectedText(i)}`
                : `Blank ${i + 1}`}
            />
            {#if showing && !isBlankCorrect(i)}
              <span class="text-sm font-medium text-positive-ink">{expectedText(i)}</span>
            {/if}
          </span>
        {:else}
          {@const placed = placedIn(i)}
          {@const placedWords = placed ? optionLabelText(placed) : ''}
          <button
            type="button"
            data-drop-group={WORD_GROUP}
            data-drop-zone={i}
            use:draggable={{
              id: i,
              group: BLANK_GROUP,
              disabled: locked || !placed,
              onDragChange: (state) => (blankDrag = state),
              onDrop: onDropBlankBack
            }}
            class="mx-0.5 inline-flex min-w-16 items-center gap-1 rounded-md border px-2 py-0.5 align-middle text-sm transition-colors disabled:cursor-not-allowed {blankTone(
              i
            )} {blankDrag?.id === i ? 'opacity-40' : ''}"
            disabled={locked}
            onclick={() => onClickBlank(i)}
            aria-label={showing && !isBlankCorrect(i)
              ? `Blank ${i + 1}, ${placed ? `filled with ${placedWords}` : 'empty'} — the answer was ${expectedText(i)}`
              : placed
                ? `Blank ${i + 1}, filled with ${placedWords}`
                : `Blank ${i + 1}, empty`}
          >
            <!-- The visible face is the word (or "___"), but the accessible NAME is the aria-label
                 above: "underscore underscore underscore, button" tells a screen reader user
                 nothing about which blank they're on or whether it's already answered. Matches how
                 `answer_mode=type` labels its inputs "Blank N". That aria-label is also what makes
                 the revealed answer below safe to render INSIDE the button — it can't leak into the
                 accessible name — and inside is the only place it can go without putting a stray
                 space into the sentence's running text.
                 A picture sits in the sentence at `max-h-8`, tall enough to recognize and short
                 enough not to break the line it's part of. -->
            {#if placed}
              <span class="inline-block max-h-8 [&_img]:max-h-8">
                <OptionContent content={placed.content} />
              </span>
            {:else}
              ___
            {/if}
            {#if showing && placed}
              {#if isBlankCorrect(i)}
                <CircleCheck size={13} class="shrink-0 text-positive-ink-soft" />
              {:else}
                <CircleX size={13} class="shrink-0 text-negative-ink-soft" />
              {/if}
            {/if}
            {#if showing && !isBlankCorrect(i)}
              <span class="shrink-0 font-medium text-positive-ink">{expectedText(i)}</span>
            {/if}
          </button>
        {/if}{/if}{/each}
  </p>

  {#if mode === 'pick'}
    <!-- Also a drop zone, so a filled blank can be dragged back here to empty it. -->
    <div
      data-drop-group={BLANK_GROUP}
      data-drop-zone={SOURCE_ZONE}
      class="space-y-1.5 rounded-md border border-dashed p-2 transition-colors {blankDrag?.overZone ===
      SOURCE_ZONE
        ? 'border-accent-line bg-accent-surface'
        : 'border-transparent'}"
    >
      <p class="text-xs font-medium text-ink-subtle">
        {placing ? 'Drop it on a blank above, or tap one' : 'Tap a word to pick it up, or drag it'}
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each bankOrder as optionIndex (optionIndex)}
          {@const used = usedOptions.has(optionIndex)}
          <button
            type="button"
            use:draggable={{
              id: optionIndex,
              group: WORD_GROUP,
              disabled: locked || used,
              onDragChange: (state) => (wordDrag = state),
              onDrop: onDropWord
            }}
            class="inline-flex items-center gap-1.5 rounded-md border p-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 {picked ===
            optionIndex
              ? 'border-accent-line bg-accent-surface'
              : 'border-line bg-surface-raised hover:bg-surface'} {wordDrag?.id === optionIndex
              ? 'opacity-40'
              : ''}"
            disabled={locked || used}
            onclick={() => onPickBankWord(optionIndex)}
            aria-pressed={picked === optionIndex}
          >
            <!-- The same grip the other three boards put on their draggable items. Without it, a
                 bank word was the only draggable thing in the app that didn't say so. -->
            {#if !locked && !used}
              <GripVertical size={13} class="shrink-0 text-ink-faint" />
            {/if}
            <!-- Bank pictures are capped shorter than a choice option's (`max-h-56` in
                 OptionContent) so a bank of them stays one scannable strip rather than a column
                 of full-size images. -->
            <span class="[&_img]:max-h-20">
              <OptionContent content={options[optionIndex].content} />
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
