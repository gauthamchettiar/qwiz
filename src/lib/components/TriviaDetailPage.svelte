<script lang="ts">
  import { onMount } from 'svelte';
  import { Play, Download, Pencil } from '@lucide/svelte';
  import { getTrivia, deleteTrivia } from '../store';
  import { downloadJson, slugify } from '../download';
  import ConfirmDeleteButton from './ConfirmDeleteButton.svelte';
  import type { Trivia } from '../types';

  let state = $state<'loading' | 'ready'>('loading');
  let trivia = $state<Trivia | null>(null);

  onMount(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    const found = id ? getTrivia(id) : null;
    if (!found) {
      window.location.href = '/';
      return;
    }
    trivia = found;
    state = 'ready';
  });

  function onDelete() {
    if (!trivia) return;
    deleteTrivia(trivia.id);
    window.location.href = '/';
  }

  function onDownload() {
    if (!trivia) return;
    downloadJson(`${slugify(trivia.title)}.json`, trivia);
  }
</script>

{#if state === 'loading'}
  <p class="text-sm text-slate-400">Loading…</p>
{:else if trivia}
  <div class="space-y-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-900">{trivia.title}</h1>
      {#if trivia.description}
        <p class="mt-1 text-slate-500">{trivia.description}</p>
      {/if}
      <p class="mt-1 text-xs text-slate-400">
        {trivia.questions.length} question{trivia.questions.length === 1 ? '' : 's'}
      </p>
    </div>
    <div class="flex gap-2">
      <a
        href={`/local/trivia/play?id=${trivia.id}`}
        class="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        <Play size={15} /> Play
      </a>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onclick={onDownload}
      >
        <Download size={15} /> Download JSON
      </button>
      <a
        href={`/local/trivia/edit?id=${trivia.id}`}
        class="flex items-center gap-1.5 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <Pencil size={15} /> Edit
      </a>
      <ConfirmDeleteButton onConfirm={onDelete} variant="button" label="Delete" />
    </div>
  </div>
{/if}
