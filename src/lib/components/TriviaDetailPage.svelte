<script lang="ts">
  import { onMount } from 'svelte';
  import { Play, Download, Pencil, Share2 } from '@lucide/svelte';
  import { getTrivia, deleteTrivia } from '../store';
  import { downloadJson, slugify } from '../download';
  import { buildShareUrl } from '../share';
  import ConfirmDeleteButton from './ConfirmDeleteButton.svelte';
  import Button from './Button.svelte';
  import type { Trivia } from '../types';

  let state = $state<'loading' | 'ready'>('loading');
  let trivia = $state<Trivia | null>(null);
  let shareState = $state<'idle' | 'copied' | 'toobig'>('idle');

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

  async function onShare() {
    if (!trivia) return;
    const { url } = await buildShareUrl(trivia);
    if (!url) {
      shareState = 'toobig';
      setTimeout(() => (shareState = 'idle'), 4000);
      return;
    }
    await navigator.clipboard.writeText(url);
    shareState = 'copied';
    setTimeout(() => (shareState = 'idle'), 2000);
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
      <Button onclick={onShare}>
        <Share2 size={15} />
        {shareState === 'copied' ? 'Link copied!' : shareState === 'toobig' ? 'Too big — use Download' : 'Share link'}
      </Button>
      <ConfirmDeleteButton onConfirm={onDelete} variant="button" label="Delete" />
    </div>
    {#if shareState === 'toobig'}
      <p class="text-xs text-slate-400">This trivia is too large to pack into a link. Share the downloaded JSON instead.</p>
    {/if}
  </div>
{/if}
