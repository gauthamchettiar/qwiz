<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import type { QuizScriptOption } from '@/lib/utils/quizScript';
  import OptionContent from './OptionContent.svelte';

  // Presentation-only order board: a numbered sequence of slots plus a "bank" of not-yet-placed
  // items — all pick/place logic (including the tap-item-then-tap-slot state machine) lives in the
  // caller (QuestionPlayer.svelte), same division of responsibility as CharacterBank.svelte. Every
  // item/slot is a plain `<button>`, so Tab+Enter/Space already makes this fully keyboard-operable
  // with no bespoke key handling needed.
  let {
    options,
    optionOrder,
    placement,
    picked,
    locked = false,
    revealAnswers = false,
    onPick,
    onSlotClick
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
  } = $props();

  const bankIndices = $derived(optionOrder.filter((i) => !placement.includes(i)));
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
            class="min-w-0 flex-1 rounded-md border p-2.5 text-left transition-colors disabled:cursor-not-allowed {picked !==
            null
              ? 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50'
              : occupant !== null
                ? 'border-slate-200 hover:bg-slate-50'
                : 'border-dashed border-slate-300'} {locked && revealAnswers && occupant !== null
              ? isCorrect
                ? 'border-green-400 bg-green-50'
                : 'border-red-400 bg-red-50'
              : ''}"
            disabled={locked}
            onclick={() => onSlotClick(slotIndex)}
            aria-label={occupant !== null
              ? `Position ${slotIndex + 1}, filled — tap to pick back up`
              : `Position ${slotIndex + 1}, empty — tap to place the picked item here`}
          >
            {#if occupant !== null}
              <div class="flex items-center gap-2">
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

  {#if bankIndices.length > 0 || picked !== null}
    <div class="space-y-1.5">
      <p class="text-xs font-medium text-slate-500">
        {picked !== null ? 'Tap a position above to place it' : 'Tap an item to pick it up'}
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each bankIndices as optionIndex (optionIndex)}
          <button
            type="button"
            class="rounded-md border p-2 text-left transition-colors disabled:cursor-not-allowed {picked ===
            optionIndex
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-slate-300 bg-white hover:bg-slate-50'}"
            disabled={locked}
            onclick={() => onPick(optionIndex)}
            aria-pressed={picked === optionIndex}
          >
            <OptionContent content={options[optionIndex].content} />
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
