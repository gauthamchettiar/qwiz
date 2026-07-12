<script lang="ts">
  import { ChevronRight } from '@lucide/svelte';
  import { countTrivias, type FolderNode, type RepoTrivia } from '../folderTree';
  import type { Snippet } from 'svelte';
  import Self from './FolderTree.svelte';

  // Recursive folder view — renders subfolders as nested <details> (any depth) and trivias as
  // cards, so however deep a repo nests things under quiz-data/ shows up as a real tree. The
  // optional `cardMenu` snippet renders per-card actions (play / clone / download / GitHub) to
  // the right of each card, and is forwarded down through the recursion.
  let {
    node,
    openState,
    triviaHref,
    cardMenu
  }: {
    node: FolderNode;
    openState: Record<string, boolean>;
    triviaHref: (path: string) => string;
    cardMenu?: Snippet<[RepoTrivia]>;
  } = $props();
</script>

<div class="space-y-2">
  {#each node.folders as folder (folder.path)}
    <details class="group/g rounded-md border border-slate-200 bg-white" bind:open={openState[folder.path]}>
      <summary
        class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <ChevronRight size={13} class="text-slate-400 transition-transform group-open/g:rotate-90" />
        {folder.name}
        <span class="text-xs font-normal text-slate-400">({countTrivias(folder)})</span>
      </summary>
      <div class="border-t border-slate-100 p-3">
        <Self node={folder} {openState} {triviaHref} {cardMenu} />
      </div>
    </details>
  {/each}

  {#each node.trivias as t (t.path)}
    <div class="flex items-stretch gap-1 rounded-md border border-slate-200 bg-white transition-colors hover:border-slate-400">
      <a href={triviaHref(t.path)} class="min-w-0 flex-1 p-4">
        <div class="flex items-center justify-between gap-2">
          <span class="font-semibold text-slate-900">{t.title}</span>
          <span class="shrink-0 text-xs text-slate-400">
            {t.questionCount} question{t.questionCount === 1 ? '' : 's'}
          </span>
        </div>
        {#if t.description}
          <p class="mt-1 text-sm text-slate-500">{t.description}</p>
        {/if}
      </a>
      {#if cardMenu}
        <div class="flex items-center pr-2">{@render cardMenu(t)}</div>
      {/if}
    </div>
  {/each}
</div>
