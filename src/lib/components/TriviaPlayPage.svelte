<script lang="ts">
  import { onMount } from 'svelte';
  import { resolveTriviaFromParams } from '../resolveTrivia';
  import TriviaPlayer from './TriviaPlayer.svelte';
  import type { Trivia } from '../types';

  let state = $state<'loading' | 'ready' | 'error'>('loading');
  let trivia = $state<Trivia | null>(null);
  let errorMessage = $state('');

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const result = await resolveTriviaFromParams(params);
    if (!result) {
      window.location.href = '/';
      return;
    }
    if (!result.trivia) {
      errorMessage = result.error;
      state = 'error';
      return;
    }
    trivia = result.trivia;
    state = 'ready';
  });
</script>

{#if state === 'loading'}
  <p class="text-sm text-slate-400">Loading…</p>
{:else if state === 'error'}
  <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <p>{errorMessage}</p>
    <a href="/browse" class="mt-2 inline-block text-indigo-600 hover:underline">Back to Browse</a>
  </div>
{:else if trivia}
  <h1 class="mb-6 text-2xl font-bold text-slate-900">{trivia.title}</h1>
  <TriviaPlayer trivia={trivia} />
{/if}
