<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import type { QuizScriptOption } from '@/lib/utils/quizScript';
  import { draggable, type DragState } from '@/lib/utils/dragDrop';

  // Presentation-only fill_in_blanks board: the question text split on "___" with an interactive
  // blank widget dropped in at each split point — all fill/pick logic lives in the caller
  // (QuestionPlayer.svelte), same division of responsibility as OrderBoard.svelte/etc. In
  // `mode="bank"`, blanks are picked-and-placed the same tap-then-tap way as order/match/
  // categorise (or dragged — see lib/utils/dragDrop.ts); in `mode="type"` each blank is a plain
  // inline text input, no bank involved.
  //
  // Two drop groups rather than one, because the two directions move different things: a BANK WORD
  // is dragged onto a blank (`WORD_GROUP`, whose zones are blank indices), while a FILLED BLANK is
  // dragged back onto the bank to empty it (`BLANK_GROUP`, whose only zone is the bank itself). One
  // group would make a blank both a valid source and a valid target for itself, and the two carry
  // unrelated ids — an option index versus a blank index.
  //
  // Known limitation: a bank word currently occupying a blank is matched back to its bank button
  // by TEXT (see `usedTexts`/`isBankIndexUsed`), not by original index — two distractor options
  // sharing identical text would both show "used" once only one is actually placed. Rare enough
  // in practice not to be worth tracking a multiset for; grading itself is unaffected either way
  // (see `gradeFillInBlanksQuestion`, which only ever compares text).
  let {
    text,
    options,
    bankOrder,
    blankAnswers,
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
    /** One entry per blank, in left-to-right order — the literal text currently filling it, or
     * `''` while empty. */
    blankAnswers: string[];
    /** The blank-answer options, in blank order — used to check correctness once locked. */
    answerOptions: QuizScriptOption[];
    /** bank mode only: the original option index of the bank word currently picked up. */
    picked: number | null;
    mode: 'bank' | 'type';
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
  const usedTexts = $derived(new Set(blankAnswers.filter((a) => a !== '')));

  let wordDrag = $state<DragState | null>(null);
  let blankDrag = $state<DragState | null>(null);
  const placing = $derived(picked !== null || wordDrag !== null);

  /** A blank's border+background as a SINGLE mutually-exclusive class string — see
   * QuestionPlayer's `choiceOptionTone` for why a "base plus reveal override" pair of class strings
   * silently resolves the wrong way. */
  function blankTone(blankIndex: number): string {
    if (locked && revealAnswers && blankAnswers[blankIndex]) {
      return isBlankCorrect(blankIndex)
        ? 'border-green-400 bg-green-50'
        : 'border-red-400 bg-red-50';
    }
    if (wordDrag?.overZone === blankIndex) {
      return 'border-indigo-500 bg-indigo-100 ring-2 ring-indigo-200';
    }
    if (placing) return 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50';
    if (blankAnswers[blankIndex]) return 'border-slate-300 bg-slate-50';
    return 'border-dashed border-slate-300';
  }

  /** Same, for `blank_input=type`'s inline text inputs. */
  function typedBlankTone(blankIndex: number): string {
    if (locked && revealAnswers) {
      return isBlankCorrect(blankIndex)
        ? 'border-green-400 bg-green-50'
        : 'border-red-400 bg-red-50';
    }
    return 'border-slate-300 focus:border-slate-400 disabled:bg-slate-100';
  }

  function isBlankCorrect(blankIndex: number): boolean {
    const answer = answerOptions[blankIndex];
    const expected = answer?.content.kind === 'text' ? answer.content.text : '';
    return blankAnswers[blankIndex] !== '' && blankAnswers[blankIndex] === expected;
  }
</script>

<div class="space-y-3">
  <!-- Segment and blank written tight against each other (no line break between `{segment}` and the
       `{#if}`): template whitespace becomes real whitespace in the output, which under
       `whitespace-pre-wrap` showed up as a stray space before the sentence's own punctuation
       ("...of the cell ."). The authored text already carries whatever spacing it needs. -->
  <p class="whitespace-pre-wrap text-base font-medium text-slate-900">
    {#each segments as segment, i (i)}{segment}{#if i < segments.length - 1}
        {#if mode === 'type'}
          <input
            class="mx-0.5 w-28 rounded-md border px-1.5 py-0.5 text-sm text-slate-900 focus:outline-none {typedBlankTone(
              i
            )}"
            value={blankAnswers[i] ?? ''}
            disabled={locked}
            oninput={(e) => onTypeBlank(i, e.currentTarget.value)}
            aria-label={`Blank ${i + 1}`}
          />
        {:else}
          <button
            type="button"
            data-drop-group={WORD_GROUP}
            data-drop-zone={i}
            use:draggable={{
              id: i,
              group: BLANK_GROUP,
              disabled: locked || !blankAnswers[i],
              onDragChange: (state) => (blankDrag = state),
              onDrop: onDropBlankBack
            }}
            class="mx-0.5 inline-flex min-w-16 items-center gap-1 rounded-md border px-2 py-0.5 align-middle text-sm transition-colors disabled:cursor-not-allowed {blankTone(
              i
            )} {blankDrag?.id === i ? 'opacity-40' : ''}"
            disabled={locked}
            onclick={() => onClickBlank(i)}
            aria-label={blankAnswers[i]
              ? `Blank ${i + 1}, filled with ${blankAnswers[i]}`
              : `Blank ${i + 1}, empty`}
          >
            <!-- The visible face is the word (or "___"), but the accessible NAME is the aria-label
                 above: "underscore underscore underscore, button" tells a screen reader user
                 nothing about which blank they're on or whether it's already answered. Matches how
                 `blank_input=type` labels its inputs "Blank N". -->
            {blankAnswers[i] || '___'}
            {#if locked && revealAnswers && blankAnswers[i]}
              {#if isBlankCorrect(i)}
                <CircleCheck size={13} class="shrink-0 text-green-600" />
              {:else}
                <CircleX size={13} class="shrink-0 text-red-500" />
              {/if}
            {/if}
          </button>
        {/if}{/if}{/each}
  </p>

  {#if mode === 'bank'}
    <!-- Also a drop zone, so a filled blank can be dragged back here to empty it. -->
    <div
      data-drop-group={BLANK_GROUP}
      data-drop-zone={SOURCE_ZONE}
      class="space-y-1.5 rounded-md border border-dashed p-2 transition-colors {blankDrag?.overZone ===
      SOURCE_ZONE
        ? 'border-indigo-400 bg-indigo-50'
        : 'border-transparent'}"
    >
      <p class="text-xs font-medium text-slate-500">
        {placing ? 'Drop it on a blank above, or tap one' : 'Tap a word to pick it up, or drag it'}
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each bankOrder as optionIndex (optionIndex)}
          {@const optionText =
            options[optionIndex].content.kind === 'text' ? options[optionIndex].content.text : ''}
          {@const used = usedTexts.has(optionText)}
          <button
            type="button"
            use:draggable={{
              id: optionIndex,
              group: WORD_GROUP,
              disabled: locked || used,
              onDragChange: (state) => (wordDrag = state),
              onDrop: onDropWord
            }}
            class="rounded-md border p-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 {picked ===
            optionIndex
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-slate-300 bg-white hover:bg-slate-50'} {wordDrag?.id === optionIndex
              ? 'opacity-40'
              : ''}"
            disabled={locked || used}
            onclick={() => onPickBankWord(optionIndex)}
            aria-pressed={picked === optionIndex}
          >
            {optionText}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
