<script lang="ts">
  import { onMount } from 'svelte';
  import { Download, Sparkles, ChevronRight } from '@lucide/svelte';
  import { parseRepoInput, getBrowsedRepos } from '../github';
  import { DEFAULT_REPO } from '../githubConfig';
  import Button from './Button.svelte';

  const EXAMPLE_REPO = 'https://github.com/gauthamchettiar/qwiz';

  let inputValue = $state('');
  let recentRepos = $state<string[]>([]);
  let formError = $state('');

  onMount(() => {
    const saved = getBrowsedRepos();
    recentRepos = saved.length > 0 ? saved : DEFAULT_REPO ? [DEFAULT_REPO] : [];
  });

  function goToRepo(owner: string, repo: string) {
    window.location.href = `/remote/trivia?github=${encodeURIComponent(`${owner}/${repo}`)}`;
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    const parsed = parseRepoInput(inputValue);
    if (!parsed) {
      formError = 'Enter a repo as "owner/repo" or a github.com URL.';
      return;
    }
    goToRepo(parsed.owner, parsed.repo);
  }

  function loadExample() {
    const parsed = parseRepoInput(EXAMPLE_REPO);
    if (parsed) goToRepo(parsed.owner, parsed.repo);
  }
</script>

<div class="space-y-6">
  <form class="flex gap-2" onsubmit={onSubmit}>
    <input
      type="text"
      class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      placeholder="owner/repo or https://github.com/owner/repo"
      bind:value={inputValue}
    />
    <Button type="submit" variant="primary">
      <Download size={15} /> Load
    </Button>
    <Button onclick={loadExample}>
      <Sparkles size={15} /> Load Example
    </Button>
  </form>

  {#if formError}
    <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>
  {/if}

  <div class="space-y-2">
    {#if recentRepos.length > 0}
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Recently browsed</p>
    {/if}
    {#each recentRepos as key (key)}
      {@const parsed = parseRepoInput(key)}
      {#if parsed}
        <a
          href={`/remote/trivia?github=${encodeURIComponent(key)}`}
          class="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
        >
          <span class="text-sm font-semibold text-slate-900">{parsed.owner}/{parsed.repo}</span>
          <ChevronRight size={15} class="text-slate-400" />
        </a>
      {/if}
    {/each}

    {#if recentRepos.length === 0}
      <p class="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        Enter a public GitHub repo above to browse the trivias in its quiz-data/ folder.
      </p>
    {/if}
  </div>
</div>
