<script lang="ts">
  import { Plus, Download, Upload, Trash2, FolderGit2, ChevronDown } from '@lucide/svelte';
  import { listTrivias, getTrivia } from '../store';
  import { validateTriviaImport } from '../triviaSchema';
  import {
    loadRepoState,
    saveRepoState,
    pathOf,
    buildFiles,
    buildDescription,
    repoWarnings,
    type RepoBuilderState,
    type RepoEntry,
    type RepoMode
  } from '../repoBuilder';
  import { createZip } from '../zip';
  import { clickOutside } from '../clickOutside';
  import Button from './Button.svelte';
  import ErrorList from './ErrorList.svelte';
  import type { Trivia, TriviaSummary } from '../types';

  let state = $state<RepoBuilderState>(loadRepoState());
  let saved = $state<TriviaSummary[]>(listTrivias());
  let loaded = $state(false);
  let showPicker = $state(false);
  let importErrors = $state<string[]>([]);
  let fileEl: HTMLInputElement;

  // Persist on change (skip the very first run so we don't write back before anything changed).
  $effect(() => {
    const snapshot = $state.snapshot(state);
    if (!loaded) {
      loaded = true;
      return;
    }
    saveRepoState(snapshot as RepoBuilderState);
  });

  const warnings = $derived(repoWarnings(state));
  const files = $derived(buildFiles(state));
  const description = $derived(buildDescription(state));

  const modes: { value: RepoMode; label: string; hint: string }[] = [
    { value: 'folder', label: 'Folder', hint: 'Plain folders — the browser groups trivias by folder.' },
    { value: 'journey', label: 'Journey', hint: 'An unlock tree: clear one trivia to reveal the next.' },
    { value: 'category', label: 'Category', hint: 'Pick a category every few questions; scored on average.' }
  ];
  const currentHint = $derived(modes.find((m) => m.value === state.mode)?.hint ?? '');

  function addTrivia(trivia: Trivia) {
    const entry: RepoEntry = { id: crypto.randomUUID(), folder: '', filename: '', trivia, requires: [] };
    state.entries = [...state.entries, entry];
  }
  function addFromSaved(id: string) {
    const t = getTrivia(id);
    if (t) addTrivia(t);
    showPicker = false;
  }
  async function onImport(e: Event) {
    importErrors = [];
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      importErrors = ['That file is not valid JSON.'];
      return;
    }
    const { valid, errors } = validateTriviaImport(parsed);
    if (!valid) {
      importErrors = errors;
      return;
    }
    addTrivia(parsed as Trivia);
    fileEl.value = '';
  }

  function updateEntry(id: string, patch: Partial<RepoEntry>) {
    state.entries = state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
  }
  function removeEntry(id: string) {
    // Also drop it from any other entry's prerequisites.
    state.entries = state.entries
      .filter((e) => e.id !== id)
      .map((e) => ({ ...e, requires: e.requires.filter((r) => r !== id) }));
  }
  function toggleRequire(entryId: string, prereqId: string) {
    const e = state.entries.find((x) => x.id === entryId);
    if (!e) return;
    const requires = e.requires.includes(prereqId) ? e.requires.filter((r) => r !== prereqId) : [...e.requires, prereqId];
    updateEntry(entryId, { requires });
  }

  function download() {
    const blob = createZip(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quiz-data.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<div class="space-y-6">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h1 class="flex items-center gap-2 text-2xl font-bold text-slate-900"><FolderGit2 size={22} /> Repo Builder</h1>
      <p class="mt-1 max-w-prose text-sm text-slate-500">
        Assemble trivias into a <code class="rounded bg-slate-100 px-1 text-xs">quiz-data/</code> folder — with optional
        journey or category modes — and download it as a zip to commit to a GitHub repo. The Browse page can then load it.
      </p>
    </div>
    <Button variant="primary" disabled={state.entries.length === 0} onclick={download}>
      <Download size={15} /> Download zip
    </Button>
  </div>

  <ErrorList errors={warnings} size="md" />

  <!-- Trivias --------------------------------------------------------------------------->
  <div class="space-y-3 rounded-lg border border-slate-200 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-slate-700">Trivias ({state.entries.length})</h2>
      <div class="flex items-center gap-2">
        <div class="relative" use:clickOutside={() => (showPicker = false)}>
          <Button size="sm" onclick={() => (showPicker = !showPicker)}>
            <Plus size={14} /> Add saved <ChevronDown size={13} />
          </Button>
          {#if showPicker}
            <div class="absolute right-0 z-10 mt-1 max-h-64 w-64 overflow-auto rounded-md border border-slate-200 bg-white p-1 shadow-md">
              {#if saved.length === 0}
                <p class="p-2 text-xs text-slate-400">No saved trivias yet.</p>
              {:else}
                {#each saved as t (t.id)}
                  <button
                    type="button"
                    class="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                    onclick={() => addFromSaved(t.id)}
                  >
                    {t.title}
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
        <Button size="sm" onclick={() => fileEl.click()}>
          <Upload size={14} /> Import JSON
        </Button>
        <input bind:this={fileEl} type="file" accept=".json,application/json" class="hidden" onchange={onImport} />
      </div>
    </div>

    <ErrorList errors={importErrors} />

    {#if state.entries.length === 0}
      <p class="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        Add trivias from your saved list or import JSON files.
      </p>
    {:else}
      <ul class="space-y-2">
        {#each state.entries as entry (entry.id)}
          <li class="rounded-md border border-slate-200 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{entry.trivia.title || 'Untitled'}</span>
              <label class="flex items-center gap-1 text-xs text-slate-500">
                Folder
                <input
                  type="text"
                  class="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  placeholder="(root)"
                  value={entry.folder}
                  oninput={(e) => updateEntry(entry.id, { folder: e.currentTarget.value })}
                />
              </label>
              <label class="flex items-center gap-1 text-xs text-slate-500">
                File
                <input
                  type="text"
                  class="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  placeholder={entry.trivia.title || 'name'}
                  value={entry.filename}
                  oninput={(e) => updateEntry(entry.id, { filename: e.currentTarget.value })}
                />
              </label>
              <button
                type="button"
                class="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                onclick={() => removeEntry(entry.id)}
                aria-label="Remove"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <p class="mt-1 text-xs text-slate-400">→ {pathOf(entry)}</p>

            {#if state.mode === 'journey'}
              <div class="mt-2 border-t border-slate-100 pt-2">
                <p class="mb-1 text-xs font-medium text-slate-500">Unlocks after (prerequisites)</p>
                {#if state.entries.length === 1}
                  <p class="text-xs text-slate-400">Add more trivias to set prerequisites.</p>
                {:else}
                  <div class="flex flex-wrap gap-x-4 gap-y-1">
                    {#each state.entries.filter((o) => o.id !== entry.id) as other (other.id)}
                      <label class="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          class="h-3.5 w-3.5 accent-slate-900"
                          checked={entry.requires.includes(other.id)}
                          onchange={() => toggleRequire(entry.id, other.id)}
                        />
                        {other.trivia.title || 'Untitled'}
                      </label>
                    {/each}
                  </div>
                  {#if entry.requires.length > 0}
                    <label class="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        class="h-3.5 w-3.5 accent-slate-900"
                        checked={entry.requireWin ?? false}
                        onchange={(e) => updateEntry(entry.id, { requireWin: e.currentTarget.checked })}
                      />
                      Require winning those (not just finishing)
                    </label>
                  {/if}
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- Mode ------------------------------------------------------------------------------>
  <div class="space-y-3 rounded-lg border border-slate-200 p-4">
    <h2 class="text-sm font-semibold text-slate-700">Repo mode</h2>
    <div class="inline-flex overflow-hidden rounded-md border border-slate-300">
      {#each modes as m, i (m.value)}
        <button
          type="button"
          class="px-3 py-1.5 text-sm font-medium {state.mode === m.value
            ? 'bg-slate-900 text-white'
            : 'bg-white text-slate-600 hover:bg-slate-100'} {i > 0 ? 'border-l border-slate-300' : ''}"
          onclick={() => (state.mode = m.value)}
        >
          {m.label}
        </button>
      {/each}
    </div>
    <p class="text-xs text-slate-400">{currentHint}</p>

    {#if state.mode !== 'folder'}
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-xs font-medium text-slate-600">
          Title
          <input
            type="text"
            class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="e.g. The Qwiz Trail"
            bind:value={state.title}
          />
        </label>
        <label class="text-xs font-medium text-slate-600">
          Description
          <input
            type="text"
            class="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Shown on the challenge screen"
            bind:value={state.description}
          />
        </label>
      </div>
    {/if}

    {#if state.mode === 'journey'}
      <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
        <input type="checkbox" class="h-4 w-4 accent-slate-900" bind:checked={state.requireWin} />
        By default, prerequisites must be won (cracked) to unlock — not just finished
      </label>
    {:else if state.mode === 'category'}
      <div class="flex flex-wrap gap-4">
        <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
          Questions per pick
          <input type="number" min="1" class="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm" bind:value={state.questionsPerPick} />
        </label>
        <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
          Rounds
          <input type="number" min="1" class="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm" bind:value={state.rounds} />
        </label>
      </div>
    {/if}
  </div>

  <!-- Preview --------------------------------------------------------------------------->
  {#if state.entries.length > 0}
    <details class="group rounded-lg border border-slate-200">
      <summary class="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900">
        Preview files ({files.length})
        <ChevronDown size={14} class="ml-auto text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div class="space-y-3 border-t border-slate-100 p-4">
        <ul class="space-y-0.5 font-mono text-xs text-slate-600">
          {#each files as f (f.name)}<li>{f.name}</li>{/each}
        </ul>
        {#if description}
          <div>
            <p class="mb-1 text-xs font-medium text-slate-500">quiz-data/description.json</p>
            <pre class="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">{JSON.stringify(description, null, 2)}</pre>
          </div>
        {/if}
      </div>
    </details>
  {/if}
</div>
