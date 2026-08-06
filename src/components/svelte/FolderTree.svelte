<script lang="ts">
  import { ChevronRight, FileText, Folder } from '@lucide/svelte';
  import { countEntries, entryLabel, type FolderNode } from '@/lib/utils/folderTree';
  import type { QuizGroupEntry } from '@/lib/utils/quizGroup';
  import Self from './FolderTree.svelte';

  // Recursive by design: a repo's folder depth isn't known ahead of time, and a component that
  // renders itself is the only shape that doesn't cap it arbitrarily. All the logic lives in
  // `lib/utils/folderTree.ts` — this draws whatever tree it's handed and owns nothing else.
  let {
    node,
    hrefFor,
    expanded,
    onToggle
  }: {
    node: FolderNode;
    /** Where a quiz opens. Passed in rather than built here, because a group read from a
     * repository and one saved to this browser link to different places — and a saved group whose
     * links pointed back at GitHub would silently be online again, which is the one thing saving
     * it was meant to prevent. */
    hrefFor: (entry: QuizGroupEntry) => string;
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
          <Self node={folder} {hrefFor} {expanded} {onToggle} />
        </div>
      {/if}
    </li>
  {/each}

  {#each node.entries as entry (entry.id)}
    <li>
      <a
        href={hrefFor(entry)}
        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-ink hover:bg-surface-hover"
      >
        <FileText size={15} class="shrink-0 text-ink-faint" />
        <span class="truncate">{entryLabel(entry)}</span>
      </a>
    </li>
  {/each}
</ul>
