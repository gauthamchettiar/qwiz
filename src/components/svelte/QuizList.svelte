<script lang="ts">
  import { Download, Link2, Play, Trash2 } from '@lucide/svelte';
  import { deleteQuiz, listQuizzes } from '@/lib/stores/quizzes';
  import { downloadTextFile, slugify } from '@/lib/utils/download';
  import { qwizSourceFromQuiz } from '@/lib/utils/qwizDocument';
  import type { Quiz } from '@/lib/schemas/quiz';
  import CardMenu from './CardMenu.svelte';
  import ErrorList from './ErrorList.svelte';
  import ShareQuizDialog from './ShareQuizDialog.svelte';

  // One dialog for the whole list, not one per card — it's a modal, so only ever one can be open,
  // and mounting N of them would put N <dialog> elements in the document for no reason.
  let shareDialog: ShareQuizDialog | undefined = $state();

  // A writable $derived: it reads from localStorage once at hydration time (the page is
  // prerendered to static HTML, where localStorage doesn't exist yet — listQuizzes() already
  // guards for that), then removeQuiz below overrides it directly for the optimistic update.
  let quizzes = $derived(listQuizzes());

  // Which card's Delete item is showing its "Confirm delete?" state — at most one at a time,
  // and CardMenu's onClose resets it, so it can never linger open on a card whose menu closed.
  let confirmingId = $state<string | null>(null);

  let errors = $state<string[]>([]);

  function questionCountLabel(quiz: Quiz): string {
    const n = quiz.questions.length;
    return `${n} question${n === 1 ? '' : 's'}`;
  }

  function downloadQuiz(quiz: Quiz) {
    downloadTextFile(`${slugify(quiz.title)}.qwiz`, qwizSourceFromQuiz(quiz));
  }

  function shareQuiz(quiz: Quiz) {
    void shareDialog?.open(qwizSourceFromQuiz(quiz));
  }

  function removeQuiz(id: string) {
    if (!deleteQuiz(id)) {
      errors = ["Couldn't delete — your browser's storage might be unavailable right now."];
      return;
    }
    errors = [];
    quizzes = quizzes.filter((q) => q.id !== id);
  }
</script>

<ErrorList {errors} />

{#if quizzes.length === 0}
  <p class="rounded-lg border border-line-subtle p-6 text-center text-sm text-ink-subtle">
    No quizzes yet. Create one to get started.
  </p>
{:else}
  <ul class="space-y-3">
    {#each quizzes as quiz (quiz.id)}
      <!-- The menu button is a sibling of the link, not nested inside it — a <button> (let alone
           one opening a dropdown of more buttons) inside an <a> is invalid HTML and browsers
           handle its click/focus behavior inconsistently, so this also sidesteps ever needing to
           stopPropagation a click meant for one from reaching the other. -->
      <li
        class="relative rounded-lg border border-line-subtle bg-surface-raised transition-colors hover:border-line hover:shadow-sm"
      >
        <a href={`/local/edit?id=${quiz.id}`} class="block p-3.5 pr-10">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-sm font-semibold text-ink">{quiz.title || 'Untitled quiz'}</h2>
            {#if quiz.category}
              <span
                class="shrink-0 rounded-md bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-ink-strong"
              >
                {quiz.category}
              </span>
            {/if}
          </div>
          {#if quiz.description}
            <p class="mt-0.5 line-clamp-1 text-xs text-ink-subtle">{quiz.description}</p>
          {/if}
          <p class="mt-1.5 text-xs text-ink-subtle">
            {questionCountLabel(quiz)} · updated {new Date(quiz.updatedAt).toLocaleDateString()}
          </p>
        </a>
        <div class="absolute right-2 top-2">
          <CardMenu
            ariaLabel={`Actions for "${quiz.title || 'Untitled quiz'}"`}
            onClose={() => (confirmingId = null)}
          >
            {#snippet children(close)}
              <a
                href={`/local/play?id=${quiz.id}`}
                class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-ink-muted hover:bg-surface"
              >
                <Play size={15} /> Play
              </a>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-ink-muted hover:bg-surface"
                onclick={() => {
                  shareQuiz(quiz);
                  close();
                }}
              >
                <Link2 size={15} /> Share link
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-ink-muted hover:bg-surface"
                onclick={() => {
                  downloadQuiz(quiz);
                  close();
                }}
              >
                <Download size={15} /> Download .qwiz
              </button>
              <div class="my-1 border-t border-line-faint"></div>
              {#if confirmingId === quiz.id}
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded bg-negative px-2.5 py-1.5 text-left text-sm font-medium text-ink-inverse hover:bg-negative-hover"
                  onclick={() => {
                    removeQuiz(quiz.id);
                    close();
                  }}
                >
                  <Trash2 size={15} /> Confirm delete?
                </button>
              {:else}
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-negative-ink hover:bg-negative-surface"
                  onclick={() => (confirmingId = quiz.id)}
                >
                  <Trash2 size={15} /> Delete
                </button>
              {/if}
            {/snippet}
          </CardMenu>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<ShareQuizDialog bind:this={shareDialog} />
