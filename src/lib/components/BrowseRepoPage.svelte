<script lang="ts">
  import { onMount } from 'svelte';
  import { Download, Sparkles } from '@lucide/svelte';
  import { fetchRepoQuizData, getCachedRepoQuizData, parseRepoInput, type RepoQuizResult } from '../github';
  import { DEFAULT_REPO } from '../githubConfig';

  const EXAMPLE_REPO = 'https://github.com/gauthamchettiar/qwiz';

  let inputValue = $state('');
  let activeOwner = $state('');
  let activeRepo = $state('');
  let result = $state<RepoQuizResult | null>(null);
  let loading = $state(false);
  let error = $state('');

  onMount(() => {
    if (DEFAULT_REPO) {
      const parsed = parseRepoInput(DEFAULT_REPO);
      if (parsed) load(parsed.owner, parsed.repo);
    }
  });

  async function load(owner: string, repo: string, forceRefresh = false) {
    activeOwner = owner;
    activeRepo = repo;
    error = '';
    if (!forceRefresh) {
      const cached = getCachedRepoQuizData(owner, repo);
      if (cached) result = cached;
    }
    loading = true;
    const res = await fetchRepoQuizData(owner, repo);
    loading = false;
    if (res.ok) {
      result = res.result;
    } else {
      error = res.error;
    }
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    const parsed = parseRepoInput(inputValue);
    if (!parsed) {
      error = 'Enter a repo as "owner/repo" or a github.com URL.';
      return;
    }
    result = null;
    load(parsed.owner, parsed.repo);
  }

  function refresh() {
    if (activeOwner && activeRepo) load(activeOwner, activeRepo, true);
  }

  function loadExample() {
    inputValue = EXAMPLE_REPO;
    const parsed = parseRepoInput(EXAMPLE_REPO);
    if (!parsed) return;
    error = '';
    result = null;
    load(parsed.owner, parsed.repo);
  }

  function triviaHref(path: string): string {
    const repo = `${activeOwner}/${activeRepo}`;
    return `/trivia?github=${encodeURIComponent(repo)}&id=${encodeURIComponent(path)}&ref=${encodeURIComponent(result?.ref ?? '')}`;
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

  {#if loading && !result}
    <p class="text-sm text-slate-400">Loading trivias from {activeOwner}/{activeRepo}…</p>
  {/if}

  {#if error}
    <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
  {/if}

  {#if result}
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-slate-500">
        <a
          href={`https://github.com/${result.owner}/${result.repo}`}
          target="_blank"
          rel="noreferrer"
          class="hover:underline"
        >
          {result.owner}/{result.repo}
        </a>
      </h2>
      <button
        type="button"
        class="text-xs font-medium text-indigo-600 hover:underline disabled:text-slate-300"
        onclick={refresh}
        disabled={loading}
      >
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>

    {#if result.skipped.length > 0}
      <p class="text-xs text-slate-400">
        {result.skipped.length} file{result.skipped.length === 1 ? '' : 's'} skipped (invalid format).
      </p>
    {/if}

    {#each result.groups as group (group.name)}
      <div>
        <h3 class="mb-2 text-sm font-semibold text-slate-700">{group.name}</h3>
        <ul class="space-y-2">
          {#each group.trivias as t (t.path)}
            <li>
              <a
                href={triviaHref(t.path)}
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
      </div>
    {/each}
  {:else if !loading && !error}
    <p class="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
      Enter a public GitHub repo above to browse the trivias in its quiz-data/ folder.
    </p>
  {/if}
</div>
