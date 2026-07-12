<script lang="ts">
  import { onMount } from 'svelte';
  import { Share2 } from '@lucide/svelte';
  import { getTrivia } from '../store';
  import { buildShareUrl } from '../share';
  import TriviaPlayer from './TriviaPlayer.svelte';
  import type { Trivia } from '../types';

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
  });

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

{#if trivia}
  <div class="mb-6 flex items-start justify-between gap-3">
    <h1 class="text-2xl font-bold text-slate-900">{trivia.title}</h1>
    <button
      type="button"
      class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      onclick={onShare}
    >
      <Share2 size={15} />
      {shareState === 'copied' ? 'Link copied!' : shareState === 'toobig' ? 'Too big — use Download' : 'Share'}
    </button>
  </div>
  {#if shareState === 'toobig'}
    <p class="-mt-4 mb-6 text-xs text-slate-400">This trivia is too large to pack into a link. Download its JSON from the home page instead.</p>
  {/if}
  <TriviaPlayer {trivia} />
{/if}
