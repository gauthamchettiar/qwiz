<script lang="ts">
  import { Upload, Download, FileUp, X } from '@lucide/svelte';
  import { validateTriviaImport, buildTriviaImportSchema } from '../triviaSchema';
  import { saveTrivia } from '../store';
  import { downloadJson } from '../download';
  import type { Trivia } from '../types';

  let dialogEl: HTMLDialogElement;
  let fileInputEl: HTMLInputElement;
  let jsonText = $state('');
  let fileName = $state('');
  let errors = $state<string[]>([]);
  let importing = $state(false);

  function openDialog() {
    errors = [];
    jsonText = '';
    fileName = '';
    if (fileInputEl) fileInputEl.value = '';
    dialogEl.showModal();
  }

  function closeDialog() {
    dialogEl.close();
  }

  async function onFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    fileName = file.name;
    jsonText = await file.text();
  }

  function importTrivia() {
    errors = [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      errors = ['That is not valid JSON.'];
      return;
    }

    importing = true;
    try {
      const result = validateTriviaImport(parsed);
      if (!result.valid) {
        errors = result.errors;
        return;
      }
      // Imports always become a brand-new trivia — never silently overwrite an existing id.
      const source = parsed as Trivia;
      const now = new Date().toISOString();
      const created: Trivia = { ...source, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
      saveTrivia(created);
      window.location.href = `/trivia?id=${created.id}`;
    } finally {
      importing = false;
    }
  }
</script>

<button
  type="button"
  class="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
  onclick={openDialog}
>
  <Upload size={15} /> Import JSON
</button>

<dialog
  bind:this={dialogEl}
  class="fixed inset-0 m-auto w-full max-w-lg rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
>
  <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
    <h2 class="text-base font-semibold text-slate-900">Import trivia from JSON</h2>
    <button
      type="button"
      class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      onclick={closeDialog}
      aria-label="Close"
    >
      <X size={16} />
    </button>
  </div>

  <div class="space-y-4 px-5 py-4">
    <div class="flex items-center justify-between gap-2">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onclick={() => fileInputEl.click()}
      >
        <FileUp size={15} /> Choose file
      </button>
      <button
        type="button"
        class="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
        onclick={() => downloadJson('qwiz-trivia.schema.json', buildTriviaImportSchema())}
      >
        <Download size={12} /> JSON Schema
      </button>
    </div>
    <input
      bind:this={fileInputEl}
      type="file"
      accept=".json,application/json"
      onchange={onFileChange}
      class="hidden"
    />
    {#if fileName}
      <p class="text-xs text-slate-500">Selected: <span class="font-medium text-slate-700">{fileName}</span></p>
    {/if}

    <div class="flex items-center gap-3 text-xs text-slate-400">
      <div class="h-px flex-1 bg-slate-200"></div>
      or paste JSON
      <div class="h-px flex-1 bg-slate-200"></div>
    </div>

    <textarea
      class="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      rows="8"
      placeholder={'{ "title": ... }'}
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
    <button
      type="button"
      class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      onclick={closeDialog}
    >
      Cancel
    </button>
    <button
      type="button"
      class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      disabled={importing || jsonText.trim().length === 0}
      onclick={importTrivia}
    >
      {importing ? 'Validating…' : 'Validate & Import'}
    </button>
  </div>
</dialog>
