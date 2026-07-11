<script lang="ts">
  import { onMount } from 'svelte';
  import { Save, Search, X } from '@lucide/svelte';
  import { listTrivias } from '../store';
  import type { TriviaSummary } from '../types';

  let trivias = $state<TriviaSummary[]>([]);
  let loaded = $state(false);
  let query = $state('');
  let activeTag = $state<string | null>(null);

  onMount(() => {
    trivias = listTrivias();
    loaded = true;
  });

  // Every tag in use, for the filter row.
  const allTags = $derived([...new Set(trivias.flatMap((t) => t.tags))].sort());

  const filtered = $derived(
    trivias.filter((t) => {
      if (activeTag && !t.tags.includes(activeTag)) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q))
      );
    })
  );

  function toggleTag(tag: string) {
    activeTag = activeTag === tag ? null : tag;
  }
</script>

{#if loaded}
  {#if trivias.length === 0}
    <p class="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">
      No trivias yet. <a href="/local/create" class="text-indigo-600 hover:underline">Create your first one</a>.
    </p>
  {:else}
    <div class="rounded-lg border border-slate-200 p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 class="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
          <Save size={14} /> Saved (in browser)
        </h2>
        {#if trivias.length > 3 || allTags.length > 0}
          <div class="relative">
            <Search size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              class="w-48 rounded-md border border-slate-300 py-1.5 pl-8 pr-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Search…"
              bind:value={query}
            />
          </div>
        {/if}
      </div>

      {#if allTags.length > 0}
        <div class="mb-3 flex flex-wrap gap-1.5">
          {#each allTags as tag (tag)}
            <button
              type="button"
              class="rounded-md px-2 py-0.5 text-xs font-medium transition-colors {activeTag === tag
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
              onclick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          {/each}
          {#if activeTag}
            <button
              type="button"
              class="inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-medium text-slate-400 hover:text-slate-700"
              onclick={() => (activeTag = null)}
            >
              <X size={12} /> Clear
            </button>
          {/if}
        </div>
      {/if}

      {#if filtered.length === 0}
        <p class="py-6 text-center text-sm text-slate-400">No trivias match your search.</p>
      {:else}
        <ul class="space-y-3">
          {#each filtered as t (t.id)}
            <li>
              <a
                href={`/local/trivia?id=${t.id}`}
                class="block rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                <div class="flex items-center justify-between gap-2">
                  <h3 class="font-semibold text-slate-900">{t.title}</h3>
                  <span class="shrink-0 text-xs text-slate-400">
                    {t.questionCount} question{t.questionCount === 1 ? '' : 's'}
                  </span>
                </div>
                {#if t.description}
                  <p class="mt-1 text-sm text-slate-500">{t.description}</p>
                {/if}
                {#if t.tags.length > 0}
                  <div class="mt-2 flex flex-wrap gap-1">
                    {#each t.tags as tag (tag)}
                      <span class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">{tag}</span>
                    {/each}
                  </div>
                {/if}
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
{/if}
