<script lang="ts">
  import { CircleCheck } from '@lucide/svelte';
  import ContentBlockView from '../../components/ContentBlockView.svelte';
  import { boxCount, guessBudget, type TypedData, type TypedFocusTarget } from './index';

  let { data, onFocus }: { data: TypedData; onFocus: (target: TypedFocusTarget) => void } = $props();

  const modeLabel = $derived(
    data.mode === 'single'
      ? data.inputStyle === 'boxes'
        ? 'One input · character boxes'
        : 'One input'
      : data.mode === 'multi-realtime'
        ? 'Multiple, live'
        : 'Multiple'
  );

  function focusPrompt() {
    onFocus({ field: 'prompt' });
  }
  function focusExtra(e: MouseEvent | KeyboardEvent, extraId: string) {
    e.stopPropagation();
    onFocus({ field: 'extra', extraId });
  }
  function focusAnswer(e: MouseEvent | KeyboardEvent, answerId: string) {
    e.stopPropagation();
    onFocus({ field: 'answer', answerId });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="space-y-4" onclick={focusPrompt}>
  <div
    class="cursor-pointer rounded-md p-2 hover:ring-2 hover:ring-slate-300"
    role="button"
    tabindex="0"
    onclick={(e) => {
      e.stopPropagation();
      focusPrompt();
    }}
    onkeydown={(e) => e.key === 'Enter' && focusPrompt()}
  >
    <div class="flex items-center gap-2">
      <ContentBlockView block={data.prompt} />
      <span class="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{modeLabel}</span>
    </div>
  </div>

  {#each data.extras as extra (extra.id)}
    <div
      class="cursor-pointer rounded-md p-2 hover:ring-2 hover:ring-slate-300 {extra.kind === 'reveal' ? 'border border-slate-200' : ''}"
      role="button"
      tabindex="0"
      onclick={(e) => focusExtra(e, extra.id)}
      onkeydown={(e) => e.key === 'Enter' && focusExtra(e, extra.id)}
    >
      {#if extra.kind === 'reveal'}
        {#if extra.label}<p class="mb-1 text-xs font-medium text-slate-500">{extra.label}</p>{/if}
        <ContentBlockView block={extra.revealContent ?? { kind: 'text', text: '' }} />
      {:else if extra.content}
        <ContentBlockView block={extra.content} />
      {/if}
    </div>
  {/each}

  <div>
    <p class="mb-1.5 text-xs font-medium text-slate-500">
      Accepted answer{data.answers.length > 1 ? 's' : ''}{data.mode !== 'single'
        ? ` · ${guessBudget(data)} guesses · ${data.grading === 'penalize' ? `−${data.wrongPenalty} per wrong` : 'wrong ignored'}`
        : data.inputStyle === 'boxes'
          ? ` · ${boxCount(data) || '—'} boxes`
          : ''}
    </p>
    <ul class="flex flex-wrap gap-2">
      {#each data.answers as answer (answer.id)}
        <li>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md border border-green-400 border-dashed bg-white px-2 py-1 text-sm font-medium text-slate-700 hover:ring-2 hover:ring-slate-300"
            onclick={(e) => focusAnswer(e, answer.id)}
          >
            <CircleCheck size={13} class="text-green-600" />
            {answer.text || '—'}
            <span class="text-xs text-green-700">+{answer.points}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
</div>
