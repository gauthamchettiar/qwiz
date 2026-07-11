<script lang="ts">
  import { CircleCheck, CircleX } from '@lucide/svelte';
  import ContentBlockView from '../../components/ContentBlockView.svelte';
  import { matchesSingle, matchGuess, norm, type TypedData, type TypedResponse } from './index';

  let { data, response }: { data: TypedData; response: TypedResponse } = $props();

  const resp = $derived<TypedResponse>({
    value: response?.value ?? '',
    guesses: response?.guesses ?? [],
    revealedExtras: response?.revealedExtras ?? []
  });

  const singleMatch = $derived(data.mode === 'single' ? matchesSingle(data, resp.value) : null);
  // Which accepted answers the player found (multi modes), by answer id.
  const foundIds = $derived(
    new Set(resp.guesses.map((g) => matchGuess(data, g)?.id).filter((x): x is string => !!x))
  );
</script>

<div class="space-y-4">
  <ContentBlockView block={data.prompt} />

  {#each data.extras as extra (extra.id)}
    {#if extra.kind === 'reveal'}
      <div class="rounded-md border border-slate-200 p-3">
        {#if extra.label}<p class="mb-1 text-xs font-medium text-slate-500">{extra.label}</p>{/if}
        <ContentBlockView block={extra.revealContent ?? { kind: 'text', text: '' }} />
      </div>
    {:else if extra.content}
      <ContentBlockView block={extra.content} />
    {/if}
  {/each}

  {#if data.mode === 'single'}
    <div class="space-y-2">
      <div>
        <p class="text-xs font-medium text-slate-500">You typed</p>
        {#if resp.value.trim()}
          <span
            class="mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm font-medium {singleMatch
              ? 'border-[var(--color-correct)] bg-[var(--color-correct)]/10 text-[var(--color-correct)]'
              : 'border-[var(--color-wrong)] bg-[var(--color-wrong)]/10 text-[var(--color-wrong)]'}"
          >
            {#if singleMatch}<CircleCheck size={14} />{:else}<CircleX size={14} />{/if}
            {resp.value}
          </span>
        {:else}
          <p class="mt-1 text-sm text-slate-400">(left blank)</p>
        {/if}
      </div>
      {#if !singleMatch}
        <div>
          <p class="text-xs font-medium text-slate-500">Accepted answer{data.answers.length > 1 ? 's' : ''}</p>
          <p class="mt-1 text-sm font-medium text-[var(--color-correct)]">
            {data.answers.map((a) => a.text).filter(Boolean).join(' · ')}
          </p>
        </div>
      {/if}
    </div>
  {:else}
    <div class="space-y-3">
      {#if resp.guesses.length > 0}
        <div>
          <p class="mb-1 text-xs font-medium text-slate-500">Your guesses</p>
          <ul class="flex flex-wrap gap-2">
            {#each resp.guesses as guess, i (i)}
              {@const hit = matchGuess(data, guess)}
              <li
                class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm font-medium {hit
                  ? 'border-[var(--color-correct)] bg-[var(--color-correct)]/10 text-[var(--color-correct)]'
                  : 'border-[var(--color-wrong)] bg-[var(--color-wrong)]/10 text-[var(--color-wrong)]'}"
              >
                {#if hit}<CircleCheck size={13} />{:else}<CircleX size={13} />{/if}
                {guess}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      <div>
        <p class="mb-1 text-xs font-medium text-slate-500">Accepted answers</p>
        <ul class="flex flex-wrap gap-2">
          {#each data.answers as answer (answer.id)}
            {@const found = foundIds.has(answer.id)}
            <li
              class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm font-medium {found
                ? 'border-[var(--color-correct)] bg-[var(--color-correct)]/10 text-[var(--color-correct)]'
                : 'border-slate-200 text-slate-500'}"
            >
              {#if found}<CircleCheck size={13} />{/if}
              {answer.text || '—'}
              <span class="text-xs opacity-70">{answer.points} pts</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
</div>
