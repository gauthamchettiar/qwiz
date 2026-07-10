<script lang="ts">
  import ContentBlockView from '../../components/ContentBlockView.svelte';
  import { genId } from '../shared';
  import { chosenCount, containerClasses, type MultipleData, type MultipleResponse } from './index';

  let {
    data,
    response,
    onChange,
    single = false
  }: {
    data: MultipleData;
    response: MultipleResponse;
    onChange: (r: MultipleResponse) => void;
    /** Rendered by the `single` type as a thin wrapper — forces radio-button, one-at-a-time selection. */
    single?: boolean;
  } = $props();

  const radioGroupName = genId();
  const optionsContainerClass = $derived(containerClasses[data.displayMode ?? 'list']);
  const resp = $derived<MultipleResponse>({
    selected: response?.selected ?? [],
    typed: response?.typed ?? {},
    revealedExtras: response?.revealedExtras ?? []
  });
  const atMax = $derived(!single && chosenCount(data, resp) >= data.max);

  function isSelected(id: string): boolean {
    return (response?.selected ?? []).includes(id);
  }

  function selectClickOption(id: string) {
    if (single) {
      onChange({ selected: [id], typed: {}, revealedExtras: resp.revealedExtras });
      return;
    }

    const current = response?.selected ?? [];
    if (current.includes(id)) {
      onChange({ selected: current.filter((x) => x !== id), typed: response?.typed ?? {}, revealedExtras: resp.revealedExtras });
    } else {
      if (atMax) return; // at the selection limit — ignore further picks until one is freed up
      onChange({ selected: [...current, id], typed: response?.typed ?? {}, revealedExtras: resp.revealedExtras });
    }
  }

  function revealExtra(id: string) {
    if (resp.revealedExtras!.includes(id)) return;
    onChange({ ...resp, revealedExtras: [...resp.revealedExtras!, id] });
  }
</script>

<div class="space-y-4">
  <ContentBlockView block={data.prompt} />

  {#each data.extras as extra (extra.id)}
    {#if extra.kind === 'reveal'}
      <div class="rounded-md border border-slate-200 p-3">
        {#if resp.revealedExtras!.includes(extra.id)}
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

  {#if !single && data.max < data.options.length}
    <p class="text-xs text-slate-400">
      Pick {data.min === data.max ? `exactly ${data.max}` : `${data.min}–${data.max}`}.
    </p>
  {/if}
  <div class={optionsContainerClass}>
    {#each data.options as option (option.id)}
      {@const disabled = !single && atMax && !isSelected(option.id)}
      <label
        class="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-slate-50 {isSelected(option.id)
          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
          : 'border-slate-200'} {disabled ? 'cursor-not-allowed opacity-50 hover:bg-transparent' : ''}"
      >
        {#if single}
          <input
            type="radio"
            class="h-4 w-4 shrink-0 accent-[var(--accent)]"
            name={radioGroupName}
            checked={isSelected(option.id)}
            onchange={() => selectClickOption(option.id)}
          />
        {:else}
          <input
            type="checkbox"
            class="h-4 w-4 shrink-0 accent-[var(--accent)]"
            checked={isSelected(option.id)}
            {disabled}
            onchange={() => selectClickOption(option.id)}
          />
        {/if}
        <div class="flex-1">
          <ContentBlockView block={option.content} />
        </div>
      </label>
    {/each}
  </div>
</div>
