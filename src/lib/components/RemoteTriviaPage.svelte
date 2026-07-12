<script lang="ts">
  import { onMount } from 'svelte';
  import { Play, Download, Copy, ArrowLeft, RefreshCw, ChevronsUpDown, ChevronsDownUp } from '@lucide/svelte';
  import JourneyView from './JourneyView.svelte';
  import FolderTree from './FolderTree.svelte';
  import CategorySession from './CategorySession.svelte';
  import { buildFolderTree, allFolderPaths, type FolderNode } from '../folderTree';
  import {
    fetchGithubTrivia,
    fetchRepoQuizData,
    getCachedRepoQuizData,
    parseRepoInput,
    addBrowsedRepo,
    type RepoQuizResult
  } from '../github';
  import { saveTrivia } from '../store';
  import { downloadJson, slugify } from '../download';
  import Button from './Button.svelte';
  import type { Trivia } from '../types';

  type PageState =
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'trivia'; trivia: Trivia; owner: string; repo: string; path: string; ref: string }
    | { kind: 'repo'; owner: string; repo: string; result: RepoQuizResult };

  let state = $state<PageState>({ kind: 'loading' });
  let copied = $state(false);
  let refreshing = $state(false);
  // Open/closed state per group, so Expand/Collapse all can drive every <details> at once.
  let openGroups = $state<Record<string, boolean>>({});

  function setAllFolders(tree: FolderNode, open: boolean) {
    const next: Record<string, boolean> = { ...openGroups };
    for (const p of allFolderPaths(tree)) next[p] = open;
    openGroups = next;
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const parsed = parseRepoInput(params.get('github') ?? '');
    if (!parsed) {
      window.location.href = '/remote/browse';
      return;
    }
    const path = params.get('id');
    const ref = params.get('ref') ?? undefined;

    // A path (`id`) means "view one trivia file"; no path means "view this repo's trivia list".
    if (path) {
      const result = await fetchGithubTrivia(parsed.owner, parsed.repo, path, ref);
      state = result.ok
        ? { kind: 'trivia', trivia: result.trivia, owner: parsed.owner, repo: parsed.repo, path, ref: result.ref }
        : { kind: 'error', message: result.error };
      return;
    }

    addBrowsedRepo(parsed.owner, parsed.repo);
    const cached = getCachedRepoQuizData(parsed.owner, parsed.repo);
    if (cached) state = { kind: 'repo', owner: parsed.owner, repo: parsed.repo, result: cached };
    await loadRepo(parsed.owner, parsed.repo);
  });

  async function loadRepo(owner: string, repo: string) {
    refreshing = true;
    const res = await fetchRepoQuizData(owner, repo);
    refreshing = false;
    state = res.ok ? { kind: 'repo', owner, repo, result: res.result } : { kind: 'error', message: res.error };
  }

  function onDownload() {
    if (state.kind !== 'trivia') return;
    downloadJson(`${slugify(state.trivia.title)}.json`, state.trivia);
  }

  function onClone() {
    if (state.kind !== 'trivia') return;
    const now = new Date().toISOString();
    const cloned: Trivia = { ...state.trivia, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    saveTrivia(cloned);
    window.location.href = `/local/trivia/edit?id=${cloned.id}`;
  }

  async function copyShareLink() {
    if (state.kind !== 'trivia') return;
    // Deliberately omits `ref` — a durable link that re-resolves the branch fresh each time,
    // so it keeps working even if the repo's default branch is later renamed.
    const repoKey = `${state.owner}/${state.repo}`;
    const url = `${window.location.origin}/remote/trivia/play?github=${encodeURIComponent(repoKey)}&id=${encodeURIComponent(state.path)}`;
    await navigator.clipboard.writeText(url);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function triviaHref(owner: string, repo: string, ref: string, path: string): string {
    const repoKey = `${owner}/${repo}`;
    return `/remote/trivia?github=${encodeURIComponent(repoKey)}&id=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`;
  }

  function playHref(owner: string, repo: string, path: string, ref: string): string {
    const repoKey = `${owner}/${repo}`;
    return `/remote/trivia/play?github=${encodeURIComponent(repoKey)}&id=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`;
  }
</script>

{#if state.kind === 'loading'}
  <p class="text-sm text-slate-400">Loading…</p>
{:else if state.kind === 'error'}
  <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <p>{state.message}</p>
    <a href="/remote/browse" class="mt-2 inline-block text-indigo-600 hover:underline">Back to Browse</a>
  </div>
{:else if state.kind === 'trivia'}
  <div class="space-y-4">
    <div>
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-bold text-slate-900">{state.trivia.title}</h1>
        <a
          href={`https://github.com/${state.owner}/${state.repo}/blob/${state.ref}/${state.path}`}
          target="_blank"
          rel="noreferrer"
          class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-200"
        >
          {state.owner}/{state.repo} · read-only
        </a>
        <button
          type="button"
          class="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
          onclick={copyShareLink}
        >
          {copied ? 'Link copied!' : 'Copy share link'}
        </button>
      </div>
      {#if state.trivia.description}
        <p class="mt-1 text-slate-500">{state.trivia.description}</p>
      {/if}
      <p class="mt-1 text-xs text-slate-400">
        {state.trivia.questions.length} question{state.trivia.questions.length === 1 ? '' : 's'}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button variant="primary" href={playHref(state.owner, state.repo, state.path, state.ref)}>
        <Play size={15} /> Play
      </Button>
      <Button onclick={onDownload}>
        <Download size={15} /> Download JSON
      </Button>
      <Button onclick={onClone}>
        <Copy size={15} /> Clone
      </Button>
    </div>
  </div>
{:else if state.kind === 'repo'}
  <div class="space-y-4">
    <a href="/remote/browse" class="flex w-fit items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
      <ArrowLeft size={13} /> Back to Browse
    </a>
    <div class="flex items-center justify-between gap-2">
      <a
        href={`https://github.com/${state.owner}/${state.repo}`}
        target="_blank"
        rel="noreferrer"
        class="text-xl font-bold text-slate-900 hover:underline"
      >
        {state.owner}/{state.repo}
      </a>
      <button
        type="button"
        class="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:text-slate-300"
        disabled={refreshing}
        onclick={() => loadRepo(state.owner, state.repo)}
      >
        <RefreshCw size={13} class={refreshing ? 'animate-spin' : ''} />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>

    {#if state.result.skipped.length > 0}
      <p class="text-xs text-slate-400">
        {state.result.skipped.length} file{state.result.skipped.length === 1 ? '' : 's'} skipped (invalid format).
      </p>
    {/if}

    {#if state.result.category}
      <CategorySession
        config={state.result.category}
        tree={buildFolderTree(state.result.groups.flatMap((g) => g.trivias))}
        owner={state.owner}
        repo={state.repo}
        ref={state.result.ref}
      />
    {:else if state.result.journey}
      <JourneyView
        journey={state.result.journey}
        groups={state.result.groups}
        owner={state.owner}
        repo={state.repo}
        ref={state.result.ref}
      />
    {:else}
      {@const tree = buildFolderTree(state.result.groups.flatMap((g) => g.trivias))}
      {#if tree.folders.length > 1 || tree.folders.some((f) => f.folders.length)}
        <div class="flex items-center gap-3 text-xs font-medium text-slate-500">
          <button type="button" class="flex items-center gap-1 hover:text-slate-900" onclick={() => setAllFolders(tree, true)}>
            <ChevronsUpDown size={13} /> Expand all
          </button>
          <span class="text-slate-300">·</span>
          <button type="button" class="flex items-center gap-1 hover:text-slate-900" onclick={() => setAllFolders(tree, false)}>
            <ChevronsDownUp size={13} /> Collapse all
          </button>
        </div>
      {/if}

      <FolderTree
        node={tree}
        openState={openGroups}
        triviaHref={(path) => triviaHref(state.owner, state.repo, state.result.ref, path)}
      />
    {/if}
  </div>
{/if}
