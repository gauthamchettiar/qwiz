<script lang="ts">
  import { onMount } from 'svelte';
  import { resolveTriviaFromParams, type ResolvedTrivia } from '../resolveTrivia';
  import { deleteTrivia } from '../store';
  import { downloadJson } from '../download';

  let state = $state<'loading' | 'ready' | 'error'>('loading');
  let resolved = $state<ResolvedTrivia | null>(null);
  let errorMessage = $state('');
  let copied = $state(false);

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const result = await resolveTriviaFromParams(params);
    if (!result) {
      window.location.href = '/';
      return;
    }
    if (!result.trivia) {
      errorMessage = result.error;
      state = 'error';
      return;
    }
    resolved = result;
    state = 'ready';
  });

  function slugify(title: string): string {
    return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trivia';
  }

  function onDelete() {
    if (!resolved || resolved.readOnly) return;
    if (!confirm('Delete this trivia? This cannot be undone.')) return;
    deleteTrivia(resolved.trivia.id);
    window.location.href = '/';
  }

  function onDownload() {
    if (!resolved) return;
    downloadJson(`${slugify(resolved.trivia.title)}.json`, resolved.trivia);
  }

  function pageUrl(suffix: 'play' | 'edit'): string {
    if (!resolved) return '#';
    if (resolved.source === 'local') return `/trivia/${suffix}?id=${resolved.trivia.id}`;
    const repo = `${resolved.owner}/${resolved.repo}`;
    // Includes `ref` as a fast path (already resolved, skips a lookup on the next page).
    return `/trivia/${suffix}?github=${encodeURIComponent(repo)}&id=${encodeURIComponent(resolved.path)}&ref=${encodeURIComponent(resolved.ref)}`;
  }

  async function copyShareLink() {
    if (!resolved || resolved.source !== 'github') return;
    // Deliberately omits `ref` — a durable link that re-resolves the branch fresh each time,
    // so it keeps working even if the repo's default branch is later renamed.
    const repo = `${resolved.owner}/${resolved.repo}`;
    const url = `${window.location.origin}/trivia/play?github=${encodeURIComponent(repo)}&id=${encodeURIComponent(resolved.path)}`;
    await navigator.clipboard.writeText(url);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

{#if state === 'loading'}
  <p class="text-sm text-slate-400">Loading…</p>
{:else if state === 'error'}
  <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <p>{errorMessage}</p>
    <a href="/browse" class="mt-2 inline-block text-indigo-600 hover:underline">Back to Browse</a>
  </div>
{:else if resolved && resolved.trivia}
  <div class="space-y-4">
    <div>
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-bold text-slate-900">{resolved.trivia.title}</h1>
        {#if resolved.source === 'github'}
          <a
            href={`https://github.com/${resolved.owner}/${resolved.repo}/blob/${resolved.ref}/${resolved.path}`}
            target="_blank"
            rel="noreferrer"
            class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-200"
          >
            {resolved.owner}/{resolved.repo} · read-only
          </a>
          <button
            type="button"
            class="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
            onclick={copyShareLink}
          >
            {copied ? 'Link copied!' : 'Copy share link'}
          </button>
        {/if}
      </div>
      {#if resolved.trivia.description}
        <p class="mt-1 text-slate-500">{resolved.trivia.description}</p>
      {/if}
      <p class="mt-1 text-xs text-slate-400">
        {resolved.trivia.questions.length} question{resolved.trivia.questions.length === 1 ? '' : 's'}
      </p>
    </div>
    <div class="flex gap-2">
      <a
        href={pageUrl('play')}
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Play
      </a>
      {#if resolved.readOnly}
        <span
          aria-disabled="true"
          title="Read-only — cannot be edited"
          class="cursor-not-allowed rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-300"
        >
          Edit
        </span>
      {:else}
        <a
          href={pageUrl('edit')}
          class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </a>
      {/if}
      <button
        type="button"
        class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onclick={onDownload}
      >
        Download JSON
      </button>
      {#if resolved.readOnly}
        <span
          aria-disabled="true"
          title="Read-only — cannot be deleted"
          class="cursor-not-allowed rounded-md border border-red-100 px-4 py-2 text-sm font-medium text-red-200"
        >
          Delete
        </span>
      {:else}
        <button
          type="button"
          class="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          onclick={onDelete}
        >
          Delete
        </button>
      {/if}
    </div>
  </div>
{/if}
