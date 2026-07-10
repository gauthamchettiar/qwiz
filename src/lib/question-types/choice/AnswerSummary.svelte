<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import ContentBlockView from '../../components/ContentBlockView.svelte';
  import { containerClasses, isChosen, matchedInputIds, type ChoiceData, type ChoiceResponse } from './index';

  let { data, response }: { data: ChoiceData; response: ChoiceResponse } = $props();

  const resp = $derived<ChoiceResponse>({ selected: response?.selected ?? [], typed: response?.typed ?? {} });
  const isGraded = $derived(data.variant === 'single-graded' || data.variant === 'multiple-graded');
  const isLinkedInputs = $derived(
    (data.variant === 'multiple-many' || data.variant === 'multiple-graded') &&
      !!data.linkedInputs &&
      data.options.filter((o) => o.kind === 'input').length >= 2
  );
  const matchedIds = $derived(matchedInputIds(data, resp));
  const optionsContainerClass = $derived(containerClasses[data.displayMode ?? 'list']);

  function picked(option: ChoiceData['options'][number]): boolean {
    if (option.kind === 'input') return isLinkedInputs ? matchedIds.has(option.id) : isChosen(option, resp);
    return isChosen(option, resp);
  }

  function inputCorrect(option: ChoiceData['options'][number]): boolean {
    if (!picked(option)) return false;
    if (isGraded || isLinkedInputs) return true;
    return option.correct;
  }

  function rowClass(isPicked: boolean, correctFlag: boolean | null, points: number | null): string {
    if (points !== null) {
      if (isPicked && points > 0) return 'border-green-400 bg-green-50';
      if (isPicked) return 'border-red-400 bg-red-50';
      if (points > 0) return 'border-green-300 border-dashed bg-white';
      return 'border-slate-200';
    }
    if (correctFlag === true && isPicked) return 'border-green-400 bg-green-50';
    if (correctFlag === false && isPicked) return 'border-red-400 bg-red-50';
    if (correctFlag === true) return 'border-green-300 border-dashed bg-white';
    return 'border-slate-200';
  }
</script>

{#snippet badge(isPicked: boolean, correctFlag: boolean | null, points: number | null)}
  {#if points !== null && isPicked}
    <span
      class="mt-1 inline-flex items-center gap-1 text-xs font-semibold {points > 0 ? 'text-green-700' : 'text-red-700'}"
    >
      {#if points > 0}<CircleCheck size={13} />{:else}<CircleX size={13} />{/if}
      {points > 0 ? '+' : ''}{points} pts
    </span>
  {:else if points !== null && points > 0}
    <span class="mt-1 inline-block text-xs font-medium text-green-700">{points} pts available</span>
  {:else if correctFlag === true && isPicked}
    <span class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green-700">
      <CircleCheck size={13} /> Your answer
    </span>
  {:else if correctFlag === false && isPicked}
    <span class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-700">
      <CircleX size={13} /> Your answer
    </span>
  {:else if correctFlag === true}
    <span class="mt-1 inline-block text-xs font-medium text-green-700">Correct answer</span>
  {/if}
{/snippet}

<div class="space-y-4">
  <ContentBlockView block={data.prompt} />

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
      {#if option.kind === 'input'}
        {@const correct = inputCorrect(option)}
        {@const isPicked = picked(option)}
        {@const typedValue = resp.typed?.[option.id] ?? ''}
        <div
          class="rounded-md border p-3 {correct
            ? 'border-green-400 bg-green-50'
            : typedValue
              ? 'border-red-400 bg-red-50'
              : 'border-slate-200'}"
        >
          <div class="flex items-center justify-between gap-2">
            {#if option.label}
              <p class="text-xs font-medium text-slate-500">{option.label}</p>
            {/if}
            <div class="flex items-center gap-1.5">
              {#if isGraded && isPicked}
                <span class="text-xs font-semibold text-green-700">+{option.points} pts</span>
              {/if}
              {#if correct}
                <CircleCheck size={14} class="text-green-600" />
              {:else if typedValue}
                <CircleX size={14} class="text-red-600" />
              {/if}
            </div>
          </div>
          <p class="text-sm {typedValue ? 'text-slate-900' : 'italic text-slate-400'}">{typedValue || 'No answer'}</p>
          {#if !correct}
            <p class="mt-1 text-xs text-green-700">
              Accepted: {(option.validAnswers ?? []).filter(Boolean).join(', ')}
            </p>
          {/if}
          {#if isGraded && !isPicked && option.points > 0}
            <p class="mt-1 text-xs font-medium text-green-700">Worth {option.points} pts</p>
          {/if}
        </div>
      {:else}
        {@const isPicked = picked(option)}
        {@const correctFlag =
          data.variant === 'single-one' || data.variant === 'multiple-many' ? option.correct : null}
        {@const points = isGraded ? option.points : null}
        <div class="rounded-md border p-3 {rowClass(isPicked, correctFlag, points)}">
          {#if option.kind === 'reveal'}
            {#if option.label}
              <p class="mb-1 text-xs font-medium text-slate-500">{option.label}</p>
            {/if}
            <ContentBlockView block={option.revealContent ?? { kind: 'text', text: '' }} />
          {:else if option.content}
            <ContentBlockView block={option.content} />
          {/if}
          {@render badge(isPicked, correctFlag, points)}
        </div>
      {/if}
    {/each}
  </div>
</div>
