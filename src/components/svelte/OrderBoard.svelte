<script lang="ts">
  import { CircleCheck, CircleX, GripVertical } from '@lucide/svelte';
  import type { QuizScriptOption } from '@/lib/utils/quizScript';
  import { draggable, type DragState } from '@/lib/utils/dragDrop';
  import OptionContent from './OptionContent.svelte';

  // Presentation-only order board: a numbered sequence of slots plus a "bank" of not-yet-placed
  // items — all pick/place logic (including the tap-item-then-tap-slot state machine and its drag
  // counterpart) lives in the caller (QuestionPlayer.svelte), same division of responsibility as
  // CharacterBank.svelte. Every item/slot is a plain `<button>`, so Tab+Enter/Space already makes
  // this fully keyboard-operable with no bespoke key handling needed; dragging is layered on top of
  // that rather than replacing it (see lib/utils/dragDrop.ts).
  let {
    options,
    optionOrder,
    placement,
    picked,
    locked = false,
    revealAnswers = false,
    onPick,
    onSlotClick,
    onDrop
  }: {
    options: QuizScriptOption[];
    /** Display order for the bank, as indices into `options`. */
    optionOrder: number[];
    /** One slot per option — the original option index placed there, or `null` while empty. */
    placement: (number | null)[];
    /** The original option index currently picked up, awaiting a slot — `null` if none. */
    picked: number | null;
    locked?: boolean;
    /** Whether to show per-slot correct/incorrect styling — only meaningful once `locked`. */
    revealAnswers?: boolean;
    onPick: (optionIndex: number) => void;
    onSlotClick: (slotIndex: number) => void;
    /** A dragged item released on a slot, or on the bank (`SOURCE_ZONE`) to send it back. */
    onDrop: (optionIndex: number, zone: number) => void;
  } = $props();

  const DROP_GROUP = 'order';
  const SOURCE_ZONE = -1;

  const bankIndices = $derived(optionOrder.filter((i) => !placement.includes(i)));

  let drag = $state<DragState | null>(null);
  /** True whenever an item is in flight by either mechanism — every valid target advertises itself
   * the same way regardless of which one is in use. */
  const placing = $derived(picked !== null || drag !== null);

  function isOver(zone: number): boolean {
    return drag?.overZone === zone;
  }

  /** The item currently in flight is dimmed in place, so the sequence doesn't reflow mid-drag. */
  function isLifted(optionIndex: number): boolean {
    return drag?.id === optionIndex;
  }

  /** One slot's border+background as a SINGLE mutually-exclusive class string — see
   * QuestionPlayer's `choiceOptionTone` for why these can't be layered as "base plus a reveal
   * override": conflicting utilities are resolved by stylesheet order, not attribute order, so a
   * correctly-placed locked slot was rendering a green background inside a slate border. */
  function slotTone(slotIndex: number, occupant: number | null): string {
    if (locked && revealAnswers && occupant !== null) {
      return occupant === slotIndex ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50';
    }
    if (isOver(slotIndex)) return 'border-indigo-500 bg-indigo-100 ring-2 ring-indigo-200';
    if (placing) return 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50';
    if (occupant !== null) return 'border-slate-200 hover:bg-slate-50';
    return 'border-dashed border-slate-300';
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
  <div class="space-y-1.5">
    <p class="text-xs font-medium text-slate-500">Arrange in the correct order</p>
    <ol class="space-y-1.5">
      {#each placement as occupant, slotIndex (slotIndex)}
        {@const isCorrect = occupant === slotIndex}
        <li class="flex items-center gap-2">
          <span class="w-5 shrink-0 text-right text-xs font-medium text-slate-500"
            >{slotIndex + 1}.</span
          >
          <button
            type="button"
            data-drop-group={DROP_GROUP}
            data-drop-zone={slotIndex}
            use:draggable={occupant !== null
              ? dragParams(occupant)
              : { id: -1, group: DROP_GROUP, disabled: true }}
            class="min-w-0 flex-1 rounded-md border p-2.5 text-left transition-colors disabled:cursor-not-allowed {slotTone(
              slotIndex,
              occupant
            )} {occupant !== null && isLifted(occupant) ? 'opacity-40' : ''}"
            disabled={locked}
            onclick={() => onSlotClick(slotIndex)}
            aria-label={occupant !== null
              ? `Position ${slotIndex + 1}, filled — tap to pick back up, or drag to move`
              : `Position ${slotIndex + 1}, empty — tap to place the picked item here`}
          >
            {#if occupant !== null}
              <div class="flex items-center gap-2">
                {#if !locked}
                  <GripVertical size={14} class="shrink-0 text-slate-400" />
                {/if}
                <div class="min-w-0 flex-1">
                  <OptionContent content={options[occupant].content} />
                </div>
                {#if locked && revealAnswers}
                  {#if isCorrect}
                    <CircleCheck size={16} class="shrink-0 text-green-600" />
                  {:else}
                    <CircleX size={16} class="shrink-0 text-red-500" />
                  {/if}
                {/if}
              </div>
            {:else}
              <p class="text-sm text-slate-500">Empty</p>
            {/if}
          </button>
        </li>
      {/each}
    </ol>
  </div>

  <!-- Also a drop zone in its own right, so an item can be dragged back out of the sequence — which
       is why this stays rendered once the bank empties, as long as the board is still answerable.
       Hiding it then would remove the only drop target that undoes a placement. -->
  {#if !locked || bankIndices.length > 0}
    <div
      data-drop-group={DROP_GROUP}
      data-drop-zone={SOURCE_ZONE}
      class="space-y-1.5 rounded-md border border-dashed p-2 transition-colors {isOver(SOURCE_ZONE)
        ? 'border-indigo-400 bg-indigo-50'
        : 'border-transparent'}"
    >
      <p class="text-xs font-medium text-slate-500">
        {#if placing}
          Drop it on a position above, or tap one
        {:else if bankIndices.length === 0}
          Everything's placed — drag an item back here to undo it
        {:else}
          Tap an item to pick it up, or drag it
        {/if}
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each bankIndices as optionIndex (optionIndex)}
          <button
            type="button"
            use:draggable={dragParams(optionIndex)}
            class="flex items-center gap-1.5 rounded-md border p-2 text-left transition-colors disabled:cursor-not-allowed {picked ===
            optionIndex
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-slate-300 bg-white hover:bg-slate-50'} {isLifted(optionIndex)
              ? 'opacity-40'
              : ''}"
            disabled={locked}
            onclick={() => onPick(optionIndex)}
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
