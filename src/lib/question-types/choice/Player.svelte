<script lang="ts">
  import ContentBlockView from '../../components/ContentBlockView.svelte';
  import { genId } from '../shared';
  import { containerClasses, type ChoiceData, type ChoiceResponse } from './index';

  let {
    data,
    response,
    onChange
  }: {
    data: ChoiceData;
    response: ChoiceResponse;
    onChange: (r: ChoiceResponse) => void;
  } = $props();

  const radioGroupName = genId();
  const isSingle = $derived(data.variant === 'single-one' || data.variant === 'single-graded');
  const isMultiple = $derived(!isSingle);
  const showLinkedHint = $derived(
    !!data.linkedInputs && data.options.filter((o) => o.kind === 'input').length >= 2
  );
  const optionsContainerClass = $derived(containerClasses[data.displayMode ?? 'list']);

  // Purely presentational: which reveal-kind options/extras have been revealed. Not part of
  // the graded response, so it lives as local state (reset per-question by the {#key} wrapper
  // in TriviaPlayer). Kept separate from "selected" so content stays visible even if the
  // player later picks a different answer in single mode.
  let revealedIds = $state(new Set<string>());

  function isSelected(id: string): boolean {
    return (response?.selected ?? []).includes(id);
  }

  function selectClickOption(id: string) {
    revealedIds.add(id);
    revealedIds = new Set(revealedIds);

    if (isSingle) {
      onChange({ selected: [id], typed: {} });
    } else {
      const current = response?.selected ?? [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      onChange({ selected: next, typed: response?.typed ?? {} });
    }
  }

  function setTyped(id: string, value: string) {
    if (isSingle) {
      onChange({ selected: [], typed: { [id]: value } });
    } else {
      onChange({ selected: response?.selected ?? [], typed: { ...(response?.typed ?? {}), [id]: value } });
    }
  }

  function revealExtra(id: string) {
    revealedIds.add(id);
    revealedIds = new Set(revealedIds);
  }
</script>

<div class="space-y-4">
  <ContentBlockView block={data.prompt} />

  {#each data.extras as extra (extra.id)}
    {#if extra.kind === 'reveal'}
      <div class="rounded-md border border-slate-200 p-3">
        {#if revealedIds.has(extra.id)}
          {#if extra.label}
            <p class="mb-1 text-xs font-medium text-slate-500">{extra.label}</p>
          {/if}
          <ContentBlockView block={extra.revealContent ?? { kind: 'text', text: '' }} />
        {:else}
          <button
            type="button"
            class="w-full rounded-md bg-[var(--accent)]/10 px-3 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
            onclick={() => revealExtra(extra.id)}
          >
            Reveal {extra.label || 'more'}
          </button>
        {/if}
      </div>
    {:else if extra.content}
      <ContentBlockView block={extra.content} />
    {/if}
  {/each}

  {#if showLinkedHint}
    <p class="text-xs text-slate-400">These answers can go in any of the linked boxes below.</p>
  {/if}
  <div class={optionsContainerClass}>
    {#each data.options as option (option.id)}
      {#if option.kind === 'input'}
        <div
          class="rounded-md border p-3 {isSelected(option.id) ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-slate-200'}"
        >
          {#if option.label}
            <p class="mb-1 text-xs font-medium text-slate-500">{option.label}</p>
          {/if}
          <input
            type="text"
            class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={response?.typed?.[option.id] ?? ''}
            oninput={(e) => setTyped(option.id, e.currentTarget.value)}
          />
        </div>
      {:else if option.kind === 'reveal'}
        <div
          class="rounded-md border p-3 {isSelected(option.id) ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-slate-200'}"
        >
          {#if revealedIds.has(option.id)}
            {#if option.label}
              <p class="mb-1 text-xs font-medium text-slate-500">{option.label}</p>
            {/if}
            <ContentBlockView block={option.revealContent ?? { kind: 'text', text: '' }} />
          {:else}
            <button
              type="button"
              class="w-full rounded-md bg-[var(--accent)]/10 px-3 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
              onclick={() => selectClickOption(option.id)}
            >
              Reveal {option.label || 'answer'}
            </button>
          {/if}
        </div>
      {:else}
        <label
          class="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-slate-50 {isSelected(
            option.id
          )
            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
            : 'border-slate-200'}"
        >
          {#if isMultiple}
            <input
              type="checkbox"
              class="h-4 w-4 shrink-0 accent-[var(--accent)]"
              checked={isSelected(option.id)}
              onchange={() => selectClickOption(option.id)}
            />
          {:else}
            <input
              type="radio"
              class="h-4 w-4 shrink-0 accent-[var(--accent)]"
              name={radioGroupName}
              checked={isSelected(option.id)}
              onchange={() => selectClickOption(option.id)}
            />
          {/if}
          <div class="flex-1">
            {#if option.content}<ContentBlockView block={option.content} />{/if}
          </div>
        </label>
      {/if}
    {/each}
  </div>
</div>
