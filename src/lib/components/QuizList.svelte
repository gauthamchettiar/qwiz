<script lang="ts">
  import { Download, Play, Trash2 } from '@lucide/svelte';
  import { deleteQuiz, listQuizzes } from '../store';
  import { downloadTextFile, slugify } from '../download';
  import { serializeQuizScript } from '../quizScript';
  import type { Quiz } from '../types';
  import CardMenu from './CardMenu.svelte';

  // Read on mount rather than at module scope: the page is prerendered to static HTML, where
  // localStorage doesn't exist yet.
  let quizzes = $state<Quiz[]>([]);
  $effect(() => {
    quizzes = listQuizzes();
  });

  // Which card's Delete item is showing its "Confirm delete?" state — at most one at a time,
  // and CardMenu's onClose resets it, so it can never linger open on a card whose menu closed.
  let confirmingId = $state<string | null>(null);

  function questionCountLabel(quiz: Quiz): string {
    const n = quiz.questions.length;
    return `${n} question${n === 1 ? '' : 's'}`;
  }

  function downloadQuiz(quiz: Quiz) {
    const doc = serializeQuizScript(
      { title: quiz.title, description: quiz.description, category: quiz.category, tags: quiz.tags, settings: quiz.settings },
      quiz.questions.map((q) => q.code)
    );
    downloadTextFile(`${slugify(quiz.title)}.qwiz`, doc);
  }

  function removeQuiz(id: string) {
    deleteQuiz(id);
    quizzes = quizzes.filter((q) => q.id !== id);
  }
</script>

{#if quizzes.length === 0}
  <p class="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400">
    No quizzes yet. Create one to get started.
  </p>
{:else}
  <ul class="space-y-3">
    {#each quizzes as quiz (quiz.id)}
      <!-- The menu button is a sibling of the link, not nested inside it — a <button> (let alone
           one opening a dropdown of more buttons) inside an <a> is invalid HTML and browsers
           handle its click/focus behavior inconsistently, so this also sidesteps ever needing to
           stopPropagation a click meant for one from reaching the other. -->
      <li class="relative rounded-lg border border-slate-200 bg-white transition-colors hover:border-slate-300 hover:shadow-sm">
        <a href={`/local/edit?id=${quiz.id}`} class="block p-4 pr-10">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="font-semibold text-slate-900">{quiz.title || 'Untitled quiz'}</h2>
            {#if quiz.category}
              <span class="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {quiz.category}
              </span>
            {/if}
          </div>
          {#if quiz.description}
            <p class="mt-1 line-clamp-2 text-sm text-slate-500">{quiz.description}</p>
          {/if}
          {#if quiz.tags.length > 0}
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each quiz.tags as tag (tag)}
                <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{tag}</span>
              {/each}
            </div>
          {/if}
          <p class="mt-3 text-xs text-slate-400">
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
                class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Play size={15} /> Play
              </a>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                onclick={() => {
                  downloadQuiz(quiz);
                  close();
                }}
              >
                <Download size={15} /> Download .qwiz
              </button>
              <div class="my-1 border-t border-slate-100"></div>
              {#if confirmingId === quiz.id}
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded bg-red-600 px-2.5 py-1.5 text-left text-sm font-medium text-white hover:bg-red-700"
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
                  class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
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
