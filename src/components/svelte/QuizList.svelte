<script lang="ts">
  import { Download, Link2, ListChecks, Play, Trash2 } from '@lucide/svelte';
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
  <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
    {#each quizzes as quiz (quiz.id)}
      <!-- The menu button is a sibling of the link, not nested inside it — a <button> (let alone
           one opening a dropdown of more buttons) inside an <a> is invalid HTML and browsers
           handle its click/focus behavior inconsistently, so this also sidesteps ever needing to
           stopPropagation a click meant for one from reaching the other. -->
      <!-- Cards stretch to the tallest in their row (the grid default) and the link is a column
           whose body is `flex-1`, so the meta row sits on the card's floor and the counts line up
           across a row however much title or description the cards beside it carry. -->
      <li
        class="relative rounded-xl border border-line-subtle bg-surface-raised transition-colors hover:border-accent-line-subtle hover:bg-surface"
      >
        <a href={`/local/edit?id=${quiz.id}`} class="flex h-full flex-col p-4 pr-10">
          <!-- The category is an eyebrow above the title rather than a chip beside it: at half the
               old width there isn't room for both on one line, and a long category was already
               squeezing the title it was meant to label. -->
          <div class="flex-1 pb-3">
            {#if quiz.category}
              <p class="mb-0.5 text-xs font-semibold uppercase tracking-wider text-accent-ink">
                {quiz.category}
              </p>
            {/if}
            <h2 class="line-clamp-2 text-base font-semibold leading-snug text-ink">
              {quiz.title || 'Untitled quiz'}
            </h2>
            {#if quiz.description}
              <p class="mt-1.5 line-clamp-3 text-xs leading-relaxed text-ink-subtle">
                {quiz.description}
              </p>
            {/if}
            {#if quiz.tags.length > 0}
              <ul class="mt-2.5 flex flex-wrap gap-1">
                {#each quiz.tags.slice(0, 3) as tag (tag)}
                  <li
                    class="rounded border border-line-subtle bg-surface px-1.5 py-0.5 text-xs text-ink-subtle"
                  >
                    {tag}
                  </li>
                {/each}
                {#if quiz.tags.length > 3}
                  <li class="px-1 py-0.5 text-xs text-ink-subtle">
                    +{quiz.tags.length - 3}
                  </li>
                {/if}
              </ul>
            {/if}
          </div>
          <div
            class="flex items-center justify-between gap-2 border-t border-line-faint pt-2.5 text-xs text-ink-subtle"
          >
            <span class="flex items-center gap-1.5">
              <ListChecks size={13} class="shrink-0" />
              {questionCountLabel(quiz)}
            </span>
            <!-- The word "Updated" stays: a bare date on a card is ambiguous between when the
                 quiz was made and when it was last touched, and the list is sorted by the latter. -->
            <span class="shrink-0">Updated {new Date(quiz.updatedAt).toLocaleDateString()}</span>
          </div>
        </a>
        <div class="absolute right-2 top-2.5">
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
