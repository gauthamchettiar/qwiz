<script lang="ts">
  import { onMount } from 'svelte';
  import { Play, Download, Pencil } from '@lucide/svelte';
  import { getTrivia, deleteTrivia } from '../store';
  import { downloadJson, slugify } from '../download';
  import ConfirmDeleteButton from './ConfirmDeleteButton.svelte';
  import Button from './Button.svelte';
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
    <div class="flex flex-wrap gap-2">
      <Button variant="primary" href={`/local/trivia/play?id=${trivia.id}`}>
        <Play size={15} /> Play
      </Button>
      <Button onclick={onDownload}>
        <Download size={15} /> Download JSON
      </Button>
      <Button href={`/local/trivia/edit?id=${trivia.id}`}>
        <Pencil size={15} /> Edit
      </Button>
      <ConfirmDeleteButton onConfirm={onDelete} variant="button" label="Delete" />
    </div>
  </div>
{/if}
