<script lang="ts">
  import { onMount } from 'svelte';
  import { Lock, CircleCheck, Check, Trophy, RotateCcw } from '@lucide/svelte';
  import RemoteTriviaMenu from './RemoteTriviaMenu.svelte';
  import { getPlay, resetPlays, type PlayRecord } from '../progress';
  import type { JourneyConfig, JourneyNode } from '../github';
  import type { RepoTrivia } from '../folderTree';

  let {
    journey,
    trivias,
    owner,
    repo,
    ref
  }: {
    journey: JourneyConfig;
    trivias: RepoTrivia[];
    owner: string;
    repo: string;
    ref: string;
  } = $props();

  type Resolved = { node: JourneyNode; summary: RepoTrivia | null };

  // Map each journey node to the trivia it points at (by full repo path).
  const pathMap = new Map(trivias.map((t) => [t.path, t]));
  const resolved: Resolved[] = journey.nodes.map((node) => ({ node, summary: pathMap.get(node.path) ?? null }));
  const nodeById = new Map(resolved.map((r) => [r.node.id, r]));

  // Play progress, read once on mount (and re-read when we come back from a trivia). Keyed by
  // trivia id; a plain reactive object so status recomputes when we reset.
  let progress = $state<Record<string, PlayRecord>>({});
  function loadProgress() {
    const map: Record<string, PlayRecord> = {};
    for (const r of resolved) if (r.summary) map[r.summary.id] = getPlay(r.summary.id) ?? { completed: false, won: false };
    progress = map;
  }
  onMount(loadProgress);

  function recFor(nodeId: string): PlayRecord | null {
    const s = nodeById.get(nodeId)?.summary;
    return s ? progress[s.id] ?? null : null;
  }
  function satisfied(prereqId: string, requireWin: boolean): boolean {
    const r = recFor(prereqId);
    return r ? (requireWin ? r.won : r.completed) : false;
  }
  function unlocked(node: JourneyNode): boolean {
    if (node.requires.length === 0) return true;
    const rw = node.requireWin ?? journey.requireWin;
    return node.requires.every((p) => satisfied(p, rw));
  }
  function statusOf(node: JourneyNode): 'won' | 'completed' | 'unlocked' | 'locked' {
    if (!unlocked(node)) return 'locked';
    const rec = recFor(node.id);
    if (rec?.won) return 'won';
    if (rec?.completed) return 'completed';
    return 'unlocked';
  }
  function prereqLabel(node: JourneyNode): string {
    const rw = node.requireWin ?? journey.requireWin;
    const names = node.requires.map((p) => nodeById.get(p)?.summary?.title ?? p);
    return `${rw ? 'Win' : 'Finish'} ${names.join(' + ')} to unlock`;
  }
  function href(path: string): string {
    return `/remote/trivia/play?github=${encodeURIComponent(`${owner}/${repo}`)}&id=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`;
  }

  // Group nodes into stages by dependency depth (longest path from a start node), so the
  // journey reads top-to-bottom while branches sit side by side within a stage.
  const stages = $derived.by(() => {
    const cache = new Map<string, number>();
    function depth(id: string, seen: Set<string>): number {
      if (cache.has(id)) return cache.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const n = nodeById.get(id)?.node;
      const d = !n || n.requires.length === 0 ? 0 : 1 + Math.max(0, ...n.requires.map((r) => depth(r, seen)));
      cache.set(id, d);
      return d;
    }
    const byDepth = new Map<number, Resolved[]>();
    for (const r of resolved) {
      if (!r.summary) continue;
      const d = depth(r.node.id, new Set());
      const list = byDepth.get(d) ?? [];
      list.push(r);
      byDepth.set(d, list);
    }
    return [...byDepth.entries()].sort((a, b) => a[0] - b[0]).map(([, nodes]) => nodes);
  });

  const total = $derived(resolved.filter((r) => r.summary).length);
  const clearedCount = $derived(resolved.filter((r) => r.summary && progress[r.summary.id]?.won).length);

  // Two-step reset: the first click arms a confirm tick that reverts after a few seconds if the
  // user doesn't follow through, so progress isn't wiped on a stray click.
  let confirmingReset = $state(false);
  let resetTimeout: ReturnType<typeof setTimeout> | undefined;

  function armReset() {
    confirmingReset = true;
    clearTimeout(resetTimeout);
    resetTimeout = setTimeout(() => (confirmingReset = false), 3000);
  }

  function resetProgress() {
    clearTimeout(resetTimeout);
    confirmingReset = false;
    resetPlays(resolved.map((r) => r.summary?.id).filter((x): x is string => !!x));
    progress = {};
  }
</script>

<div class="space-y-5">
  <div class="flex flex-wrap items-start justify-between gap-2">
    <div>
      {#if journey.title}<h2 class="text-lg font-semibold text-slate-900">{journey.title}</h2>{/if}
      {#if journey.description}<p class="mt-0.5 max-w-prose text-sm text-slate-500">{journey.description}</p>{/if}
      <p class="mt-1 text-xs text-slate-400">{clearedCount} of {total} cleared</p>
    </div>
    {#if clearedCount > 0}
      {#if confirmingReset}
        <button type="button" class="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700" onclick={resetProgress}>
          <Check size={12} /> Confirm reset?
        </button>
      {:else}
        <button type="button" class="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900" onclick={armReset}>
          <RotateCcw size={12} /> Reset progress
        </button>
      {/if}
    {/if}
  </div>

  {#each stages as stage, i (i)}
    <div class="flex gap-4">
      <div class="flex flex-col items-center">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-500">
          {i + 1}
        </span>
        {#if i < stages.length - 1}
          <span class="my-1 w-px flex-1 bg-slate-200"></span>
        {/if}
      </div>

      <div class="min-w-0 flex-1 pb-2">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {i === 0 ? 'Start' : i === stages.length - 1 ? 'Finish' : `Stage ${i + 1}`}
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          {#each stage as r (r.node.id)}
            {@const status = statusOf(r.node)}
            <div class="relative">
              {#if status === 'locked'}
                <div class="rounded-md border border-slate-200 bg-slate-50 p-4 pr-10 text-slate-400">
                  <div class="flex items-center gap-1.5">
                    <Lock size={14} />
                    <span class="font-semibold">{r.summary?.title}</span>
                  </div>
                  <p class="mt-1 text-xs">{prereqLabel(r.node)}</p>
                </div>
              {:else}
                <a
                  href={href(r.node.path)}
                  class="block rounded-md border p-4 pr-10 transition-colors {status === 'won'
                    ? 'border-[var(--won,#16a34a)]/40 bg-green-50 hover:border-green-400'
                    : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'}"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900">
                      {#if status === 'won'}<Trophy size={14} class="shrink-0 text-green-600" />{/if}
                      <span class="truncate">{r.summary?.title}</span>
                    </span>
                    <span class="shrink-0 text-xs text-slate-400">
                      {r.summary?.questionCount} question{r.summary?.questionCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {#if r.summary?.description}
                    <p class="mt-1 line-clamp-2 text-sm text-slate-500">{r.summary.description}</p>
                  {/if}
                  {#if status === 'won'}
                    <span class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-green-700"><CircleCheck size={13} /> Cleared</span>
                  {:else if status === 'completed'}
                    <span class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500"><Check size={13} /> Played — try for a clear</span>
                  {:else}
                    <span class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600">Ready to play →</span>
                  {/if}
                </a>
              {/if}
              {#if r.summary}
                <div class="absolute right-2 top-2">
                  <RemoteTriviaMenu {owner} {repo} {ref} path={r.node.path} />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/each}
</div>
