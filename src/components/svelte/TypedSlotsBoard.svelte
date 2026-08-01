<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import type { QuizScriptOptionContent } from '@/lib/utils/quizScript';
  import OptionContent from './OptionContent.svelte';

  // Presentation-only board for `answer_mode=type`: one labelled text field per answer slot, used
  // by order/match/group_items instead of their drag-and-tap boards. All grading logic (which slot
  // expects what, and whether a response matches) lives in the caller — same division of
  // responsibility as OrderBoard/MatchBoard/CategoriseBoard.
  //
  // Deliberately one component rather than a typed variant of each board: once you're typing, the
  // three questions are the same shape — a list of prompts, each with a field — and the only thing
  // that differs is what the prompt is, which the caller supplies.
  let {
    slots,
    answers,
    caption,
    placeholder,
    reference = [],
    referenceLabel = '',
    correctness = [],
    expectations = [],
    locked = false,
    revealAnswers = false,
    onType
  }: {
    /** One per answer slot: a short leading label (a position number, say) and/or the item this
     * slot is asking about, plus `name` — what this slot is FOR, in words, used as the field's
     * accessible name. "Answer 1" would be ambiguous: match/group_items display their items in a
     * shuffled order, so the first field on screen isn't the first authored option. */
    slots: { label?: string; content?: QuizScriptOptionContent; name: string }[];
    /** The player's current text per slot. */
    answers: string[];
    /** What the fields are collectively asking for, e.g. "Type each item's category". */
    caption: string;
    placeholder: string;
    /** Items shown for reference above the fields, without giving the answer away — `order_items` needs
     * this (it asks the player to sequence a known set, so the set has to be visible somewhere),
     * while match/group_items deliberately show nothing, since the targets ARE the answer. */
    reference?: QuizScriptOptionContent[];
    referenceLabel?: string;
    /** Per-slot correctness — only meaningful once `locked` and revealing. */
    correctness?: boolean[];
    /** The accepted answer per slot, shown beside one the player got wrong. */
    expectations?: string[];
    locked?: boolean;
    revealAnswers?: boolean;
    onType: (slotIndex: number, value: string) => void;
  } = $props();

  const showing = $derived(locked && revealAnswers);

  /** Single mutually-exclusive class string — see QuestionPlayer's `choiceOptionTone` for why a
   * "base plus reveal override" pair silently resolves the wrong way. */
  function fieldTone(slotIndex: number): string {
    if (!showing) return 'border-line focus:border-line-strong disabled:bg-surface';
    return correctness[slotIndex]
      ? 'border-positive-line bg-positive-surface'
      : 'border-negative-line bg-negative-surface';
  }
</script>

<div class="space-y-3">
  {#if reference.length > 0}
    <div class="space-y-1.5">
      <p class="text-xs font-medium text-ink-subtle">{referenceLabel}</p>
      <div class="flex flex-wrap gap-1.5">
        {#each reference as content, i (i)}
          <span class="rounded-md border border-line bg-surface-raised p-2 text-sm">
            <OptionContent {content} />
          </span>
        {/each}
      </div>
    </div>
  {/if}

  <div class="space-y-1.5">
    <p class="text-xs font-medium text-ink-subtle">{caption}</p>
    <ol class="space-y-1.5">
      {#each slots as slot, i (i)}
        <li class="flex items-center gap-2">
          {#if slot.label}
            <span class="w-5 shrink-0 text-right text-xs font-medium text-ink-subtle">
              {slot.label}
            </span>
          {/if}
          {#if slot.content}
            <div class="min-w-0 flex-1">
              <OptionContent content={slot.content} />
            </div>
          {/if}
          <div class="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              type="text"
              class="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm text-ink focus:outline-none {fieldTone(
                i
              )}"
              value={answers[i] ?? ''}
              disabled={locked}
              {placeholder}
              aria-label={`Answer for ${slot.name}`}
              oninput={(e) => onType(i, e.currentTarget.value)}
            />
            {#if showing}
              {#if correctness[i]}
                <CircleCheck size={16} class="shrink-0 text-positive-ink-soft" />
              {:else}
                <CircleX size={16} class="shrink-0 text-negative-ink-soft" />
              {/if}
            {/if}
          </div>
        </li>
        {#if showing && !correctness[i] && expectations[i]}
          <li class="flex items-center gap-2 pl-7 text-xs text-ink-subtle">
            Answer: <span class="font-medium text-positive-ink">{expectations[i]}</span>
          </li>
        {/if}
      {/each}
    </ol>
  </div>
</div>
