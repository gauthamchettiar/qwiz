<script lang="ts">
  import { ChevronRight, FileText, Folder } from '@lucide/svelte';
  import { countEntries, entryLabel, type FolderNode } from '@/lib/utils/folderTree';
  import { repoQuizUrl } from '@/lib/utils/remoteSource';
  import type { RepoRef } from '@/lib/utils/githubRef';
  import Self from './FolderTree.svelte';

  // Recursive by design: a repo's folder depth isn't known ahead of time, and a component that
  // renders itself is the only shape that doesn't cap it arbitrarily. All the logic lives in
  // `lib/utils/folderTree.ts` — this draws whatever tree it's handed and owns nothing else.
  let {
    node,
    repo,
    expanded,
    onToggle
  }: {
    node: FolderNode;
    repo: RepoRef;
    /** Lifted to the page so "expand all" is one state change rather than a message to every
     * node, and so a folder stays open across a re-render. */
    expanded: Set<string>;
    onToggle: (path: string) => void;
  } = $props();
</script>

<ul class="space-y-1.5">
  {#each node.folders as folder (folder.path)}
    {@const open = expanded.has(folder.path)}
    <li>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-ink hover:bg-surface-hover"
        aria-expanded={open}
        onclick={() => onToggle(folder.path)}
      >
        <ChevronRight
          size={15}
          class="shrink-0 text-ink-faint transition-transform {open ? 'rotate-90' : ''}"
        />
        <Folder size={15} class="shrink-0 text-ink-faint" />
        <span class="truncate">{folder.name}</span>
        <span class="ml-auto shrink-0 text-xs font-normal text-ink-subtle">
          {countEntries(folder)}
        </span>
      </button>
      {#if open}
        <div class="ml-3 border-l border-line-faint pl-3 pt-1.5">
          <Self node={folder} {repo} {expanded} {onToggle} />
        </div>
      {/if}
    </li>
  {/each}

  {#each node.entries as entry (entry.id)}
    <li>
      <a
        href={repoQuizUrl(repo, entry.path)}
        class="flex items-center gap-2 rounded-md border border-line-subtle bg-surface-raised px-3 py-2 text-sm text-ink transition-colors hover:border-line hover:bg-surface-hover"
      >
        <FileText size={15} class="shrink-0 text-ink-faint" />
        <span class="truncate font-medium">{entryLabel(entry)}</span>
      </a>
    </li>
  {/each}
</ul>
