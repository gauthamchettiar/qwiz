<script lang="ts">
  import { Check, Lock, Play, RotateCcw, Trophy } from '@lucide/svelte';
  import {
    blockedLabel,
    journeyNodes,
    journeyProgressCount,
    journeyStages,
    type JourneyProgress,
    type JourneyStatus
  } from '@/lib/utils/journey';
  import { entryLabel } from '@/lib/utils/folderTree';
  import type { QuizGroup, QuizGroupEntry } from '@/lib/utils/quizGroup';

  let {
    group,
    progress,
    onPlay,
    onReset
  }: {
    group: QuizGroup;
    progress: JourneyProgress;
    onPlay: (entry: QuizGroupEntry) => void;
    onReset: () => void;
  } = $props();

  const nodes = $derived(journeyNodes(group, progress));
  const stages = $derived(journeyStages(nodes));
  const counts = $derived(journeyProgressCount(nodes));

  const labelById = $derived(new Map(group.entries.map((entry) => [entry.id, entryLabel(entry)])));
  const labelOf = (id: string) => labelById.get(id) ?? id;

  // Two-step, like ConfirmDeleteButton: resetting a journey throws away real progress, and a
  // single misplaced click shouldn't do it.
  let confirmingReset = $state(false);
  let resetTimeout: ReturnType<typeof setTimeout>;

  function armReset() {
    confirmingReset = true;
    clearTimeout(resetTimeout);
    resetTimeout = setTimeout(() => (confirmingReset = false), 3000);
  }

  function doReset() {
    clearTimeout(resetTimeout);
    confirmingReset = false;
    onReset();
  }

  /** One class string per status, chosen by a function rather than layered — two conflicting
   * background classes resolve by stylesheet order, not by the order they're written, which is the
   * bug CLAUDE.md §5 documents twice over. */
  function nodeTone(status: JourneyStatus): string {
    switch (status) {
      case 'won':
        return 'border-positive-line bg-positive-surface';
      case 'completed':
        return 'border-accent-line bg-accent-surface';
      case 'attempted':
        return 'border-warning-line bg-warning-surface';
      case 'locked':
        return 'border-line-faint bg-surface-sunken';
      default:
        return 'border-line-subtle bg-surface-raised hover:border-line-strong';
    }
  }

  function statusLabel(status: JourneyStatus): string {
    switch (status) {
      case 'won':
        return 'Cleared';
      case 'completed':
        return 'Played';
      case 'attempted':
        return 'Played — win it to clear it';
      case 'locked':
        return 'Locked';
      default:
        return 'Ready';
    }
  }
</script>

<div class="space-y-5">
  <div class="flex flex-wrap items-baseline justify-between gap-3">
    <p class="text-sm font-medium text-ink-soft">
      {counts.cleared} of {counts.total} cleared
    </p>
    {#if counts.cleared > 0}
      {#if confirmingReset}
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md bg-negative px-2.5 py-1 text-xs font-medium text-ink-inverse hover:bg-negative-hover"
          onclick={doReset}
        >
          <RotateCcw size={13} /> Confirm reset?
        </button>
      {:else}
        <button
          type="button"
          class="flex items-center gap-1.5 text-xs font-medium text-negative-ink hover:underline"
          onclick={armReset}
        >
          <RotateCcw size={13} /> Reset progress
        </button>
      {/if}
    {/if}
  </div>

  {#each stages as stage (stage.label)}
    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{stage.label}</p>
      <ul class="grid gap-2 sm:grid-cols-2">
        {#each stage.nodes as node (node.entry.id)}
          <li>
            <!-- A locked node is a real <button disabled> rather than a styled div: it stays in the
                 accessibility tree, announces its own state, and can't be clicked into a quiz the
                 player hasn't unlocked. -->
            <button
              type="button"
              class="flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors {nodeTone(
                node.status
              )}"
              disabled={node.status === 'locked'}
              onclick={() => onPlay(node.entry)}
            >
              <span class="mt-0.5 shrink-0">
                {#if node.status === 'won'}
                  <Trophy size={16} class="text-positive-ink" />
                {:else if node.status === 'completed'}
                  <Check size={16} class="text-accent-ink" />
                {:else if node.status === 'attempted'}
                  <RotateCcw size={16} class="text-warning-ink" />
                {:else if node.status === 'locked'}
                  <Lock size={16} class="text-ink-faint" />
                {:else}
                  <Play size={16} class="text-ink-soft" />
                {/if}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-ink">
                  {entryLabel(node.entry)}
                </span>
                <span class="mt-0.5 block text-xs text-ink-subtle">
                  {#if node.status === 'locked'}
                    {blockedLabel(node.blockedBy, labelOf)}
                  {:else}
                    {statusLabel(node.status)}
                  {/if}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</div>
