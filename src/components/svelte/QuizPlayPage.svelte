<script lang="ts">
  import { onMount } from 'svelte';
  import { getQuiz, saveQuiz } from '@/lib/stores/quizzes';
  import QuizPlayer from './QuizPlayer.svelte';
  import type { Quiz } from '@/lib/schemas/quiz';
  import type { ThemeTrust } from '@/lib/utils/themeCss';

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

  /** Remembers what the player decided about this quiz's theme, so a quiz in their own library
   * asks once rather than every time they open it. A failed write costs nothing but being asked
   * again, so unlike a quiz save it isn't surfaced — there's no action to offer. */
  function rememberTrust(trust: ThemeTrust) {
    if (!quiz) return;
    const updated = { ...quiz, themeTrust: trust };
    if (saveQuiz(updated)) quiz = updated;
  }
</script>

{#if quiz}
  <QuizPlayer {quiz} onTrustChange={rememberTrust} />
{:else if notFound}
  <p class="rounded-lg border border-line-subtle p-6 text-center text-sm text-ink-subtle">
    That quiz couldn't be found. It may have been deleted, or the link is wrong.
  </p>
{/if}
