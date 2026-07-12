<script lang="ts">
  import { onMount } from 'svelte';
  import { Play, Download, Copy, ExternalLink, ArrowLeft, RefreshCw, ChevronsUpDown, ChevronsDownUp } from '@lucide/svelte';
  import JourneyView from './JourneyView.svelte';
  import FolderTree from './FolderTree.svelte';
  import CategorySession from './CategorySession.svelte';
  import CardMenu from './CardMenu.svelte';
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
  import type { Trivia } from '../types';

  type PageState =
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'repo'; owner: string; repo: string; result: RepoQuizResult };

  let state = $state<PageState>({ kind: 'loading' });
  let refreshing = $state(false);
  // While a card action is fetching the full trivia (clone/download need the whole file).
  let busyPath = $state<string | null>(null);
  // Open/closed state per group, so Expand/Collapse all can drive every <details> at once.
  let openGroups = $state<Record<string, boolean>>({});

  const menuItem =
    'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';

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
    const ref = params.get('ref');

    // A path (`id`) used to open an intermediate detail page; now it goes straight to play.
    if (path) {
      const repoKey = `${parsed.owner}/${parsed.repo}`;
      const refPart = ref ? `&ref=${encodeURIComponent(ref)}` : '';
      window.location.replace(`/remote/trivia/play?github=${encodeURIComponent(repoKey)}&id=${encodeURIComponent(path)}${refPart}`);
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

  function playHref(owner: string, repo: string, path: string, ref: string): string {
    const repoKey = `${owner}/${repo}`;
    return `/remote/trivia/play?github=${encodeURIComponent(repoKey)}&id=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`;
  }

  function githubUrl(owner: string, repo: string, ref: string, path: string): string {
    return `https://github.com/${owner}/${repo}/blob/${ref}/${path}`;
  }

  async function downloadTrivia(owner: string, repo: string, ref: string, path: string) {
    busyPath = path;
    const res = await fetchGithubTrivia(owner, repo, path, ref);
    busyPath = null;
    if (res.ok) downloadJson(`${slugify(res.trivia.title)}.json`, res.trivia);
  }

  async function cloneTrivia(owner: string, repo: string, ref: string, path: string) {
    busyPath = path;
    const res = await fetchGithubTrivia(owner, repo, path, ref);
    busyPath = null;
    if (!res.ok) return;
    const now = new Date().toISOString();
    const cloned: Trivia = { ...res.trivia, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    saveTrivia(cloned);
    window.location.href = `/local/trivia/edit?id=${cloned.id}`;
  }
</script>

{#if state.kind === 'loading'}
  <p class="text-sm text-slate-400">Loading…</p>
{:else if state.kind === 'error'}
  <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <p>{state.message}</p>
    <a href="/remote/browse" class="mt-2 inline-block text-indigo-600 hover:underline">Back to Browse</a>
  </div>
{:else if state.kind === 'repo'}
  {@const owner = state.owner}
  {@const repo = state.repo}
  {@const ref = state.result.ref}
  <div class="space-y-4">
    <a href="/remote/browse" class="flex w-fit items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
      <ArrowLeft size={13} /> Back to Browse
    </a>
    <div class="flex items-center justify-between gap-2">
      <a
        href={`https://github.com/${owner}/${repo}`}
        target="_blank"
        rel="noreferrer"
        class="text-xl font-bold text-slate-900 hover:underline"
      >
        {owner}/{repo}
      </a>
      <button
        type="button"
        class="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:text-slate-300"
        disabled={refreshing}
        onclick={() => loadRepo(owner, repo)}
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
        {owner}
        {repo}
        {ref}
      />
    {:else if state.result.journey}
      <JourneyView journey={state.result.journey} groups={state.result.groups} {owner} {repo} {ref} />
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

      <FolderTree node={tree} openState={openGroups} triviaHref={(path) => playHref(owner, repo, path, ref)}>
        {#snippet cardMenu(t)}
          <div class="flex items-center gap-1">
            <a
              href={playHref(owner, repo, t.path, ref)}
              class="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Play size={14} /> Play
            </a>
            <CardMenu>
              {#snippet children(close)}
                <button
                  type="button"
                  class={menuItem}
                  disabled={busyPath === t.path}
                  onclick={() => {
                    cloneTrivia(owner, repo, ref, t.path);
                    close();
                  }}
                >
                  <Copy size={15} /> Clone to my trivias
                </button>
                <button
                  type="button"
                  class={menuItem}
                  disabled={busyPath === t.path}
                  onclick={() => {
                    downloadTrivia(owner, repo, ref, t.path);
                    close();
                  }}
                >
                  <Download size={15} /> Download JSON
                </button>
                <a
                  href={githubUrl(owner, repo, ref, t.path)}
                  target="_blank"
                  rel="noreferrer"
                  class={menuItem}
                  onclick={close}
                >
                  <ExternalLink size={15} /> Open on GitHub
                </a>
              {/snippet}
            </CardMenu>
          </div>
        {/snippet}
      </FolderTree>
    {/if}
  </div>
{/if}
