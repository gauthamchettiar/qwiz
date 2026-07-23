<script lang="ts">
  import { Upload, FileUp, Sparkles } from '@lucide/svelte';
  import { importQwizSource } from '@/lib/utils/importQwiz';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';
  import ErrorList from './ErrorList.svelte';
  import SampleQuizzesDialog from './SampleQuizzesDialog.svelte';

  let dialog: Dialog;
  let sampleDialog: SampleQuizzesDialog;
  let fileInputEl: HTMLInputElement;
  let code = $state('');
  let fileName = $state('');
  let errors = $state<string[]>([]);
  let importing = $state(false);
  let dragging = $state(false);

  function openDialog() {
    errors = [];
    code = '';
    fileName = '';
    dragging = false;
    if (fileInputEl) fileInputEl.value = '';
    dialog.open();
  }

  async function readFile(file: File) {
    fileName = file.name;
    code = await file.text();
  }

  async function onFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await readFile(file);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }

  function onDragLeave() {
    dragging = false;
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) await readFile(file);
  }

  function importQuiz() {
    errors = [];
    importing = true;
    try {
      // Imports always become a brand-new quiz — never silently overwrite an existing id (see
      // importQwizSource).
      const { quiz, errors: importErrors } = importQwizSource(code);
      if (!quiz) {
        errors = importErrors;
        return;
      }
      window.location.href = '/';
    } finally {
      importing = false;
    }
  }
</script>

<Button size="sm" onclick={openDialog}>
  <Upload size={15} /> Import Qwiz
</Button>

<SampleQuizzesDialog bind:this={sampleDialog} />

<Dialog bind:this={dialog} title="Import a .qwiz file">
  {#snippet titleExtra()}
    <button
      type="button"
      class="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
      onclick={() => sampleDialog.open()}
    >
      <Sparkles size={12} /> Load a sample
    </button>
  {/snippet}
  {#snippet body()}
    <div
      role="button"
      tabindex="0"
      class="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-6 text-center transition-colors {dragging
        ? 'border-slate-400 bg-slate-100'
        : 'border-slate-300 bg-slate-50 hover:border-slate-400'}"
      onclick={() => fileInputEl.click()}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputEl.click()}
      ondragover={onDragOver}
      ondragleave={onDragLeave}
      ondrop={onDrop}
    >
      <FileUp size={22} class="text-slate-400" />
      <p class="text-sm font-medium text-slate-600">Drop a .qwiz file here, or click to browse</p>
      {#if fileName}
        <p class="text-xs text-slate-500">
          Selected: <span class="font-medium text-slate-700">{fileName}</span>
        </p>
      {/if}
    </div>
    <input
      bind:this={fileInputEl}
      type="file"
      accept=".qwiz,text/plain"
      onchange={onFileChange}
      class="hidden"
    />

    <div class="flex items-center gap-3 text-xs text-slate-500">
      <div class="h-px flex-1 bg-slate-200"></div>
      or write/paste qwiz code
      <div class="h-px flex-1 bg-slate-200"></div>
    </div>

    <textarea
      class="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      rows="10"
      placeholder="---
title: ...
---

choice: ..."
      bind:value={code}></textarea>

    <ErrorList {errors} />
  {/snippet}
  {#snippet footer()}
    <Button size="sm" onclick={() => dialog.close()}>Cancel</Button>
    <Button
      size="sm"
      variant="primary"
      disabled={importing || code.trim().length === 0}
      onclick={importQuiz}
    >
      {importing ? 'Validating…' : 'Validate & Import'}
    </Button>
  {/snippet}
</Dialog>
