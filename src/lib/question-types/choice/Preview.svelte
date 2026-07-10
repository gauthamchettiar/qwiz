<script lang="ts">
  import ContentBlockView from '../../components/ContentBlockView.svelte';
  import { containerClasses, type ChoiceData, type ChoiceFocusTarget, type ChoiceOption } from './index';

  let { data, onFocus }: { data: ChoiceData; onFocus: (target: ChoiceFocusTarget) => void } = $props();

  const isGraded = $derived(data.variant === 'single-graded' || data.variant === 'multiple-graded');
  const optionsContainerClass = $derived(containerClasses[data.displayMode ?? 'list']);

  function rowClass(option: ChoiceOption): string {
    const highlighted = isGraded ? option.points > 0 : option.correct;
    return highlighted ? 'border-green-300 border-dashed bg-white' : 'border-slate-200';
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
        {#if option.kind === 'input'}
          {#if option.label}
            <p class="text-xs font-medium text-slate-500">{option.label}</p>
          {/if}
          <p class="text-sm italic text-slate-400">Type your answer</p>
          <p class="mt-1 text-xs text-green-700">
            Accepted: {(option.validAnswers ?? []).filter(Boolean).join(', ') || '—'}
          </p>
        {:else if option.kind === 'reveal'}
          {#if option.label}
            <p class="mb-1 text-xs font-medium text-slate-500">{option.label}</p>
          {/if}
          <ContentBlockView block={option.revealContent ?? { kind: 'text', text: '' }} />
        {:else if option.content}
          <ContentBlockView block={option.content} />
        {/if}

        {#if isGraded && option.points > 0}
          <p class="mt-1 text-xs font-medium text-green-700">Worth {option.points} pts</p>
        {:else if !isGraded && option.correct}
          <p class="mt-1 text-xs font-medium text-green-700">Correct answer</p>
        {/if}
      </div>
    {/each}
  </div>
</div>
