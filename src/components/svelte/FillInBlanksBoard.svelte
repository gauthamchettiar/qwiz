<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import type { QuizScriptOption } from '@/lib/utils/quizScript';

  // Presentation-only fill_in_blanks board: the question text split on "___" with an interactive
  // blank widget dropped in at each split point — all fill/pick logic lives in the caller
  // (QuestionPlayer.svelte), same division of responsibility as OrderBoard.svelte/etc. In
  // `mode="bank"`, blanks are picked-and-placed the same tap-then-tap way as order/match/
  // categorise; in `mode="type"` each blank is a plain inline text input, no bank involved.
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
    onTypeBlank
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
  } = $props();

  const segments = $derived(text.split('___'));
  const usedTexts = $derived(new Set(blankAnswers.filter((a) => a !== '')));

  function isBlankCorrect(blankIndex: number): boolean {
    const answer = answerOptions[blankIndex];
    const expected = answer?.content.kind === 'text' ? answer.content.text : '';
    return blankAnswers[blankIndex] !== '' && blankAnswers[blankIndex] === expected;
  }
</script>

<div class="space-y-3">
  <p class="whitespace-pre-wrap text-base font-medium text-slate-900">
    {#each segments as segment, i (i)}
      {segment}
      {#if i < segments.length - 1}
        {#if mode === 'type'}
          <input
            class="mx-0.5 w-28 rounded-md border border-slate-300 px-1.5 py-0.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none disabled:bg-slate-100 {locked &&
            revealAnswers
              ? isBlankCorrect(i)
                ? 'border-green-400 bg-green-50'
                : 'border-red-400 bg-red-50'
              : ''}"
            value={blankAnswers[i] ?? ''}
            disabled={locked}
            oninput={(e) => onTypeBlank(i, e.currentTarget.value)}
            aria-label={`Blank ${i + 1}`}
          />
        {:else}
          <button
            type="button"
            class="mx-0.5 inline-flex min-w-16 items-center gap-1 rounded-md border px-2 py-0.5 align-middle text-sm transition-colors disabled:cursor-not-allowed {picked !==
            null
              ? 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50'
              : blankAnswers[i]
                ? 'border-slate-300 bg-slate-50'
                : 'border-dashed border-slate-300'} {locked && revealAnswers && blankAnswers[i]
              ? isBlankCorrect(i)
                ? 'border-green-400 bg-green-50'
                : 'border-red-400 bg-red-50'
              : ''}"
            disabled={locked}
            onclick={() => onClickBlank(i)}
          >
            {blankAnswers[i] || '___'}
            {#if locked && revealAnswers && blankAnswers[i]}
              {#if isBlankCorrect(i)}
                <CircleCheck size={13} class="shrink-0 text-green-600" />
              {:else}
                <CircleX size={13} class="shrink-0 text-red-500" />
              {/if}
            {/if}
          </button>
        {/if}
      {/if}
    {/each}
  </p>

  {#if mode === 'bank'}
    <div class="space-y-1.5">
      <p class="text-xs font-medium text-slate-500">
        {picked !== null ? 'Tap a blank above to place it' : 'Tap a word to pick it up'}
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each bankOrder as optionIndex (optionIndex)}
          {@const optionText =
            options[optionIndex].content.kind === 'text' ? options[optionIndex].content.text : ''}
          {@const used = usedTexts.has(optionText)}
          <button
            type="button"
            class="rounded-md border p-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 {picked ===
            optionIndex
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-slate-300 bg-white hover:bg-slate-50'}"
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
