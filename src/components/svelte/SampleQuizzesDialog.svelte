<script lang="ts">
  import { sampleQuizzes } from '@/lib/utils/sampleQuizzes';
  import { importQwizSource } from '@/lib/utils/importQwiz';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';

  let dialog: Dialog;

  // Exposed so ImportQuizDialog (the only caller) can open this one from its own "Load a
  // sample" button — two stacked native <dialog>s, the sample list on top, works fine since
  // each is its own top-layer element.
  export function open() {
    dialog.open();
  }

  function loadSample(code: string) {
    // Every sample is verified (see the app's own test coverage) to parse with zero errors, so
    // `quiz` is always present here — the check exists only so a future regression fails loudly
    // instead of the button silently doing nothing.
    const { quiz, errors } = importQwizSource(code);
    if (!quiz) {
      console.error('Sample quiz failed to import:', errors);
      return;
    }
    window.location.href = `/local/edit?id=${quiz.id}`;
  }
</script>

<Dialog bind:this={dialog} title="Load a sample quiz">
  {#snippet body()}
    <p class="text-sm text-slate-500">
      Loads a copy into your saved quizzes so you can explore and edit it — nothing here is
      read-only.
    </p>
    <ul class="space-y-3">
      {#each sampleQuizzes as sample (sample.title)}
        <li class="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3">
          <div>
            <h3 class="text-sm font-semibold text-slate-900">{sample.title}</h3>
            <p class="mt-0.5 text-xs text-slate-500">{sample.description}</p>
          </div>
          <Button size="sm" onclick={() => loadSample(sample.code)}>Load</Button>
        </li>
      {/each}
    </ul>
  {/snippet}
  {#snippet footer()}
    <Button size="sm" onclick={() => dialog.close()}>Close</Button>
  {/snippet}
</Dialog>
