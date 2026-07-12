<script lang="ts">
  import { onMount } from 'svelte';
  import { Save, Search, X, Pencil, Download, Share2, Trash2 } from '@lucide/svelte';
  import { listTrivias, getTrivia, deleteTrivia } from '../store';
  import { downloadJson, slugify } from '../download';
  import { buildShareUrl } from '../share';
  import CardMenu from './CardMenu.svelte';
  import type { TriviaSummary } from '../types';

  // When `limit` is set (the home page), show only the most recent N with a "More" link to the
  // dedicated listing; the full page passes no limit and gets search + tag filtering.
  let { limit }: { limit?: number } = $props();

  let trivias = $state<TriviaSummary[]>([]);
  let loaded = $state(false);
  let query = $state('');
  let activeTag = $state<string | null>(null);
  // Per-card transient UI: which card is mid-delete-confirm, and a short-lived share status.
  let confirmingId = $state<string | null>(null);
  let shareStatus = $state<{ id: string; state: 'copied' | 'toobig' } | null>(null);

  const menuItem =
    'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100';

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

  // Home page: the most recent `limit` (already sorted newest-first by the store), no filtering.
  const shown = $derived(limit ? trivias.slice(0, limit) : filtered);

  function toggleTag(tag: string) {
    activeTag = activeTag === tag ? null : tag;
  }

  function onDownload(id: string, close: () => void) {
    const t = getTrivia(id);
    if (t) downloadJson(`${slugify(t.title)}.json`, t);
    close();
  }

  async function onShare(id: string, close: () => void) {
    const t = getTrivia(id);
    close();
    if (!t) return;
    const { url } = await buildShareUrl(t);
    if (!url) {
      shareStatus = { id, state: 'toobig' };
      setTimeout(() => (shareStatus = null), 4000);
      return;
    }
    await navigator.clipboard.writeText(url);
    shareStatus = { id, state: 'copied' };
    setTimeout(() => (shareStatus = null), 2000);
  }

  function onDelete(id: string) {
    deleteTrivia(id);
    trivias = listTrivias();
    confirmingId = null;
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
          {#if limit && trivias.length > limit}
            <a href="/local/saved" class="ml-1 text-xs font-medium text-indigo-600 hover:underline">More →</a>
          {/if}
        </h2>
        {#if !limit && (trivias.length > 3 || allTags.length > 0)}
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

      {#if !limit && allTags.length > 0}
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

      {#if shown.length === 0}
        <p class="py-6 text-center text-sm text-slate-400">No trivias match your search.</p>
      {:else}
        <ul class="space-y-3">
          {#each shown as t (t.id)}
            <li class="relative rounded-md border border-slate-200 bg-white transition-colors hover:border-slate-400">
              <a href={`/local/trivia/play?id=${t.id}`} class="block p-4 pr-10">
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

              <div class="absolute bottom-2 right-2">
                <CardMenu onClose={() => (confirmingId = null)}>
                  {#snippet children(close)}
                    <a href={`/local/trivia/edit?id=${t.id}`} class={menuItem}>
                      <Pencil size={15} /> Edit
                    </a>
                    <button type="button" class={menuItem} onclick={() => onDownload(t.id, close)}>
                      <Download size={15} /> Download JSON
                    </button>
                    <button type="button" class={menuItem} onclick={() => onShare(t.id, close)}>
                      <Share2 size={15} /> Share link
                    </button>
                    <div class="my-1 border-t border-slate-100"></div>
                    {#if confirmingId === t.id}
                      <button
                        type="button"
                        class="flex w-full items-center gap-2 rounded bg-red-600 px-2.5 py-1.5 text-left text-sm font-medium text-white hover:bg-red-700"
                        onclick={() => onDelete(t.id)}
                      >
                        <Trash2 size={15} /> Confirm delete?
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                        onclick={() => (confirmingId = t.id)}
                      >
                        <Trash2 size={15} /> Delete
                      </button>
                    {/if}
                  {/snippet}
                </CardMenu>
              </div>

              {#if shareStatus?.id === t.id}
                <p class="px-4 pb-3 text-xs text-slate-400">
                  {shareStatus.state === 'copied'
                    ? 'Share link copied to clipboard.'
                    : 'Too large to pack into a link — use Download JSON instead.'}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
{/if}
