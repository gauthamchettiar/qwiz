<script lang="ts">
  import { ChevronRight } from '@lucide/svelte';
  import { countTrivias, type FolderNode } from '../folderTree';
  import Self from './FolderTree.svelte';

  // Recursive folder view — renders subfolders as nested <details> (any depth) and trivias as
  // cards, so however deep a repo nests things under quiz-data/ shows up as a real tree.
  let {
    node,
    openState,
    triviaHref
  }: {
    node: FolderNode;
    openState: Record<string, boolean>;
    triviaHref: (path: string) => string;
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
        <Self node={folder} {openState} {triviaHref} />
      </div>
    </details>
  {/each}

  {#each node.trivias as t (t.path)}
    <a
      href={triviaHref(t.path)}
      class="block rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
    >
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
  {/each}
</div>
