<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronDown, ChevronRight, Download, Sparkles } from '@lucide/svelte';
  import {
    fetchRepoQuizData,
    getCachedRepoQuizData,
    parseRepoInput,
    getBrowsedRepos,
    addBrowsedRepo,
    type RepoQuizResult
  } from '../github';
  import { DEFAULT_REPO } from '../githubConfig';

  const EXAMPLE_REPO = 'https://github.com/gauthamchettiar/qwiz';

  interface RepoEntry {
    owner: string;
    repo: string;
    status: 'loading' | 'ready' | 'error';
    result?: RepoQuizResult;
    error?: string;
  }

  let inputValue = $state('');
  let repos = $state<RepoEntry[]>([]);
  let formError = $state('');

  onMount(() => {
    const saved = getBrowsedRepos();
    const seeds = saved.length > 0 ? saved : DEFAULT_REPO ? [DEFAULT_REPO] : [];
    for (const key of seeds) {
      const parsed = parseRepoInput(key);
      if (parsed) load(parsed.owner, parsed.repo, false);
    }
  });

  function upsertEntry(owner: string, repo: string, patch: Partial<RepoEntry>) {
    const idx = repos.findIndex((r) => r.owner === owner && r.repo === repo);
    if (idx === -1) {
      repos = [{ owner, repo, status: 'loading', ...patch }, ...repos];
    } else {
      repos = repos.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    }
  }

  // `remember` is false when restoring already-browsed repos on mount, so we don't just
  // re-write the same history list we're reading from.
  async function load(owner: string, repo: string, remember = true) {
    formError = '';
    if (remember) addBrowsedRepo(owner, repo);
    const cached = getCachedRepoQuizData(owner, repo);
    upsertEntry(owner, repo, { status: 'loading', result: cached ?? undefined, error: undefined });
    const res = await fetchRepoQuizData(owner, repo);
    if (res.ok) upsertEntry(owner, repo, { status: 'ready', result: res.result, error: undefined });
    else upsertEntry(owner, repo, { status: 'error', error: res.error });
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    const parsed = parseRepoInput(inputValue);
    if (!parsed) {
      formError = 'Enter a repo as "owner/repo" or a github.com URL.';
      return;
    }
    load(parsed.owner, parsed.repo);
  }

  function loadExample() {
    inputValue = EXAMPLE_REPO;
    const parsed = parseRepoInput(EXAMPLE_REPO);
    if (parsed) load(parsed.owner, parsed.repo);
  }

  function refresh(e: Event, owner: string, repo: string) {
    e.preventDefault();
    load(owner, repo, false);
  }

  function triviaHref(owner: string, repo: string, ref: string, path: string): string {
    const repoKey = `${owner}/${repo}`;
    return `/trivia?github=${encodeURIComponent(repoKey)}&id=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`;
  }
</script>

<div class="space-y-6">
  <form class="flex gap-2" onsubmit={onSubmit}>
    <input
      type="text"
      class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      placeholder="owner/repo or https://github.com/owner/repo"
      bind:value={inputValue}
    />
    <button
      type="submit"
      class="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
    >
      <Download size={15} /> Load
    </button>
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      onclick={loadExample}
    >
      <Sparkles size={15} /> Load Example
    </button>
  </form>

  {#if formError}
    <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>
  {/if}

  <div class="space-y-3">
    {#each repos as entry (entry.owner + '/' + entry.repo)}
      <details open class="group/repo overflow-hidden rounded-lg border border-slate-200 bg-white">
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50"
        >
          <div class="flex items-center gap-2">
            <ChevronDown size={15} class="text-slate-400 transition-transform group-open/repo:rotate-180" />
            <a
              href={`https://github.com/${entry.owner}/${entry.repo}`}
              target="_blank"
              rel="noreferrer"
              onclick={(e) => e.stopPropagation()}
              class="text-sm font-semibold text-slate-900 hover:underline"
            >
              {entry.owner}/{entry.repo}
            </a>
            {#if entry.status === 'loading'}<span class="text-xs text-slate-400">Loading…</span>{/if}
          </div>
          <button
            type="button"
            class="text-xs font-medium text-indigo-600 hover:underline disabled:text-slate-300"
            disabled={entry.status === 'loading'}
            onclick={(e) => refresh(e, entry.owner, entry.repo)}
          >
            {entry.status === 'loading' ? 'Refreshing…' : 'Refresh'}
          </button>
        </summary>
        <div class="space-y-2 border-t border-slate-100 px-4 py-3">
          {#if entry.error}
            <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{entry.error}</div>
          {/if}
          {#if entry.result}
            {#if entry.result.skipped.length > 0}
              <p class="text-xs text-slate-400">
                {entry.result.skipped.length} file{entry.result.skipped.length === 1 ? '' : 's'} skipped (invalid format).
              </p>
            {/if}
            {#each entry.result.groups as group (group.name)}
              <details class="group/g rounded-md border border-slate-100">
                <summary
                  class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ChevronRight size={13} class="text-slate-400 transition-transform group-open/g:rotate-90" />
                  {group.name}
                  <span class="text-xs font-normal text-slate-400">({group.trivias.length})</span>
                </summary>
                <ul class="space-y-2 border-t border-slate-100 p-3">
                  {#each group.trivias as t (t.path)}
                    <li>
                      <a
                        href={triviaHref(entry.owner, entry.repo, entry.result.ref, t.path)}
                        class="block rounded-lg border border-dashed border-slate-300 bg-white p-4 hover:border-indigo-300"
                      >
                        <div class="flex items-center justify-between">
                          <span class="font-semibold text-slate-900">{t.title}</span>
                          <span class="text-xs text-slate-400">
                            {t.questionCount} question{t.questionCount === 1 ? '' : 's'}
                          </span>
                        </div>
                        {#if t.description}
                          <p class="mt-1 text-sm text-slate-500">{t.description}</p>
                        {/if}
                      </a>
                    </li>
                  {/each}
                </ul>
              </details>
            {/each}
          {/if}
        </div>
      </details>
    {/each}

    {#if repos.length === 0}
      <p class="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        Enter a public GitHub repo above to browse the trivias in its quiz-data/ folder.
      </p>
    {/if}
  </div>
</div>
