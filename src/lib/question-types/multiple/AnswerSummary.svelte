<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import ContentBlockView from '../../components/ContentBlockView.svelte';
  import { containerClasses, isChosen, type MultipleData, type MultipleResponse } from './index';

  let { data, response }: { data: MultipleData; response: MultipleResponse } = $props();

  const resp = $derived<MultipleResponse>({
    selected: response?.selected ?? [],
    typed: response?.typed ?? {},
    revealedExtras: response?.revealedExtras ?? []
  });
  const optionsContainerClass = $derived(containerClasses[data.displayMode ?? 'list']);

  // Ungraded: the card itself is already greyed out (see QuestionEditorCard/TriviaPlayer), so
  // every option's background stays flat grey here too — only the border color is left to
  // signify correct/wrong/picked, no green/red tint underneath.
  function rowClass(isPicked: boolean, points: number): string {
    if (data.ungraded) {
      if (isPicked && points > 0) return 'border-[var(--color-correct)] bg-slate-100';
      if (isPicked) return 'border-[var(--color-wrong)] bg-slate-100';
      if (points > 0) return 'border-[var(--color-correct)] border-dashed bg-slate-100';
      return 'border-slate-200 bg-slate-100';
    }
    if (isPicked && points > 0) return 'border-[var(--color-correct)] bg-[var(--color-correct)]/10';
    if (isPicked) return 'border-[var(--color-wrong)] bg-[var(--color-wrong)]/10';
    if (points > 0) return 'border-[var(--color-correct)] border-dashed bg-[var(--color-bg)]';
    return 'border-slate-200';
  }

  function extraRowClass(wasRevealed: boolean, points: number): string {
    if (data.ungraded) {
      if (wasRevealed && points < 0) return 'border-[var(--color-wrong)] bg-slate-100';
      if (wasRevealed && points > 0) return 'border-[var(--color-correct)] bg-slate-100';
      return 'border-slate-200 bg-slate-100';
    }
    if (wasRevealed && points < 0) return 'border-[var(--color-wrong)] bg-[var(--color-wrong)]/10';
    if (wasRevealed && points > 0) return 'border-[var(--color-correct)] bg-[var(--color-correct)]/10';
    return 'border-slate-200';
  }
</script>

{#snippet badge(isPicked: boolean, points: number)}
  {#if isPicked && points > 0}
    <span class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-correct)]">
      <CircleCheck size={13} /> +{points} pts
    </span>
  {:else if isPicked}
    <span class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-wrong)]">
      <CircleX size={13} /> {points} pts
    </span>
  {:else if points > 0}
    <span class="mt-1 inline-block text-xs font-medium text-[var(--color-correct)]">{points} pts available</span>
  {/if}
{/snippet}

<div class="space-y-4">
  <ContentBlockView block={data.prompt} />

  {#each data.extras as extra (extra.id)}
    {#if extra.kind === 'reveal'}
      {@const wasRevealed = resp.revealedExtras!.includes(extra.id)}
      {@const points = extra.points ?? 0}
      <div class="rounded-md border p-3 {extraRowClass(wasRevealed, points)}">
        {#if extra.label}
          <p class="mb-1 text-xs font-medium text-slate-500">{extra.label}</p>
        {/if}
        <ContentBlockView block={extra.revealContent ?? { kind: 'text', text: '' }} />
        {#if wasRevealed && points !== 0}
          <span
            class="mt-1 inline-flex items-center gap-1 text-xs font-semibold {points > 0
              ? 'text-[var(--color-correct)]'
              : 'text-[var(--color-wrong)]'}"
          >
            {#if points > 0}<CircleCheck size={13} />{:else}<CircleX size={13} />{/if}
            {points > 0 ? '+' : ''}{points} pts
          </span>
        {/if}
      </div>
    {:else if extra.content}
      <ContentBlockView block={extra.content} />
    {/if}
  {/each}

  <div class={optionsContainerClass}>
    {#each data.options as option (option.id)}
      {@const isPicked = isChosen(option, resp)}
      <div class="rounded-md border p-3 {rowClass(isPicked, option.points)}">
        <ContentBlockView block={option.content} />
        {@render badge(isPicked, option.points)}
      </div>
    {/each}
  </div>
</div>
