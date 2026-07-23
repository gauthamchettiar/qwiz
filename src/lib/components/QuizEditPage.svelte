<script lang="ts">
  import { onMount } from 'svelte';
  import { getQuiz } from '../store';
  import QuizBuilder from './QuizBuilder.svelte';
  import type { Quiz } from '../types';

  // `?id=` rather than a dynamic `[id].astro` route: this site is fully static (see
  // astro.config.mjs — output: 'static', no adapter), and quiz ids only ever exist in the
  // visitor's own localStorage, never at build time, so there's no set of paths to prerender.
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
  <QuizBuilder initial={quiz} heading="Edit quiz" />
{:else if notFound}
  <p class="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400">
    That quiz couldn't be found. It may have been deleted, or the link is wrong.
  </p>
{/if}
