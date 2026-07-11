<script lang="ts">
  import { X } from '@lucide/svelte';
  import ContentBlockView from '../../components/ContentBlockView.svelte';
  import { boxCount, guessBudget, matchGuess, type TypedData, type TypedResponse } from './index';

  let {
    data,
    response,
    onChange
  }: {
    data: TypedData;
    response: TypedResponse;
    onChange: (r: TypedResponse) => void;
  } = $props();

  const resp = $derived<TypedResponse>({
    value: response?.value ?? '',
    guesses: response?.guesses ?? [],
    revealedExtras: response?.revealedExtras ?? []
  });

  const boxes = $derived(boxCount(data));
  const budget = $derived(guessBudget(data));
  const remaining = $derived(budget - resp.guesses.length);

  let boxRefs: HTMLInputElement[] = $state([]);
  let draft = $state('');

  function setValue(value: string) {
    onChange({ ...resp, value });
  }

  function setBoxChar(i: number, ch: string) {
    const chars = resp.value.padEnd(boxes, ' ').split('');
    chars[i] = ch.slice(-1);
    setValue(chars.join('').trimEnd());
    if (ch && i < boxes - 1) boxRefs[i + 1]?.focus();
  }

  function onBoxKey(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !(e.currentTarget as HTMLInputElement).value && i > 0) {
      boxRefs[i - 1]?.focus();
    }
  }

  function commitGuess() {
    const g = draft.trim();
    if (!g || resp.guesses.length >= budget) return;
    onChange({ ...resp, guesses: [...resp.guesses, g] });
    draft = '';
  }

  function removeGuess(idx: number) {
    onChange({ ...resp, guesses: resp.guesses.filter((_, i) => i !== idx) });
  }

  function revealExtra(id: string) {
    if (resp.revealedExtras!.includes(id)) return;
    onChange({ ...resp, revealedExtras: [...resp.revealedExtras!, id] });
  }

  function chipClass(guess: string): string {
    if (data.mode !== 'multi-realtime') return 'border-slate-300 bg-slate-50 text-slate-700';
    return matchGuess(data, guess)
      ? 'border-[var(--color-correct)] bg-[var(--color-correct)]/10 text-[var(--color-correct)]'
      : 'border-[var(--color-wrong)] bg-[var(--color-wrong)]/10 text-[var(--color-wrong)]';
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

  {#if data.mode === 'single'}
    {#if data.inputStyle === 'boxes' && boxes > 0}
      <div class="flex flex-wrap gap-1.5">
        {#each Array(boxes) as _, i (i)}
          <input
            bind:this={boxRefs[i]}
            type="text"
            inputmode="text"
            maxlength="1"
            aria-label={`Character ${i + 1}`}
            class="size-11 rounded-md border border-slate-300 text-center text-lg font-semibold uppercase focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            value={resp.value.charAt(i)}
            oninput={(e) => setBoxChar(i, e.currentTarget.value)}
            onkeydown={(e) => onBoxKey(i, e)}
          />
        {/each}
      </div>
    {:else}
      <input
        type="text"
        class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
        placeholder="Type your answer"
        value={resp.value}
        oninput={(e) => setValue(e.currentTarget.value)}
      />
    {/if}
  {:else}
    <div class="space-y-3">
      <div class="flex gap-2">
        <input
          type="text"
          class="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 disabled:bg-slate-50 disabled:text-slate-400"
          placeholder={remaining > 0 ? 'Type a guess, then Enter' : 'No guesses left'}
          disabled={remaining <= 0}
          bind:value={draft}
          onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), commitGuess())}
        />
        <button
          type="button"
          class="rounded-md border border-[var(--color-secondary)] px-3 py-2 text-sm font-medium text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/10 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={remaining <= 0 || draft.trim() === ''}
          onclick={commitGuess}
        >
          Enter
        </button>
      </div>
      <p class="text-xs text-slate-400">{remaining} guess{remaining === 1 ? '' : 'es'} left</p>
      {#if resp.guesses.length > 0}
        <ul class="flex flex-wrap gap-2">
          {#each resp.guesses as guess, i (i)}
            <li class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm font-medium {chipClass(guess)}">
              {guess}
              <button type="button" onclick={() => removeGuess(i)} aria-label={`Remove ${guess}`} class="hover:opacity-70">
                <X size={13} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
