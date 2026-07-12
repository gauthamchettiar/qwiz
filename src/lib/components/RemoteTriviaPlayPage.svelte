<script lang="ts">
  import { onMount } from 'svelte';
  import { Share2 } from '@lucide/svelte';
  import {
    fetchGithubTrivia,
    fetchRepoQuizData,
    getCachedRepoQuizData,
    parseRepoInput,
    type RepoQuizResult
  } from '../github';
  import TriviaPlayer from './TriviaPlayer.svelte';
  import type { Trivia } from '../types';

  let state = $state<'loading' | 'ready' | 'error'>('loading');
  let trivia = $state<Trivia | null>(null);
  let errorMessage = $state('');
  let nav = $state<{ prevHref?: string; nextHref?: string } | undefined>(undefined);
  let copied = $state(false);

  let owner = '';
  let repo = '';
  let path = '';

  const shareUrl = () =>
    `${window.location.origin}/remote/trivia/play?github=${encodeURIComponent(`${owner}/${repo}`)}&id=${encodeURIComponent(path)}`;

  function playHref(p: string, ref: string): string {
    return `/remote/trivia/play?github=${encodeURIComponent(`${owner}/${repo}`)}&id=${encodeURIComponent(p)}&ref=${encodeURIComponent(ref)}`;
  }

  // When this file is one of several in the repo, offer Prev/Next across the repo's trivia list
  // (in the same order the listing shows), so the results screen can move straight to a neighbour.
  function computeNav(result: RepoQuizResult) {
    const paths = result.groups.flatMap((g) => g.trivias).map((t) => t.path);
    const i = paths.indexOf(path);
    if (i === -1 || paths.length < 2) return;
    nav = {
      prevHref: i > 0 ? playHref(paths[i - 1], result.ref) : undefined,
      nextHref: i < paths.length - 1 ? playHref(paths[i + 1], result.ref) : undefined
    };
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const parsed = parseRepoInput(params.get('github') ?? '');
    path = params.get('id') ?? '';
    if (!parsed || !path) {
      window.location.href = '/remote/browse';
      return;
    }
    owner = parsed.owner;
    repo = parsed.repo;
    const ref = params.get('ref') ?? undefined;
    const result = await fetchGithubTrivia(owner, repo, path, ref);
    if (!result.ok) {
      errorMessage = result.error;
      state = 'error';
      return;
    }
    trivia = result.trivia;
    state = 'ready';

    // Work out Prev/Next from the repo listing (cache first, then refresh) — best-effort, so a
    // failed listing fetch just leaves the results screen without neighbour links.
    const cached = getCachedRepoQuizData(owner, repo);
    if (cached) computeNav(cached);
    else {
      const res = await fetchRepoQuizData(owner, repo);
      if (res.ok) computeNav(res.result);
    }
  });

  async function onShare() {
    // Deliberately omits `ref` — a durable link that re-resolves the branch fresh each time.
    await navigator.clipboard.writeText(shareUrl());
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

{#if state === 'loading'}
  <p class="text-sm text-slate-400">Loading…</p>
{:else if state === 'error'}
  <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <p>{errorMessage}</p>
    <a href="/remote/browse" class="mt-2 inline-block text-indigo-600 hover:underline">Back to Browse</a>
  </div>
{:else if trivia}
  <div class="mb-6 flex items-start justify-between gap-3">
    <h1 class="text-2xl font-bold text-slate-900">{trivia.title}</h1>
    <button
      type="button"
      class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      onclick={onShare}
    >
      <Share2 size={15} />
      {copied ? 'Link copied!' : 'Share'}
    </button>
  </div>
  <TriviaPlayer {trivia} {nav} />
{/if}
