<script lang="ts">
  import { validateQuestionImport } from '../triviaSchema';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';
  import ErrorList from './ErrorList.svelte';
  import type { QuestionInstance } from '../types';

  let { question, onApply }: { question: QuestionInstance; onApply: (question: QuestionInstance) => void } = $props();

  let dialog: Dialog;
  let jsonText = $state('');
  let errors = $state<string[]>([]);

  // `id` is deliberately left out of the edited JSON — it's an internal identifier, not
  // question content, so there's nothing meaningful for the user to change it to.
  export function open() {
    errors = [];
    jsonText = JSON.stringify({ type: question.type, data: question.data }, null, 2);
    dialog.open();
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
    dialog.close();
  }
</script>

<Dialog bind:this={dialog} title="Edit question JSON">
  {#snippet body()}
    <textarea
      class="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      rows="16"
      bind:value={jsonText}
    ></textarea>
    <ErrorList {errors} />
  {/snippet}
  {#snippet footer()}
    <Button size="sm" onclick={() => dialog.close()}>Cancel</Button>
    <Button size="sm" variant="primary" onclick={apply}>Apply</Button>
  {/snippet}
</Dialog>
