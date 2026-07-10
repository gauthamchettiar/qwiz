<script lang="ts">
  import { onMount } from 'svelte';
  import { resolveTriviaFromParams } from '../resolveTrivia';
  import TriviaBuilder from './TriviaBuilder.svelte';
  import type { Trivia } from '../types';

  let trivia = $state<Trivia | null>(null);

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const result = await resolveTriviaFromParams(params);
    // Read-only trivias (GitHub-sourced, or a broken/missing link) can't be edited — guards
    // direct URL navigation, since the Edit button on the detail page is already disabled
    // (not linked) for these.
    if (!result || result.readOnly || !result.trivia) {
      window.location.href = result?.trivia ? `/trivia?${params.toString()}` : '/';
      return;
    }
    trivia = result.trivia;
  });
</script>

{#if trivia}
  <h1 class="mb-6 text-2xl font-bold text-slate-900">Edit trivia</h1>
  <TriviaBuilder initial={trivia} />
{/if}
