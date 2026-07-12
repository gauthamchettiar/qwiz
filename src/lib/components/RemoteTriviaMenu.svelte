<script lang="ts">
  import { Copy, Download, ExternalLink } from '@lucide/svelte';
  import CardMenu from './CardMenu.svelte';
  import { fetchGithubTrivia } from '../github';
  import { saveTrivia } from '../store';
  import { downloadJson, slugify } from '../download';
  import type { Trivia } from '../types';

  // Shared ⋮ menu for a single remote (GitHub-hosted, read-only) trivia. Every action needs the
  // whole file, so it fetches on demand — used by the flat listing, journey nodes, and anywhere
  // else an individual remote trivia card shows up.
  let {
    owner,
    repo,
    ref,
    path,
    align = 'right'
  }: { owner: string; repo: string; ref: string; path: string; align?: 'left' | 'right' } = $props();

  let busy = $state(false);

  const menuItem =
    'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';

  async function clone() {
    busy = true;
    const res = await fetchGithubTrivia(owner, repo, path, ref);
    busy = false;
    if (!res.ok) return;
    const now = new Date().toISOString();
    const cloned: Trivia = { ...res.trivia, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    saveTrivia(cloned);
    window.location.href = `/local/trivia/edit?id=${cloned.id}`;
  }

  async function download() {
    busy = true;
    const res = await fetchGithubTrivia(owner, repo, path, ref);
    busy = false;
    if (res.ok) downloadJson(`${slugify(res.trivia.title)}.json`, res.trivia);
  }

  const githubUrl = $derived(`https://github.com/${owner}/${repo}/blob/${ref}/${path}`);
</script>

<CardMenu {align}>
  {#snippet children(close)}
    <button
      type="button"
      class={menuItem}
      disabled={busy}
      onclick={() => {
        clone();
        close();
      }}
    >
      <Copy size={15} /> Clone to my trivias
    </button>
    <button
      type="button"
      class={menuItem}
      disabled={busy}
      onclick={() => {
        download();
        close();
      }}
    >
      <Download size={15} /> Download JSON
    </button>
    <a href={githubUrl} target="_blank" rel="noreferrer" class={menuItem} onclick={close}>
      <ExternalLink size={15} /> Open on GitHub
    </a>
  {/snippet}
</CardMenu>
