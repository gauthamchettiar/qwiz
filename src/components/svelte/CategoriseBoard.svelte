<script lang="ts">
  import { CircleCheck, CircleX, GripVertical, Inbox } from '@lucide/svelte';
  import type { QuizScriptOption } from '@/lib/utils/quizScript';
  import { draggable, type DragState } from '@/lib/utils/dragDrop';
  import OptionContent from './OptionContent.svelte';

  // Presentation-only categorise board: one TRAY per bucket (each holding any number of items,
  // unlike match's 1-to-1 pairing) plus a pool of not-yet-assigned items — all assignment logic
  // lives in the caller (QuestionPlayer.svelte), same division of responsibility as
  // OrderBoard.svelte/MatchBoard.svelte.
  //
  // A bucket's own surface is never itself a `<button>` (nesting the per-item pick-back-up buttons
  // inside it would be invalid HTML) — instead, an explicit "Place here" button appears inside a
  // bucket once something is picked, and the tray as a whole is a drop zone for dragging.
  //
  // The tray treatment — a labelled header with a live count, and a dashed, min-height well
  // underneath it — exists to make "this holds a collection" legible at a glance. As a flat
  // bordered card the same size as an item, a bucket read like one more single-slot target, so
  // nothing suggested several items could share one.
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
    onClickBucket,
    onDrop
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
    /** A dragged item released on a bucket, or on the pool (`SOURCE_ZONE`) to unassign it. */
    onDrop: (optionIndex: number, zone: number) => void;
  } = $props();

  const DROP_GROUP = 'categorise';
  const SOURCE_ZONE = -1;

  const poolIndices = $derived(itemOrder.filter((i) => !assignments.has(i)));

  let drag = $state<DragState | null>(null);
  const placing = $derived(picked !== null || drag !== null);

  function isCorrect(optionIndex: number): boolean {
    const bucketIndex = assignments.get(optionIndex);
    return bucketIndex !== undefined && buckets[bucketIndex] === options[optionIndex].target;
  }

  function itemsIn(bucketIndex: number): number[] {
    return [...assignments.entries()]
      .filter(([, b]) => b === bucketIndex)
      .map(([optionIndex]) => optionIndex);
  }

  function dragParams(optionIndex: number) {
    return {
      id: optionIndex,
      group: DROP_GROUP,
      disabled: locked,
      onDragChange: (state: DragState | null) => (drag = state),
      onDrop
    };
  }
</script>

<div class="space-y-3">
  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {#each bucketOrder as bucketIndex (bucketIndex)}
      {@const itemsHere = itemsIn(bucketIndex)}
      {@const over = drag?.overZone === bucketIndex}
      <!-- `role="group"` + the bucket's own name: gives the tray a single stable identity for
           assistive tech and for e2e selectors, instead of either having to reach it through the
           DOM shape around its label. -->
      <div
        role="group"
        aria-label={buckets[bucketIndex]}
        data-drop-group={DROP_GROUP}
        data-drop-zone={bucketIndex}
        class="rounded-lg border-2 transition-colors {over
          ? 'border-indigo-500 bg-indigo-50'
          : placing
            ? 'border-indigo-300 bg-indigo-50/30'
            : 'border-slate-200 bg-slate-50/50'}"
      >
        <div class="flex items-center justify-between gap-2 px-2.5 pb-1 pt-2">
          <p class="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-slate-600">
            {buckets[bucketIndex]}
          </p>
          <!-- Purely a visual tally; `aria-label` on a span with no role is prohibited (and axe
               flags it), and a screen reader user already gets the contents by entering the group. -->
          <span
            aria-hidden="true"
            class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold {itemsHere.length >
            0
              ? 'bg-slate-600 text-white'
              : 'bg-slate-200 text-slate-600'}"
          >
            {itemsHere.length}
          </span>
        </div>
        <!-- The well: dashed, indented and always at least two rows tall, so a bucket looks like
             something things go INTO and visibly has room for more than one of them. -->
        <div
          class="m-1.5 mt-0 flex min-h-16 flex-wrap content-start gap-1.5 rounded-md border border-dashed p-1.5 {over
            ? 'border-indigo-400 bg-white/80'
            : 'border-slate-300'}"
        >
          {#each itemsHere as optionIndex (optionIndex)}
            <button
              type="button"
              use:draggable={dragParams(optionIndex)}
              class="flex items-center gap-1 rounded-md border bg-white p-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed {locked &&
              revealAnswers
                ? isCorrect(optionIndex)
                  ? 'border-green-400 bg-green-50'
                  : 'border-red-400 bg-red-50'
                : 'border-slate-300 hover:bg-slate-50'} {drag?.id === optionIndex
                ? 'opacity-40'
                : ''}"
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
              class="rounded-md border border-dashed border-indigo-400 bg-indigo-50 px-2 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              onclick={() => onClickBucket(bucketIndex)}
            >
              Place here
            </button>
          {:else if itemsHere.length === 0 && !locked}
            <p class="flex items-center gap-1 self-center px-1 text-xs text-slate-500">
              <Inbox size={13} class="shrink-0 text-slate-400" />
              Drop items here
            </p>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Also a drop zone, so an item can be dragged back out of a bucket — which is why this stays
       rendered even once the pool is empty (as long as the board is still answerable). Hiding it
       then would remove the only drop target that undoes a placement, leaving a fully-assigned
       board draggable in one direction only. -->
  {#if !locked || poolIndices.length > 0}
    <div
      data-drop-group={DROP_GROUP}
      data-drop-zone={SOURCE_ZONE}
      class="space-y-1.5 rounded-md border border-dashed p-2 transition-colors {drag?.overZone ===
      SOURCE_ZONE
        ? 'border-indigo-400 bg-indigo-50'
        : 'border-transparent'}"
    >
      <p class="text-xs font-medium text-slate-500">
        {#if placing}
          Drop it on a bucket above, or tap one
        {:else if poolIndices.length === 0}
          Everything's placed — drag an item back here to undo it
        {:else}
          Tap an item to pick it up, or drag it
        {/if}
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each poolIndices as optionIndex (optionIndex)}
          <button
            type="button"
            use:draggable={dragParams(optionIndex)}
            class="flex items-center gap-1.5 rounded-md border p-2 text-left transition-colors disabled:cursor-not-allowed {picked ===
            optionIndex
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-slate-300 bg-white hover:bg-slate-50'} {drag?.id === optionIndex
              ? 'opacity-40'
              : ''}"
            disabled={locked}
            onclick={() => onPickItem(optionIndex)}
            aria-pressed={picked === optionIndex}
          >
            {#if !locked}
              <GripVertical size={14} class="shrink-0 text-slate-400" />
            {/if}
            <OptionContent content={options[optionIndex].content} />
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
