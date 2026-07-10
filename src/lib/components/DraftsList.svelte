<script lang="ts">
  import { onMount } from 'svelte';
  import { FilePen, Trash2 } from '@lucide/svelte';
  import { listDrafts, deleteDraft, type DraftRecord } from '../drafts';

  let drafts = $state<DraftRecord[]>([]);

  onMount(() => {
    drafts = listDrafts();
  });

  function discard(id: string) {
    deleteDraft(id);
    drafts = listDrafts();
  }
</script>

{#if drafts.length > 0}
  <div class="mb-6">
    <h2 class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
      <FilePen size={14} /> Drafts (saved in this browser)
    </h2>
    <ul class="space-y-2">
      {#each drafts as d (d.id)}
        <li
          class="flex items-center justify-between rounded-md border border-dashed border-slate-300 bg-white p-3"
        >
          <a href={`/create?draft=${d.id}`} class="text-sm font-medium text-slate-700 hover:text-indigo-600">
            {d.title || 'Untitled trivia'}
          </a>
          <button
            type="button"
            class="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
            onclick={() => discard(d.id)}
            aria-label="Discard draft"
          >
            <Trash2 size={15} />
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/if}
