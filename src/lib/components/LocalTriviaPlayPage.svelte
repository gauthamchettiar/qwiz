<script lang="ts">
  import { onMount } from 'svelte';
  import { getTrivia } from '../store';
  import TriviaPlayer from './TriviaPlayer.svelte';
  import type { Trivia } from '../types';

  let trivia = $state<Trivia | null>(null);

  onMount(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    const found = id ? getTrivia(id) : null;
    if (!found) {
      window.location.href = '/';
      return;
    }
    trivia = found;
  });
</script>

{#if trivia}
  <h1 class="mb-6 text-2xl font-bold text-slate-900">{trivia.title}</h1>
  <TriviaPlayer {trivia} />
{/if}
