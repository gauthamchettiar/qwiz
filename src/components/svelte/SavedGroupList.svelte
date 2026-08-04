<script lang="ts">
  import { FolderTree, HardDrive, Trash2, Wand2 } from '@lucide/svelte';
  import { deleteSavedGroup, listSavedGroups } from '@/lib/stores/savedGroups';
  import ErrorList from './ErrorList.svelte';

  // Groups saved to this browser, each a full offline copy. A writable $derived for the same
  // reason QuizList uses one: read once at hydration (the page is prerendered, where localStorage
  // doesn't exist), then overridden directly for the optimistic remove.
  let groups = $derived(listSavedGroups());
  let confirmingId = $state<string | null>(null);
  let errors = $state<string[]>([]);

  function remove(id: string) {
    if (!deleteSavedGroup(id)) {
      errors = ["Couldn't remove — your browser's storage might be unavailable right now."];
      return;
    }
    errors = [];
    confirmingId = null;
    groups = groups.filter((group) => group.id !== id);
  }

  function quizCount(count: number): string {
    return `${count} quiz${count === 1 ? '' : 'zes'}`;
  }
</script>

<div class="space-y-3">
  <ErrorList {errors} />

  {#if groups.length === 0}
    <p class="rounded-lg border border-line-subtle p-6 text-center text-sm text-ink-subtle">
      No saved groups. Open one published on GitHub and press &ldquo;Save to Browser&rdquo; to keep
      it here, playable offline.
    </p>
  {:else}
    <ul class="space-y-3">
      {#each groups as group (group.id)}
        <li
          class="relative rounded-lg border border-line-subtle bg-surface-raised transition-colors hover:border-line hover:shadow-sm"
        >
          <a href={`/group?saved=${group.id}`} class="block p-4 pr-10">
            <div class="flex items-baseline justify-between gap-3">
              <h3 class="font-semibold text-ink">{group.title || 'Untitled group'}</h3>
              <span
                class="shrink-0 rounded-md bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-ink-strong"
              >
                {group.mode}
              </span>
            </div>
            {#if group.description}
              <p class="mt-1 line-clamp-2 text-sm text-ink-subtle">{group.description}</p>
            {/if}
            <p class="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
              <span class="inline-flex items-center gap-1">
                <HardDrive size={12} /> offline copy
              </span>
              <span>·</span>
              <span>{quizCount(group.files.length)}</span>
              <span>·</span>
              <span>{group.owner}/{group.repo}{group.path ? `/${group.path}` : ''}</span>
              <span>·</span>
              <span>saved {new Date(group.savedAt).toLocaleDateString()}</span>
            </p>
          </a>
          <!-- A sibling of the link, never nested inside it: a button inside an anchor is invalid
               HTML and browsers disagree about its click behaviour. Same rule as QuizList. -->
          <div class="absolute right-2 top-2">
            {#if confirmingId === group.id}
              <button
                type="button"
                class="flex items-center gap-1.5 rounded bg-negative px-2 py-1 text-xs font-medium text-ink-inverse hover:bg-negative-hover"
                onclick={() => remove(group.id)}
              >
                <Trash2 size={13} /> Confirm?
              </button>
            {:else}
              <button
                type="button"
                class="rounded p-1.5 text-ink-faint hover:bg-surface-hover hover:text-negative-ink"
                aria-label={`Remove "${group.title || 'Untitled group'}"`}
                onclick={() => (confirmingId = group.id)}
              >
                <Trash2 size={15} />
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex flex-wrap items-center gap-3 pt-1">
    <a
      href="/local/group"
      class="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-raised px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface"
    >
      <Wand2 size={15} /> Generate a Group
    </a>
    <span class="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
      <FolderTree size={13} /> Bundle your own quizzes into a folder to publish on GitHub.
    </span>
  </div>
</div>
