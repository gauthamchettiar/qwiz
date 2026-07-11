<script lang="ts">
  import { Download, Upload } from '@lucide/svelte';
  import { exportAllTrivias, importAllTrivias } from '../store';
  import { downloadJson } from '../download';
  import { validateTriviaImport } from '../triviaSchema';
  import type { Trivia } from '../types';

  const BACKUP_KIND = 'qwiz-backup';

  let fileEl: HTMLInputElement;
  let message = $state('');
  let error = $state('');

  function exportAll() {
    const trivias = exportAllTrivias();
    if (trivias.length === 0) {
      error = 'Nothing to export yet — save a trivia first.';
      return;
    }
    error = '';
    downloadJson('qwiz-backup.json', { kind: BACKUP_KIND, version: 1, exportedAt: new Date().toISOString(), trivias });
    message = `Exported ${trivias.length} triv${trivias.length === 1 ? 'ia' : 'ias'}.`;
  }

  async function onFile(e: Event) {
    error = '';
    message = '';
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      error = "That file isn't valid JSON.";
      return;
    }
    const list = (parsed as { trivias?: unknown })?.trivias;
    if (!Array.isArray(list)) {
      error = "This doesn't look like a Qwiz backup (no trivias array).";
      return;
    }
    // Validate each one against the trivia schema before touching the store.
    for (let i = 0; i < list.length; i++) {
      const { valid, errors } = validateTriviaImport(list[i]);
      if (!valid) {
        error = `Backup item ${i + 1} is invalid: ${errors[0] ?? 'unknown error'}`;
        return;
      }
    }
    const n = importAllTrivias(list as Trivia[]);
    fileEl.value = '';
    message = `Imported ${n} triv${n === 1 ? 'ia' : 'ias'}. Reloading…`;
    setTimeout(() => window.location.reload(), 600);
  }
</script>

<div class="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 text-sm">
  <span class="text-xs font-medium text-slate-400">Backup</span>
  <button
    type="button"
    class="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    onclick={exportAll}
  >
    <Download size={15} /> Export all
  </button>
  <button
    type="button"
    class="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    onclick={() => fileEl.click()}
  >
    <Upload size={15} /> Import all
  </button>
  <input bind:this={fileEl} type="file" accept=".json,application/json" class="hidden" onchange={onFile} />
  {#if message}<span class="text-xs text-slate-500">{message}</span>{/if}
  {#if error}<span class="text-xs text-red-600">{error}</span>{/if}
</div>
