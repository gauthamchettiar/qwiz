<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import type { QuizScriptOption } from '@/lib/utils/quizScript';
  import OptionContent from './OptionContent.svelte';

  // Presentation-only categorise board: one card per bucket (which can each hold several items,
  // unlike match's 1-to-1 pairing) plus a pool of not-yet-assigned items — all assignment logic
  // lives in the caller (QuestionPlayer.svelte), same division of responsibility as
  // OrderBoard.svelte/MatchBoard.svelte. A bucket's own surface is never itself a `<button>`
  // (nesting the per-item pick-back-up buttons inside it would be invalid HTML) — instead, an
  // explicit "Place here" button appears inside a bucket once something is picked.
  let {
    options,
    itemOrder,
    buckets,
    bucketOrder,
    assignments,
    picked,
    locked = false,
    revealAnswers = false,
    onPickItem,
    onPickItemBackUp,
    onClickBucket
  }: {
    options: QuizScriptOption[];
    /** Display order for the unassigned pool, as indices into `options`. */
    itemOrder: number[];
    /** The distinct bucket labels (see `categoriseBuckets`). */
    buckets: string[];
    /** Display order for the buckets, as indices into `buckets`. */
    bucketOrder: number[];
    /** This run's assignments so far: option index -> bucket index. */
    assignments: ReadonlyMap<number, number>;
    /** The option index currently picked up, awaiting a bucket — `null` if none. */
    picked: number | null;
    locked?: boolean;
    /** Whether to show per-item correct/incorrect styling — only meaningful once `locked`. */
    revealAnswers?: boolean;
    onPickItem: (optionIndex: number) => void;
    onPickItemBackUp: (optionIndex: number) => void;
    onClickBucket: (bucketIndex: number) => void;
  } = $props();

  const poolIndices = $derived(itemOrder.filter((i) => !assignments.has(i)));

  function isCorrect(optionIndex: number): boolean {
    const bucketIndex = assignments.get(optionIndex);
    return bucketIndex !== undefined && buckets[bucketIndex] === options[optionIndex].target;
  }
</script>

<div class="space-y-3">
  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {#each bucketOrder as bucketIndex (bucketIndex)}
      {@const itemsHere = [...assignments.entries()]
        .filter(([, b]) => b === bucketIndex)
        .map(([optionIndex]) => optionIndex)}
      <div class="rounded-md border border-slate-200 p-2.5">
        <p class="mb-1.5 text-xs font-medium text-slate-500">{buckets[bucketIndex]}</p>
        <div class="flex flex-wrap gap-1.5">
          {#each itemsHere as optionIndex (optionIndex)}
            <button
              type="button"
              class="rounded-md border p-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed {locked &&
              revealAnswers
                ? isCorrect(optionIndex)
                  ? 'border-green-400 bg-green-50'
                  : 'border-red-400 bg-red-50'
                : 'border-slate-300 bg-white hover:bg-slate-50'}"
              disabled={locked}
              onclick={() => onPickItemBackUp(optionIndex)}
            >
              <div class="flex items-center gap-1.5">
                <OptionContent content={options[optionIndex].content} />
                {#if locked && revealAnswers}
                  {#if isCorrect(optionIndex)}
                    <CircleCheck size={14} class="shrink-0 text-green-600" />
                  {:else}
                    <CircleX size={14} class="shrink-0 text-red-500" />
                  {/if}
                {/if}
              </div>
            </button>
          {/each}
          {#if picked !== null && !locked}
            <button
              type="button"
              class="rounded-md border border-dashed border-indigo-300 bg-indigo-50/50 px-2 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
              onclick={() => onClickBucket(bucketIndex)}
            >
              Place here
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  {#if poolIndices.length > 0 || picked !== null}
    <div class="space-y-1.5">
      <p class="text-xs font-medium text-slate-500">
        {picked !== null ? 'Tap a bucket above to place it' : 'Tap an item to pick it up'}
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each poolIndices as optionIndex (optionIndex)}
          <button
            type="button"
            class="rounded-md border p-2 text-left transition-colors disabled:cursor-not-allowed {picked ===
            optionIndex
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-slate-300 bg-white hover:bg-slate-50'}"
            disabled={locked}
            onclick={() => onPickItem(optionIndex)}
            aria-pressed={picked === optionIndex}
          >
            <OptionContent content={options[optionIndex].content} />
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
