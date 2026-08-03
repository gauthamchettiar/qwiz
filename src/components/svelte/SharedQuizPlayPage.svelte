<script lang="ts">
  import { onMount } from 'svelte';
  import { decodeSharePayload, readSharePayload } from '@/lib/utils/shareLink';
  import { quizFromQwizSource } from '@/lib/utils/importQwiz';
  import QuizPlayer from './QuizPlayer.svelte';
  import ErrorList from './ErrorList.svelte';
  import type { Quiz } from '@/lib/schemas/quiz';

  // The shared-link counterpart to QuizPlayPage: same "resolve at mount or show why not" shape,
  // but the quiz comes out of the URL fragment rather than out of localStorage, and is never
  // written there — see `quizFromQwizSource`. `client:only` for the same reason as the id-driven
  // pages: there is nothing to render until the fragment has been read and decoded.
  let quiz = $state<Quiz | null>(null);
  let source = $state('');
  let errors = $state<string[]>([]);

  onMount(async () => {
    const payload = readSharePayload(window.location.hash);
    if (!payload) {
      errors = ["This link doesn't have a quiz in it. It may have been cut short when shared."];
      return;
    }

    const decoded = await decodeSharePayload(payload);
    if (!decoded.source) {
      errors = [decoded.error ?? "This link couldn't be read."];
      return;
    }

    // The decoded document still has to parse — a link can carry a quiz written against an older
    // format just as a file can, and it gets the same errors rather than a blank screen.
    const built = quizFromQwizSource(decoded.source);
    if (!built.quiz) {
      errors = built.errors;
      return;
    }
    source = decoded.source;
    quiz = built.quiz;
  });
</script>

{#if quiz}
  <QuizPlayer {quiz} saveCopySource={source} />
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
