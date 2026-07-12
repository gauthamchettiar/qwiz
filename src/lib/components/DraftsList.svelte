<script lang="ts">
  import { onMount } from 'svelte';
  import { FilePen } from '@lucide/svelte';
  import { listDrafts, deleteDraft, type DraftRecord } from '../drafts';
  import ConfirmDeleteButton from './ConfirmDeleteButton.svelte';

  // When `limit` is set (the home page), show only the most recent N with a "More" link to the
  // dedicated listing; the full page passes no limit.
  let { limit }: { limit?: number } = $props();

  let drafts = $state<DraftRecord[]>([]);

  onMount(() => {
    drafts = listDrafts();
  });

  // Drafts come newest-first from the store, so slicing takes the most recent.
  const shown = $derived(limit ? drafts.slice(0, limit) : drafts);

  function discard(id: string) {
    deleteDraft(id);
    drafts = listDrafts();
  }
</script>

{#if drafts.length > 0}
  <div class="mb-6 rounded-lg border border-dashed border-slate-300 p-4">
    <h2 class="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
      <FilePen size={14} /> Drafts (in browser)
      {#if limit && drafts.length > limit}
        <a href="/local/drafts" class="ml-1 text-xs font-medium text-indigo-600 hover:underline">More →</a>
      {/if}
    </h2>
    <ul class="space-y-3">
      {#each shown as d (d.id)}
        <li class="rounded-md border border-slate-200 bg-white transition-colors hover:border-slate-400 hover:bg-slate-50">
          <div class="flex items-start justify-between gap-2 p-4">
            <a href={`/local/create?draft=${d.id}`} class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <h3 class="font-semibold text-slate-900">{d.title || 'Untitled trivia'}</h3>
                <span class="shrink-0 text-xs text-slate-400">
                  {d.questions.length} question{d.questions.length === 1 ? '' : 's'}
                </span>
              </div>
              {#if d.description}
                <p class="mt-1 text-sm text-slate-500">{d.description}</p>
              {/if}
            </a>
            <ConfirmDeleteButton onConfirm={() => discard(d.id)} ariaLabel="Discard draft" />
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/if}
