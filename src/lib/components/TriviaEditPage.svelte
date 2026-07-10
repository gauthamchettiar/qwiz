<script lang="ts">
  import { onMount } from 'svelte';
  import { getTrivia } from '../store';
  import TriviaBuilder from './TriviaBuilder.svelte';
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
  <TriviaBuilder initial={trivia} heading="Edit trivia" />
{/if}
