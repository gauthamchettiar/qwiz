<script lang="ts">
  import { onMount } from 'svelte';
  import { getQuiz } from '../store';
  import QuizPlayer from './QuizPlayer.svelte';
  import type { Quiz } from '../types';

  // Same `?id=` pattern as QuizEditPage — quiz ids only exist in the visitor's own localStorage,
  // never at build time, so there's no dynamic route to prerender (see astro.config.mjs).
  let quiz = $state<Quiz | null>(null);
  let notFound = $state(false);

  onMount(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    const found = id ? getQuiz(id) : null;
    if (!found) {
      notFound = true;
      return;
    }
    quiz = found;
  });
</script>

{#if quiz}
  <QuizPlayer {quiz} />
{:else if notFound}
  <p class="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400">
    That quiz couldn't be found. It may have been deleted, or the link is wrong.
  </p>
{/if}
