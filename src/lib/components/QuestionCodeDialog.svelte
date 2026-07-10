<script lang="ts">
  import { X } from '@lucide/svelte';
  import { validateQuestionImport } from '../triviaSchema';
  import type { QuestionInstance } from '../types';

  let { question, onApply }: { question: QuestionInstance; onApply: (question: QuestionInstance) => void } = $props();

  let dialogEl: HTMLDialogElement;
  let jsonText = $state('');
  let errors = $state<string[]>([]);

  // `id` is deliberately left out of the edited JSON — it's an internal identifier, not
  // question content, so there's nothing meaningful for the user to change it to.
  export function open() {
    errors = [];
    jsonText = JSON.stringify({ type: question.type, data: question.data }, null, 2);
    dialogEl.showModal();
    dialogEl.focus();
  }

  function close() {
    dialogEl.close();
  }

  function apply() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      errors = ['That is not valid JSON.'];
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errors = ['Must be a JSON object with "type" and "data".'];
      return;
    }
    const { type, data } = parsed as { type?: unknown; data?: unknown };
    const candidate: QuestionInstance = { id: question.id, type: type as string, data };
    const result = validateQuestionImport(candidate);
    if (!result.valid) {
      errors = result.errors;
      return;
    }
    errors = [];
    onApply(candidate);
    close();
  }
</script>

<dialog
  bind:this={dialogEl}
  tabindex="-1"
  class="fixed inset-0 m-auto w-full max-w-lg rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40 focus:outline-none"
>
  <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
    <h2 class="text-base font-semibold text-slate-900">Edit question JSON</h2>
    <button
      type="button"
      class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      onclick={close}
      aria-label="Close"
    >
      <X size={16} />
    </button>
  </div>

  <div class="space-y-4 px-5 py-4">
    <textarea
      class="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      rows="16"
      bind:value={jsonText}
    ></textarea>

    {#if errors.length > 0}
      <div class="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        <ul class="list-inside list-disc space-y-1">
          {#each errors as err}
            <li>{err}</li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  <div class="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
    <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50" onclick={close}>
      Cancel
    </button>
    <button
      type="button"
      class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
      onclick={apply}
    >
      Apply
    </button>
  </div>
</dialog>
