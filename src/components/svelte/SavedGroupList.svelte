<script lang="ts">
  import { Loader2, Pencil, RefreshCw, Trash2 } from '@lucide/svelte';
  import { deleteSavedGroup, listSavedGroups, saveGroup } from '@/lib/stores/savedGroups';
  import { remoteGroupSource } from '@/lib/remote/groupSource';
  import { serializeQwizGroup } from '@/lib/utils/quizGroup';
  import ErrorList from './ErrorList.svelte';
  import CardMenu from './CardMenu.svelte';

  // Groups saved to this browser, each a full offline copy. A writable $derived for the same
  // reason QuizList uses one: read once at hydration (the page is prerendered, where localStorage
  // doesn't exist), then overridden directly for the optimistic remove/update.
  let groups = $derived(listSavedGroups());
  let confirmingId = $state<string | null>(null);
  let updatingId = $state<string | null>(null);
  let errors = $state<string[]>([]);

  function quizCount(count: number): string {
    return `${count} quiz${count === 1 ? '' : 'zes'}`;
  }

  function remove(id: string) {
    if (!deleteSavedGroup(id)) {
      errors = ["Couldn't remove — your browser's storage might be unavailable right now."];
      return;
    }
    errors = [];
    confirmingId = null;
    groups = groups.filter((group) => group.id !== id);
  }

  /** Re-fetches the group from its repository and overwrites the saved copy in place — the same
   * action available from the group's own screen, offered here too since a stale offline copy is
   * otherwise only discoverable by opening it. */
  async function update(id: string) {
    const existing = groups.find((group) => group.id === id);
    if (!existing || updatingId) return;
    updatingId = id;
    errors = [];
    try {
      const source = remoteGroupSource({
        owner: existing.owner,
        repo: existing.repo,
        ...(existing.path ? { path: existing.path } : {}),
        ...(existing.ref ? { ref: existing.ref } : {})
      });
      const result = await source.load();
      if (!result.loaded) {
        errors = [result.error ?? "Couldn't reach this group's repository."];
        return;
      }
      const fetched = await source.readFiles(
        result.loaded.group.entries.map((entry) => entry.path)
      );
      if (fetched.files.length === 0) {
        errors = ["Couldn't read this group's quizzes."];
        return;
      }
      const saved = saveGroup({
        key: existing.key,
        title: result.loaded.group.title || `${existing.owner}/${existing.repo}`,
        description: result.loaded.group.description,
        mode: existing.mode,
        owner: existing.owner,
        repo: existing.repo,
        path: existing.path,
        ref: existing.ref,
        manifest: serializeQwizGroup(result.loaded.group),
        files: fetched.files
      });
      if (!saved.saved) {
        errors = [saved.error ?? "Couldn't update this group."];
        return;
      }
      groups = listSavedGroups();
    } finally {
      updatingId = null;
    }
  }
</script>

<div class="space-y-3">
  <ErrorList {errors} />

  {#if groups.length === 0}
    <p class="rounded-lg border border-line-subtle p-6 text-center text-sm text-ink-subtle">
      <!-- Both ways in, since a group no longer has to come from someone else's repository. -->
      No saved groups. Build one from your own quizzes with
      <a href="/local/group" class="font-medium text-accent-ink hover:underline"
        >+ New &rarr; Group</a
      >, or open one published on GitHub and press &ldquo;Save a copy&rdquo; to keep it here.
    </p>
  {:else}
    <ul class="space-y-3">
      {#each groups as group (group.id)}
        <li
          class="relative rounded-lg border border-line-subtle bg-surface-raised transition-colors hover:border-line hover:shadow-sm"
        >
          <a href={`/group?saved=${group.id}`} class="block p-3.5 pr-10">
            <div class="flex items-baseline justify-between gap-3">
              <h3 class="text-sm font-semibold text-ink">{group.title || 'Untitled group'}</h3>
              <div class="flex shrink-0 items-baseline gap-1.5">
                <!-- Provenance, because it decides what you can do with the card: a group built
                     here reopens in the builder, a copied one refreshes from its repository. -->
                {#if group.origin === 'local'}
                  <span
                    class="rounded-md bg-surface-hover px-2 py-0.5 text-xs font-medium text-ink-soft"
                  >
                    built here
                  </span>
                {/if}
                <span
                  class="rounded-md bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-ink-strong"
                >
                  {group.mode}
                </span>
              </div>
            </div>
            {#if group.description}
              <p class="mt-0.5 line-clamp-1 text-xs text-ink-subtle">{group.description}</p>
            {/if}
            <p class="mt-1.5 text-xs text-ink-subtle">
              {quizCount(group.files.length)} · saved {new Date(group.savedAt).toLocaleDateString()}
            </p>
          </a>
          <div class="absolute right-2 top-2">
            <CardMenu
              ariaLabel={`Actions for "${group.title || 'Untitled group'}"`}
              onClose={() => (confirmingId = null)}
            >
              {#snippet children(close)}
                <!-- The two origins get different first actions, and neither makes sense for the
                     other: a locally-built group has no repository to refresh from (updating one
                     would fetch `//`), and a copied one names files in someone else's repo rather
                     than quizzes in this library, so the builder couldn't resolve it. -->
                {#if group.origin === 'local'}
                  <a
                    href={`/local/group?id=${group.id}`}
                    role="menuitem"
                    class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-ink-muted hover:bg-surface"
                  >
                    <Pencil size={15} /> Edit
                  </a>
                {:else}
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-ink-muted hover:bg-surface disabled:opacity-50"
                    disabled={updatingId === group.id}
                    onclick={async () => {
                      await update(group.id);
                      close();
                    }}
                  >
                    {#if updatingId === group.id}
                      <Loader2 size={15} class="animate-spin" /> Updating…
                    {:else}
                      <RefreshCw size={15} /> Update the copy
                    {/if}
                  </button>
                {/if}
                <div class="my-1 border-t border-line-faint"></div>
                {#if confirmingId === group.id}
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded bg-negative px-2.5 py-1.5 text-left text-sm font-medium text-ink-inverse hover:bg-negative-hover"
                    onclick={() => {
                      remove(group.id);
                      close();
                    }}
                  >
                    <Trash2 size={15} /> Confirm delete?
                  </button>
                {:else}
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-negative-ink hover:bg-negative-surface"
                    onclick={() => (confirmingId = group.id)}
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                {/if}
              {/snippet}
            </CardMenu>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
