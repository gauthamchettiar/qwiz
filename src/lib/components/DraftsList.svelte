<script lang="ts">
  import { onMount } from 'svelte';
  import { FilePen } from '@lucide/svelte';
  import { listDrafts, deleteDraft, type DraftRecord } from '../drafts';
  import ConfirmDeleteButton from './ConfirmDeleteButton.svelte';

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
  <div class="mb-6 rounded-lg border border-dashed border-slate-300 p-4">
    <h2 class="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
      <FilePen size={14} /> Drafts (in browser)
    </h2>
    <ul class="space-y-2">
      {#each drafts as d (d.id)}
        <li class="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
          <a href={`/local/create?draft=${d.id}`} class="text-sm font-medium text-slate-700 hover:text-indigo-600">
            {d.title || 'Untitled trivia'}
          </a>
          <ConfirmDeleteButton onConfirm={() => discard(d.id)} ariaLabel="Discard draft" />
        </li>
      {/each}
    </ul>
  </div>
{/if}
