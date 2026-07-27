<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import type { QuizScriptOption } from '@/lib/utils/quizScript';
  import OptionContent from './OptionContent.svelte';

  // Presentation-only match board: two columns, left items and right targets — all pairing logic
  // lives in the caller (QuestionPlayer.svelte), same division of responsibility as
  // CharacterBank.svelte/OrderBoard.svelte. Every item is a plain `<button>`, so this is fully
  // keyboard-operable via Tab + Enter/Space with no bespoke key handling.
  //
  // Each option's OWN index doubles as its one right-column entry (that option's `.target` is
  // what's shown there) — so a pair is correct iff `pairs.get(i) === i`, and that's checked
  // identically for both columns (see `isCorrect` below).
  let {
    options,
    leftOrder,
    rightOrder,
    pairs,
    picked,
    locked = false,
    revealAnswers = false,
    onPickLeft,
    onClickRight
  }: {
    options: QuizScriptOption[];
    /** Display order for the left column, as indices into `options`. */
    leftOrder: number[];
    /** Display order for the right column, as indices into `options` — each index's own
     * `.target` is what's rendered there. */
    rightOrder: number[];
    /** This run's pairing so far: left option index -> right option index. */
    pairs: ReadonlyMap<number, number>;
    /** The left option index currently picked up, awaiting a right-column target — `null` if none. */
    picked: number | null;
    locked?: boolean;
    /** Whether to show per-pair correct/incorrect styling — only meaningful once `locked`. */
    revealAnswers?: boolean;
    onPickLeft: (leftIndex: number) => void;
    onClickRight: (rightIndex: number) => void;
  } = $props();

  function isCorrect(index: number): boolean {
    return pairs.get(index) === index;
  }
</script>

<div class="grid grid-cols-2 gap-3">
  <div class="space-y-1.5">
    {#each leftOrder as leftIndex (leftIndex)}
      {@const paired = pairs.has(leftIndex)}
      <button
        type="button"
        class="w-full rounded-md border p-2.5 text-left transition-colors disabled:cursor-not-allowed {picked ===
        leftIndex
          ? 'border-indigo-400 bg-indigo-50'
          : paired
            ? 'border-slate-300 bg-slate-50'
            : 'border-slate-200 hover:bg-slate-50'} {locked && revealAnswers && paired
          ? isCorrect(leftIndex)
            ? 'border-green-400 bg-green-50'
            : 'border-red-400 bg-red-50'
          : ''}"
        disabled={locked}
        onclick={() => onPickLeft(leftIndex)}
        aria-pressed={picked === leftIndex}
      >
        <div class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <OptionContent content={options[leftIndex].content} />
          </div>
          {#if locked && revealAnswers && paired}
            {#if isCorrect(leftIndex)}
              <CircleCheck size={16} class="shrink-0 text-green-600" />
            {:else}
              <CircleX size={16} class="shrink-0 text-red-500" />
            {/if}
          {/if}
        </div>
      </button>
    {/each}
  </div>
  <div class="space-y-1.5">
    {#each rightOrder as rightIndex (rightIndex)}
      {@const used = [...pairs.values()].includes(rightIndex)}
      <button
        type="button"
        class="w-full rounded-md border p-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed {picked !==
        null
          ? 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50'
          : used
            ? 'border-slate-300 bg-slate-50'
            : 'border-slate-200 hover:bg-slate-50'} {locked && revealAnswers && used
          ? isCorrect(rightIndex)
            ? 'border-green-400 bg-green-50'
            : 'border-red-400 bg-red-50'
          : ''}"
        disabled={locked}
        onclick={() => onClickRight(rightIndex)}
      >
        {options[rightIndex].target}
      </button>
    {/each}
  </div>
</div>
