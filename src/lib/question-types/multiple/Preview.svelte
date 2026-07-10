<script lang="ts">
  import ContentBlockView from '../../components/ContentBlockView.svelte';
  import { containerClasses, type MultipleData, type MultipleFocusTarget, type AnswerOption } from './index';

  let { data, onFocus }: { data: MultipleData; onFocus: (target: MultipleFocusTarget) => void } = $props();

  const optionsContainerClass = $derived(containerClasses[data.displayMode ?? 'list']);

  function rowClass(option: AnswerOption): string {
    return option.points > 0 ? 'border-green-300 border-dashed bg-white' : 'border-slate-200';
  }

  function focusPrompt() {
    onFocus({ field: 'prompt' });
  }

  function focusOption(e: MouseEvent | KeyboardEvent, optionId: string) {
    e.stopPropagation();
    onFocus({ field: 'option', optionId });
  }
</script>

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
      <div class="rounded-md border border-slate-200 p-3">
        {#if extra.label}
          <p class="mb-1 text-xs font-medium text-slate-500">{extra.label}</p>
        {/if}
        <ContentBlockView block={extra.revealContent ?? { kind: 'text', text: '' }} />
        {#if extra.points}
          <p class="mt-1 text-xs font-medium {extra.points > 0 ? 'text-green-700' : 'text-red-600'}">
            {extra.points > 0 ? '+' : ''}{extra.points} pts on reveal
          </p>
        {/if}
      </div>
    {:else if extra.content}
      <ContentBlockView block={extra.content} />
    {/if}
  {/each}

  <div class={optionsContainerClass}>
    {#each data.options as option (option.id)}
      <div
        class="cursor-pointer rounded-md border p-3 hover:ring-2 hover:ring-indigo-200 {rowClass(option)}"
        role="button"
        tabindex="0"
        onclick={(e) => focusOption(e, option.id)}
        onkeydown={(e) => e.key === 'Enter' && focusOption(e, option.id)}
      >
        <ContentBlockView block={option.content} />
        {#if option.points > 0}
          <p class="mt-1 text-xs font-medium text-green-700">Worth {option.points} pts</p>
        {/if}
      </div>
    {/each}
  </div>
</div>
