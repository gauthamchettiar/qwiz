<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import ContentBlockView from '../../components/ContentBlockView.svelte';
  import { containerClasses, type MultipleData, type MultipleFocusTarget } from './index';

  let { data, onFocus }: { data: MultipleData; onFocus: (target: MultipleFocusTarget) => void } = $props();

  const optionsContainerClass = $derived(containerClasses[data.displayMode ?? 'list']);

  // Mirrors the player's post-reveal AnswerSummary layout so authoring and playing look the
  // same — minus any "player picked this" coloring, since there's no player here. Every option
  // and reveal-extra just shows whether it's correct/wrong and worth what, using static colors
  // (the player's --color-correct/--color-wrong CSS vars are only ever set by TriviaPlayer).
  // Ungraded: the card itself is already greyed out (see QuestionEditorCard), so every row's
  // background stays flat grey here too — only the border color signifies correct/wrong.
  function rowClass(points: number): string {
    if (data.ungraded) return points > 0 ? 'border-green-400 border-dashed bg-slate-100' : 'border-slate-200 bg-slate-100';
    return points > 0 ? 'border-green-400 border-dashed bg-white' : 'border-slate-200';
  }

  function extraRowClass(points: number): string {
    if (data.ungraded) {
      if (points > 0) return 'border-green-400 bg-slate-100';
      if (points < 0) return 'border-red-400 bg-slate-100';
      return 'border-slate-200 bg-slate-100';
    }
    if (points > 0) return 'border-green-400 bg-green-50';
    if (points < 0) return 'border-red-400 bg-red-50';
    return 'border-slate-200';
  }

  function focusPrompt() {
    onFocus({ field: 'prompt' });
  }

  function focusOption(e: MouseEvent | KeyboardEvent, optionId: string) {
    e.stopPropagation();
    onFocus({ field: 'option', optionId });
  }

  function focusExtra(e: MouseEvent | KeyboardEvent, extraId: string) {
    e.stopPropagation();
    onFocus({ field: 'extra', extraId });
  }
</script>

{#snippet badge(points: number)}
  {#if points > 0}
    <span class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green-700">
      <CircleCheck size={13} /> +{points} pts
    </span>
  {:else}
    <span class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600">
      <CircleX size={13} /> {points} pts
    </span>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="space-y-4" onclick={focusPrompt}>
  <div
    class="cursor-pointer rounded-md p-2 mb-2 hover:ring-2 hover:ring-indigo-200"
    role="button"
    tabindex="0"
    onclick={(e) => {
      e.stopPropagation();
      focusPrompt();
    }}
    onkeydown={(e) => e.key === 'Enter' && focusPrompt()}
  >
    <ContentBlockView block={data.prompt} />
  </div>

  {#each data.extras as extra (extra.id)}
    {#if extra.kind === 'reveal'}
      {@const points = extra.points ?? 0}
      <div
        class="cursor-pointer rounded-md border p-3 hover:ring-2 hover:ring-indigo-200 {extraRowClass(points)}"
        role="button"
        tabindex="0"
        onclick={(e) => focusExtra(e, extra.id)}
        onkeydown={(e) => e.key === 'Enter' && focusExtra(e, extra.id)}
      >
        {#if extra.label}
          <p class="mb-1 text-xs font-medium text-slate-500">{extra.label}</p>
        {/if}
        <ContentBlockView block={extra.revealContent ?? { kind: 'text', text: '' }} />
        {#if points !== 0}
          {@render badge(points)}
        {/if}
      </div>
    {:else if extra.content}
      <div
        class="cursor-pointer rounded-md p-2 hover:ring-2 hover:ring-indigo-200"
        role="button"
        tabindex="0"
        onclick={(e) => focusExtra(e, extra.id)}
        onkeydown={(e) => e.key === 'Enter' && focusExtra(e, extra.id)}
      >
        <ContentBlockView block={extra.content} />
      </div>
    {/if}
  {/each}

  <div class={optionsContainerClass}>
    {#each data.options as option (option.id)}
      <div
        class="cursor-pointer rounded-md border p-3 hover:ring-2 hover:ring-indigo-200 {rowClass(option.points)}"
        role="button"
        tabindex="0"
        onclick={(e) => focusOption(e, option.id)}
        onkeydown={(e) => e.key === 'Enter' && focusOption(e, option.id)}
      >
        <ContentBlockView block={option.content} />
        {@render badge(option.points)}
      </div>
    {/each}
  </div>
</div>
