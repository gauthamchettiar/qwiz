<script lang="ts">
  import { ArrowDown, ArrowUp, Download, FolderGit2, Loader2 } from '@lucide/svelte';
  import { listQuizzes } from '@/lib/stores/quizzes';
  import { downloadBlobFile } from '@/lib/utils/download';
  import { createZip } from '@/lib/utils/zip';
  import { GROUP_MODES } from '@/lib/utils/quizGroup';
  import {
    buildGroupFiles,
    emptyGroupDraft,
    groupZipName,
    modeSummary,
    modeUsesFolders,
    type GroupDraft
  } from '@/lib/utils/groupBuilder';
  import ErrorList from './ErrorList.svelte';
  import Button from './Button.svelte';

  // Assembles a publishable group out of quizzes already in this browser. The app deliberately
  // stops at a downloadable folder rather than creating a repository — that would need a GitHub
  // token with write access, and the whole remote feature rests on reading public files signed out.
  //
  // Every DECISION (filenames, ids, which settings a mode accepts, whether the result parses) lives
  // in `lib/utils/groupBuilder.ts`. This is the form.
  const library = listQuizzes();
  const byId = new Map(library.map((quiz) => [quiz.id, quiz]));

  let draft = $state<GroupDraft>(emptyGroupDraft());
  let tagsText = $state('');
  let building = $state(false);
  let downloadError = $state<string[]>([]);

  const selected = $derived(new Set(draft.entries.map((entry) => entry.quizId)));
  const showFolders = $derived(modeUsesFolders(draft.mode));

  // Recomputed on every keystroke, which is affordable because it's pure string work — and it's
  // what makes the preview and the error list describe the SAME artefact the download produces.
  const built = $derived(buildGroupFiles({ ...draft, tags: parseTags(tagsText) }, byId));

  function parseTags(text: string): string[] {
    return text
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function toggle(quizId: string) {
    draft.entries = selected.has(quizId)
      ? draft.entries.filter((entry) => entry.quizId !== quizId)
      : [...draft.entries, { quizId, folder: '', title: '' }];
  }

  function move(index: number, by: number) {
    const next = [...draft.entries];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    draft.entries = next;
  }

  async function download() {
    if (built.errors.length > 0 || building) return;
    building = true;
    downloadError = [];
    try {
      const blob = await createZip(built.files);
      downloadBlobFile(groupZipName(draft), blob);
    } catch {
      // Compression is the platform's own and needs Safari 16.4+ / Firefox 113+ / Chrome 103+ —
      // the same floor share links already sit on.
      downloadError = ["Couldn't build the archive — this browser may be too old to compress it."];
    } finally {
      building = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="space-y-1">
    <h1 class="text-2xl font-bold text-ink">Publish a group</h1>
    <p class="text-sm text-ink-subtle">
      Pick quizzes from your library, choose how they should be played, and download the folder.
      Push it to a public GitHub repository and it becomes a link anyone can open.
    </p>
  </div>

  {#if library.length === 0}
    <p class="rounded-lg border border-line-subtle p-6 text-center text-sm text-ink-subtle">
      No quizzes yet — a group is made from quizzes in your library, so create one first.
    </p>
  {:else}
    <div class="space-y-3 rounded-lg border border-line-subtle bg-surface-raised p-4">
      <label class="block space-y-1">
        <span class="text-sm font-medium text-ink-soft">Group title</span>
        <input
          type="text"
          class="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-subtle"
          placeholder="Thursday Night Quiz"
          bind:value={draft.title}
        />
      </label>

      <label class="block space-y-1">
        <span class="text-sm font-medium text-ink-soft">Description</span>
        <textarea
          class="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-subtle"
          rows="2"
          placeholder="What this set of quizzes is."
          bind:value={draft.description}></textarea>
      </label>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block space-y-1">
          <span class="text-sm font-medium text-ink-soft">Category</span>
          <input
            type="text"
            class="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-subtle"
            bind:value={draft.category}
          />
        </label>
        <label class="block space-y-1">
          <span class="text-sm font-medium text-ink-soft">Tags</span>
          <input
            type="text"
            class="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-subtle"
            placeholder="comma, separated"
            bind:value={tagsText}
          />
        </label>
      </div>
    </div>

    <div class="space-y-3 rounded-lg border border-line-subtle bg-surface-raised p-4">
      <label class="block space-y-1">
        <span class="text-sm font-medium text-ink-soft">How it plays</span>
        <select
          class="w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-subtle"
          bind:value={draft.mode}
        >
          {#each GROUP_MODES as mode (mode)}
            <option value={mode}>{mode}</option>
          {/each}
        </select>
      </label>
      <p class="text-xs text-ink-subtle">{modeSummary(draft.mode)}</p>

      <!-- Only the settings this mode actually accepts. A key outside its mode is a parse error,
           so showing them all would be offering the author a way to break their own file. -->
      {#if draft.mode === 'journey'}
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" bind:checked={draft.requireWin} />
          Each quiz must be won, not just finished, to unlock the next
        </label>
      {:else if draft.mode === 'playlist'}
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" bind:checked={draft.shuffleQuizzes} />
          Play the quizzes in a random order
        </label>
      {:else if draft.mode === 'shuffle'}
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          How many quizzes to draw
          <input
            type="number"
            min="1"
            class="w-20 rounded-md border border-line-subtle bg-surface px-2 py-1 text-sm text-ink"
            bind:value={draft.pick}
          />
        </label>
      {:else if draft.mode === 'merge'}
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          Questions per run (0 for all of them)
          <input
            type="number"
            min="0"
            class="w-20 rounded-md border border-line-subtle bg-surface px-2 py-1 text-sm text-ink"
            bind:value={draft.questionsPerRun}
          />
        </label>
      {:else if draft.mode === 'gauntlet'}
        <div class="flex flex-wrap gap-4">
          <label class="flex items-center gap-2 text-sm text-ink-muted">
            Questions per pick
            <input
              type="number"
              min="1"
              class="w-20 rounded-md border border-line-subtle bg-surface px-2 py-1 text-sm text-ink"
              bind:value={draft.questionsPerPick}
            />
          </label>
          <label class="flex items-center gap-2 text-sm text-ink-muted">
            Rounds
            <input
              type="number"
              min="1"
              class="w-20 rounded-md border border-line-subtle bg-surface px-2 py-1 text-sm text-ink"
              bind:value={draft.rounds}
            />
          </label>
        </div>
      {/if}
    </div>

    <div class="space-y-2">
      <h2 class="text-sm font-semibold text-ink-soft">Quizzes in this group</h2>
      <ul class="space-y-2">
        {#each library as quiz (quiz.id)}
          {@const index = draft.entries.findIndex((entry) => entry.quizId === quiz.id)}
          <li class="rounded-lg border border-line-subtle bg-surface-raised p-3">
            <label class="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={selected.has(quiz.id)}
                onchange={() => toggle(quiz.id)}
              />
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {quiz.title || 'Untitled quiz'}
              </span>
              {#if index >= 0}
                <span class="shrink-0 text-xs text-ink-subtle">#{index + 1}</span>
                <button
                  type="button"
                  class="rounded p-1 text-ink-subtle hover:bg-surface-hover disabled:opacity-40"
                  aria-label={`Move ${quiz.title} up`}
                  disabled={index === 0}
                  onclick={() => move(index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-ink-subtle hover:bg-surface-hover disabled:opacity-40"
                  aria-label={`Move ${quiz.title} down`}
                  disabled={index === draft.entries.length - 1}
                  onclick={() => move(index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
              {/if}
            </label>

            {#if index >= 0}
              <div class="mt-2 grid gap-2 pl-7 sm:grid-cols-2">
                <input
                  type="text"
                  class="rounded-md border border-line-subtle bg-surface px-2 py-1 text-xs text-ink"
                  placeholder="Display name (optional)"
                  aria-label={`Display name for ${quiz.title}`}
                  bind:value={draft.entries[index].title}
                />
                {#if showFolders}
                  <input
                    type="text"
                    class="rounded-md border border-line-subtle bg-surface px-2 py-1 text-xs text-ink"
                    placeholder={draft.mode === 'gauntlet'
                      ? 'Category (required)'
                      : 'Folder (optional)'}
                    aria-label={`Folder for ${quiz.title}`}
                    bind:value={draft.entries[index].folder}
                  />
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </div>

    <ErrorList errors={[...built.errors, ...downloadError]} />

    <div class="space-y-2">
      <h2 class="text-sm font-semibold text-ink-soft">.qwizgroup preview</h2>
      <!-- The manifest the download will actually contain, not an approximation of it: the same
           string, from the same function, checked by the same parser. -->
      <pre
        class="overflow-x-auto rounded-lg border border-line-subtle bg-surface p-3 font-mono text-xs text-ink-muted">{built.manifest}</pre>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <Button variant="primary" disabled={built.errors.length > 0 || building} onclick={download}>
        {#if building}
          <Loader2 size={15} class="animate-spin" /> Building…
        {:else}
          <Download size={15} /> Download group as .zip
        {/if}
      </Button>
      <p class="text-xs text-ink-subtle">
        {built.files.length > 0 ? `${built.files.length} files` : 'Nothing to download yet'}
      </p>
    </div>

    <div
      class="space-y-2 rounded-lg border border-line-subtle bg-surface p-4 text-sm text-ink-subtle"
    >
      <p class="flex items-center gap-1.5 font-medium text-ink-soft">
        <FolderGit2 size={15} /> What to do with it
      </p>
      <ol class="ml-4 list-decimal space-y-1">
        <li>Unzip it into a public GitHub repository — the whole folder, keeping the structure.</li>
        <li>Commit and push.</li>
        <li>
          Share <code class="rounded bg-surface-sunken px-1">/group?repo=owner/name</code>, or the
          folder you put it in with <code class="rounded bg-surface-sunken px-1">&amp;path=</code>.
        </li>
      </ol>
      <p>
        Qwiz reads it signed out, so the repository has to be public. Nothing is uploaded from here
        — this is a download.
      </p>
    </div>
  {/if}
</div>
