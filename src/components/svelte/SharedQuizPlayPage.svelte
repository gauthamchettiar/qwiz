<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2, FileText } from '@lucide/svelte';
  import { readQuizSourceRef } from '@/lib/utils/remoteSource';
  import { resolveQuizSource } from '@/lib/remote/quizSource';
  import { quizFromQwizSource } from '@/lib/utils/importQwiz';
  import QuizPlayer from './QuizPlayer.svelte';
  import ErrorList from './ErrorList.svelte';
  import type { GistFile } from '@/lib/remote/github';
  import type { Quiz } from '@/lib/schemas/quiz';

  // The counterpart to QuizPlayPage: same "resolve at mount or show why not" shape, but the quiz
  // comes out of the URL rather than out of localStorage, and is never written there — see
  // `quizFromQwizSource`. `client:only` for the same reason as the id-driven pages: there is
  // nothing to render until the URL has been read.
  //
  // Three things can be on that URL now (see `readQuizSourceRef`): a compressed document in the
  // fragment, a gist, or one file in a repository. Only the first resolves without a network round
  // trip, which is why this now has a loading state the fragment-only version never needed.
  let quiz = $state<Quiz | null>(null);
  let source = $state('');
  let errors = $state<string[]>([]);
  let loading = $state(true);
  let choices = $state<GistFile[] | null>(null);

  function play(text: string) {
    // The document still has to parse — a link can carry a quiz written against an older format
    // just as a file can, and it gets the same errors rather than a blank screen.
    const built = quizFromQwizSource(text);
    if (!built.quiz) {
      errors = built.errors;
      return;
    }
    source = text;
    quiz = built.quiz;
  }

  onMount(async () => {
    try {
      const { ref, error } = readQuizSourceRef(window.location.search, window.location.hash);
      if (error) {
        errors = [error];
        return;
      }
      if (!ref) {
        errors = ["This link doesn't have a quiz in it. It may have been cut short when shared."];
        return;
      }

      const resolved = await resolveQuizSource(ref);
      if (resolved.choices) {
        choices = resolved.choices;
        return;
      }
      if (!resolved.source) {
        errors = [resolved.error ?? "This link couldn't be read."];
        return;
      }
      play(resolved.source);
    } finally {
      loading = false;
    }
  });
</script>

{#if quiz}
  <QuizPlayer {quiz} saveCopySource={source} />
{:else if loading}
  <p
    class="flex items-center justify-center gap-2 rounded-lg border border-line-subtle p-6 text-sm text-ink-subtle"
  >
    <Loader2 size={16} class="animate-spin" /> Loading the quiz…
  </p>
{:else if choices}
  <!-- A gist can hold several quizzes and the link didn't name one. Playing the first would
       silently play the wrong quiz, so this asks rather than guesses. -->
  <div class="space-y-4 rounded-lg border border-line-subtle bg-surface-raised p-6">
    <div class="space-y-1">
      <h1 class="text-xl font-bold text-ink">Which quiz?</h1>
      <p class="text-sm text-ink-subtle">This gist has more than one quiz in it.</p>
    </div>
    <ul class="space-y-2">
      {#each choices as file (file.name)}
        <li>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md border border-line-subtle bg-surface px-3 py-2 text-left text-sm font-medium text-ink hover:border-line-strong hover:bg-surface-hover"
            onclick={() => {
              choices = null;
              play(file.content);
            }}
          >
            <FileText size={15} class="text-ink-faint" />
            {file.name}
          </button>
        </li>
      {/each}
    </ul>
  </div>
{:else if errors.length > 0}
  <div class="space-y-4">
    <ErrorList {errors} />
    <p class="text-center">
      <a href="/" class="text-sm font-medium text-accent-ink hover:underline">
        Go to your own quizzes
      </a>
    </p>
  </div>
{/if}
