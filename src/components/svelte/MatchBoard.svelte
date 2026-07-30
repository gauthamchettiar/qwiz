<script lang="ts">
  import { ArrowRight, CircleCheck, CircleX, GripVertical } from '@lucide/svelte';
  import type { QuizScriptOption } from '@/lib/utils/quizScript';
  import { draggable, type DragState } from '@/lib/utils/dragDrop';
  import OptionContent from './OptionContent.svelte';

  // Presentation-only match board: two columns, left items and right targets — all pairing logic
  // lives in the caller (QuestionPlayer.svelte), same division of responsibility as
  // CharacterBank.svelte/OrderBoard.svelte. Every item is a plain `<button>`, so this is fully
  // keyboard-operable via Tab + Enter/Space with no bespoke key handling; a left item can also be
  // dragged onto a right target (see lib/utils/dragDrop.ts), which is the same operation.
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
    onClickRight,
    onDrop
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
    /** A dragged left item released on a right target. */
    onDrop: (leftIndex: number, rightIndex: number) => void;
  } = $props();

  const DROP_GROUP = 'match';

  let drag = $state<DragState | null>(null);
  const placing = $derived(picked !== null || drag !== null);

  function isCorrect(index: number): boolean {
    return pairs.get(index) === index;
  }

  /** Border+background for one column entry as a SINGLE mutually-exclusive class string — see
   * QuestionPlayer's `choiceOptionTone` for why a "base plus reveal override" pair of class strings
   * silently resolves the wrong way. */
  function leftTone(leftIndex: number): string {
    const paired = pairs.has(leftIndex);
    if (locked && revealAnswers && paired) {
      return isCorrect(leftIndex) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50';
    }
    if (picked === leftIndex) return 'border-indigo-400 bg-indigo-50';
    if (paired) return 'border-slate-300 bg-slate-50';
    return 'border-slate-200 hover:bg-slate-50';
  }

  function rightTone(rightIndex: number): string {
    const used = [...pairs.values()].includes(rightIndex);
    if (locked && revealAnswers && used) {
      return isCorrect(rightIndex) ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50';
    }
    if (drag?.overZone === rightIndex) {
      return 'border-indigo-500 bg-indigo-100 ring-2 ring-indigo-200';
    }
    if (placing) return 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50';
    if (used) return 'border-slate-300 bg-slate-50';
    return 'border-slate-200 hover:bg-slate-50';
  }

  /** Which right-column entry a left item is currently paired with, as its 1-based position in the
   * column the player actually sees — a paired item is otherwise indistinguishable from any other,
   * which on a board of more than two rows makes it genuinely hard to tell what you've matched. */
  function pairedPosition(leftIndex: number): number | null {
    const right = pairs.get(leftIndex);
    if (right === undefined) return null;
    const position = rightOrder.indexOf(right);
    return position === -1 ? null : position + 1;
  }

  // The pairing badges below are `aria-hidden` and announced through `aria-describedby` instead,
  // deliberately: they must not become part of either button's accessible NAME, which is the
  // option/target text and nothing else. That name is what identifies the control to a screen
  // reader user and to this app's e2e selectors alike, and it would otherwise change out from under
  // both the moment an item got paired.
  const instanceId = $props.id();
</script>

<div class="grid grid-cols-2 gap-3">
  <div class="space-y-1.5">
    {#each leftOrder as leftIndex (leftIndex)}
      {@const paired = pairs.has(leftIndex)}
      {@const position = pairedPosition(leftIndex)}
      <!-- The description lives OUTSIDE the button, not inside it: any text inside a button becomes
           part of its accessible NAME, whether or not it's also the target of aria-describedby. -->
      <div>
        {#if paired}
          <span id={`${instanceId}-pair-${leftIndex}`} class="sr-only">
            Matched with {options[pairs.get(leftIndex)!].target}
          </span>
        {/if}
        <button
          type="button"
          use:draggable={{
            id: leftIndex,
            group: DROP_GROUP,
            disabled: locked,
            onDragChange: (state) => (drag = state),
            onDrop
          }}
          class="w-full rounded-md border p-2.5 text-left transition-colors disabled:cursor-not-allowed {leftTone(
            leftIndex
          )} {drag?.id === leftIndex ? 'opacity-40' : ''}"
          disabled={locked}
          onclick={() => onPickLeft(leftIndex)}
          aria-pressed={picked === leftIndex}
          aria-describedby={paired ? `${instanceId}-pair-${leftIndex}` : undefined}
        >
          <div class="flex items-center gap-2">
            {#if !locked}
              <GripVertical size={14} class="shrink-0 text-slate-400" />
            {/if}
            <div class="min-w-0 flex-1">
              <OptionContent content={options[leftIndex].content} />
            </div>
            {#if position !== null}
              <span
                class="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-slate-500"
                aria-hidden="true"
              >
                <ArrowRight size={12} />{position}
              </span>
            {/if}
            {#if locked && revealAnswers && paired}
              {#if isCorrect(leftIndex)}
                <CircleCheck size={16} class="shrink-0 text-green-600" />
              {:else}
                <CircleX size={16} class="shrink-0 text-red-500" />
              {/if}
            {/if}
          </div>
        </button>
      </div>
    {/each}
  </div>
  <div class="space-y-1.5">
    {#each rightOrder as rightIndex, position (rightIndex)}
      {@const used = [...pairs.values()].includes(rightIndex)}
      <button
        type="button"
        data-drop-group={DROP_GROUP}
        data-drop-zone={rightIndex}
        class="flex w-full items-center gap-2 rounded-md border p-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed {rightTone(
          rightIndex
        )}"
        disabled={locked}
        onclick={() => onClickRight(rightIndex)}
      >
        <span
          aria-hidden="true"
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold {used
            ? 'bg-slate-600 text-white'
            : 'bg-slate-100 text-slate-500'}"
        >
          {position + 1}
        </span>
        <span class="min-w-0 flex-1">{options[rightIndex].target}</span>
      </button>
    {/each}
  </div>
</div>
