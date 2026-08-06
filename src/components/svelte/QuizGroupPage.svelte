<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    Check,
    ChevronRight,
    ExternalLink,
    FolderGit2,
    FolderTree as FolderTreeIcon,
    HardDrive,
    BookmarkPlus,
    Loader2,
    Play
  } from '@lucide/svelte';
  import { parseRepoRef, repoBrowseUrl, repoKey, type RepoRef } from '@/lib/utils/githubRef';
  import {
    pinnedRef,
    groupUrl,
    groupPlayUrl,
    repoQuizUrl,
    savedGroupPlayUrl,
    savedQuizUrl
  } from '@/lib/utils/remoteSource';
  import { allFolderPaths, buildFolderTree } from '@/lib/utils/folderTree';
  import { groupCrumbs } from '@/lib/utils/breadcrumb';
  import { entryRequiresWin, type JourneyProgress } from '@/lib/utils/journey';
  import {
    groupMode,
    serializeQwizGroup,
    type QuizGroup,
    type QuizGroupEntry
  } from '@/lib/utils/quizGroup';
  import {
    readJourneyProgress,
    recordJourneyPlay,
    resetJourneyProgress
  } from '@/lib/stores/groupProgress';
  import { isPlayableAsRun, type LoadedQuizGroup } from '@/lib/remote/quizGroupSource';
  import { remoteGroupSource, savedGroupSource, type GroupSource } from '@/lib/remote/groupSource';
  import {
    deleteSavedGroup,
    findSavedGroupByKey,
    getSavedGroup,
    saveGroup
  } from '@/lib/stores/savedGroups';
  import { quizFromQwizSource } from '@/lib/utils/importQwiz';
  import type { QuizRunResult } from '@/lib/utils/grading';
  import type { Quiz } from '@/lib/schemas/quiz';
  import Button from './Button.svelte';
  import ErrorList from './ErrorList.svelte';
  import FolderTree from './FolderTree.svelte';
  import JourneyMap from './JourneyMap.svelte';
  import QuizPlayer from './QuizPlayer.svelte';

  // Same "resolve at mount or show why not" shape as the other id-driven pages, with the loading
  // state a network round trip needs. `client:only` because there is nothing to render until the
  // URL has been read — and the URL names a repository that only exists at runtime.
  let repo = $state<RepoRef | null>(null);
  let loaded = $state<LoadedQuizGroup | null>(null);
  let errors = $state<string[]>([]);
  let loading = $state(true);
  // SvelteSet rather than a plain Set: a Set held in `$state` isn't reactive on mutation, and
  // reassigning a fresh copy on every toggle is the workaround this class exists to remove.
  const expanded = new SvelteSet<string>();

  // A journey plays IN PLACE rather than navigating away: a run finishing has to record progress
  // against this group, and keeping the player here makes that a local callback instead of
  // cross-page state.
  let progress = $state<JourneyProgress>({});
  let playing = $state<{ entry: QuizGroupEntry; quiz: Quiz; source: string } | null>(null);
  let playError = $state<string[]>([]);
  let starting = $state(false);

  // Where this group's files come from — a repository or a copy in this browser. Everything below
  // reads through it, so neither the render nor the play path knows which it got.
  let source = $state<GroupSource | null>(null);
  let savedId = $state<string | null>(null);
  let savedAt = $state<string | null>(null);
  let saving = $state(false);

  const group = $derived<QuizGroup | null>(loaded?.group ?? null);
  const isJourney = $derived(group !== null && groupMode(group) === 'journey');
  const tree = $derived(group && repo ? buildFolderTree(group.entries, repo.path ?? '') : null);
  const folderPaths = $derived(tree ? allFolderPaths(tree) : []);
  const allExpanded = $derived(folderPaths.length > 0 && expanded.size >= folderPaths.length);

  // Only the modes that are actually a single sitting get a Play action; `folders` is a browser,
  // and `journey` has its own screen where the order is the point.
  const playable = $derived(group !== null && isPlayableAsRun(group));

  // Only shown once there's an actual trail: a single crumb is a label, and the heading below
  // already says that. A saved group has no folders above it to climb to.
  const crumbs = $derived(repo && source?.kind === 'remote' ? groupCrumbs(repo) : []);

  // How the whole set gets played, chosen here rather than baked into the manifest — `merge` and
  // `shuffle` used to be modes an author picked, and they're player choices now. A `:mode=merge`
  // manifest simply starts with Merge already on.
  let mergeRun = $state(false);
  let shuffleRun = $state(false);

  // A saved group plays from the saved copy, never from the repository it came from. Without this
  // branch, pressing Play on an offline copy went straight back to the network for a group already
  // in localStorage — and for a group built locally there's no owner/repo to build a link out of at
  // all, so it produced `/group/play?repo=%2F` and a "doesn't say which repository" error.
  const playHref = $derived.by(() => {
    const options = { merge: mergeRun, shuffle: shuffleRun };
    // `source.kind`, not `savedId` alone: `savedId` is also set while browsing a LIVE repository
    // that happens to have an offline copy (it drives the "already saved" badge), and playing the
    // stale copy instead of what's on screen would be wrong.
    if (source?.kind === 'saved' && savedId) return savedGroupPlayUrl(savedId, options);
    return repo ? groupPlayUrl(repo, repo.path, options) : '#';
  });

  /** What the one button promises, so a player knows what they're starting before pressing it. */
  const playLabel = $derived.by(() => {
    if (!group) return 'Play';
    const count = group.entries.length;
    if (mergeRun) return `Play all ${count} as one quiz`;
    return count === 1 ? 'Play it' : `Play all ${count} in order`;
  });

  const groupKey = $derived(source?.key ?? '');

  async function playEntry(entry: QuizGroupEntry) {
    if (!source || starting) return;
    starting = true;
    playError = [];
    try {
      const fetched = await source.readFile(entry.path);
      if (!fetched.ok) {
        playError = [fetched.error];
        return;
      }
      const built = quizFromQwizSource(fetched.data);
      if (!built.quiz) {
        playError = built.errors;
        return;
      }
      playing = { entry, quiz: built.quiz, source: fetched.data };
    } finally {
      starting = false;
    }
  }

  function finishEntry(entry: QuizGroupEntry, result: QuizRunResult) {
    if (!group) return;
    // `won` is what a journey gates on, and what counts as won depends on this entry's own
    // require_win — a quiz that only had to be finished is cleared either way.
    const cleared = entryRequiresWin(group, entry) ? result.won : true;
    // Checked rather than assumed: a save that silently didn't happen would show the next quiz as
    // unlocked now and locked again after a reload, which is worse than saying so.
    if (!recordJourneyPlay(groupKey, entry.id, cleared)) {
      playError = [
        "Couldn't save your progress — your browser's storage might be full or unavailable."
      ];
      return;
    }
    progress = readJourneyProgress(groupKey);
  }

  function resetProgress() {
    if (!resetJourneyProgress(groupKey)) {
      playError = ["Couldn't reset your progress — your browser's storage might be unavailable."];
      return;
    }
    progress = readJourneyProgress(groupKey);
  }

  /** Where one quiz in this group opens. A saved group links into its own copy; anything else
   * links at the repository. */
  function quizHref(entry: QuizGroupEntry): string {
    if (source?.kind === 'saved' && savedId) return savedQuizUrl(savedId, entry.path);
    return repo ? repoQuizUrl(repo, entry.path) : '#';
  }

  /** Takes a full offline copy: the manifest plus every quiz it names, so the group opens later
   * with no network at all. Deliberately a copy rather than a bookmark — that's what the visitor
   * asked for by pressing it, and it's what makes a group usable on a train. */
  async function saveToBrowser() {
    if (!source || !group || !repo || saving) return;
    saving = true;
    playError = [];
    try {
      const fetched = await source.readFiles(group.entries.map((entry) => entry.path));
      if (fetched.files.length === 0) {
        playError = ["Couldn't read this group's quizzes, so there was nothing to save."];
        return;
      }

      const result = saveGroup({
        key: source.key,
        title: group.title || `${repo.owner}/${repo.repo}`,
        description: group.description,
        mode: groupMode(group),
        owner: repo.owner,
        repo: repo.repo,
        path: repo.path ?? '',
        ref: repo.ref ?? '',
        manifest: serializeQwizGroup(group),
        files: fetched.files
      });

      // Checked rather than assumed — a group of image-heavy quizzes really can exceed the quota,
      // and claiming "Saved" for a write that didn't land is the worst of the options.
      if (!result.saved) {
        playError = [result.error ?? "Couldn't save this group."];
        return;
      }
      savedId = result.saved.id;
      savedAt = result.saved.savedAt;
      if (fetched.skipped.length > 0) {
        playError = [
          `Saved, but ${fetched.skipped.length} quiz(zes) couldn't be read and aren't in the copy.`
        ];
      }
    } finally {
      saving = false;
    }
  }

  function removeSaved() {
    if (!savedId) return;
    if (!deleteSavedGroup(savedId)) {
      playError = ["Couldn't remove the saved copy — your browser's storage may be unavailable."];
      return;
    }
    savedId = null;
    savedAt = null;
  }

  /** One class string per toggle state, never two layered (CLAUDE.md §5). */
  function toggleTone(active: boolean): string {
    return active
      ? 'rounded-full border border-accent-line bg-accent-surface px-3 py-1.5 text-xs font-medium text-accent-ink-strong'
      : 'rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-hover';
  }

  /** A sub-group's name relative to the folder this screen is already showing. Without this a card
   * reads "examples/groups/journey" — a file path rather than a group. */
  function subGroupLabel(sub: string): string {
    const base = repo?.path ? `${repo.path.replace(/\/+$/, '')}/` : '';
    return sub.startsWith(base) ? sub.slice(base.length) : sub;
  }

  function toggle(path: string) {
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
  }

  function toggleAll() {
    const shouldCollapse = allExpanded;
    expanded.clear();
    if (!shouldCollapse) for (const path of folderPaths) expanded.add(path);
  }

  /** Resolves the source this screen is showing: `?saved=` is a copy in this browser, `?repo=` is
   * a repository. Everything after this point is identical for both. */
  function resolveSource(params: URLSearchParams): GroupSource | string {
    const savedParam = params.get('saved');
    if (savedParam) {
      const found = getSavedGroup(savedParam);
      if (!found) return "That saved group isn't in this browser any more.";
      savedId = found.id;
      savedAt = found.savedAt;
      repo = {
        owner: found.owner,
        repo: found.repo,
        ...(found.path ? { path: found.path } : {}),
        ...(found.ref ? { ref: found.ref } : {})
      };
      return savedGroupSource(found);
    }

    const raw = params.get('repo');
    if (!raw) return 'This link doesn’t say which repository to open.';

    const parsed = parseRepoRef(raw);
    if (!parsed) {
      return "That doesn't look like a repository. Use owner/name, or the whole github.com address.";
    }

    // A pasted /tree/ URL can carry the folder; an explicit ?path= wins over it.
    const path = params.get('path') ?? parsed.path;
    const ref: RepoRef = { ...pinnedRef(params, parsed), ...(path ? { path } : {}) };
    repo = ref;

    // Already kept? Then say so rather than offering to save it again.
    const existing = findSavedGroupByKey(repoKey(ref));
    if (existing) {
      savedId = existing.id;
      savedAt = existing.savedAt;
    }
    return remoteGroupSource(ref);
  }

  onMount(async () => {
    try {
      const resolved = resolveSource(new URLSearchParams(window.location.search));
      if (typeof resolved === 'string') {
        errors = [resolved];
        return;
      }
      source = resolved;

      const result = await resolved.load();
      if (!result.loaded) {
        errors = [result.error ?? "That group couldn't be loaded."];
        return;
      }
      loaded = result.loaded;
      progress = readJourneyProgress(resolved.key);
      mergeRun = groupMode(result.loaded.group) === 'merge';

      // Open the top level by default. A collapsed tree of folder names says nothing about what's
      // in the group, and the whole reason someone opened this link was to see that.
      const built = buildFolderTree(result.loaded.group.entries, repo?.path ?? '');
      for (const folder of built.folders) expanded.add(folder.path);
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <p
    class="flex items-center justify-center gap-2 rounded-lg border border-line-subtle p-6 text-sm text-ink-subtle"
  >
    <Loader2 size={16} class="animate-spin" /> Loading from GitHub…
  </p>
{:else if playing && repo}
  <!-- A journey plays its quizzes here rather than at /play, so a finished run can record progress
       against this group without any cross-page state. `saveCopySource` still works, and the
       LeaveGuard inside the player still covers a run in progress. -->
  <div class="space-y-4">
    <ErrorList errors={playError} />
    <QuizPlayer
      quiz={playing.quiz}
      saveCopySource={playing.source}
      onFinish={(result) => finishEntry(playing!.entry, result)}
      continueAction={{ label: 'Back to the journey', onclick: () => (playing = null) }}
    />
  </div>
{:else if loaded && repo && tree}
  <div class="space-y-6">
    <div class="space-y-2">
      {#if crumbs.length > 1}
        <nav aria-label="Breadcrumb">
          <ol class="flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
            {#each crumbs as crumb, i (crumb.label + i)}
              <li class="flex items-center gap-1">
                {#if i > 0}
                  <ChevronRight size={12} class="text-ink-faint" />
                {/if}
                {#if crumb.href}
                  <a href={crumb.href} class="font-medium text-accent-ink hover:underline">
                    {crumb.label}
                  </a>
                {:else}
                  <span aria-current="page" class="font-medium text-ink-soft">{crumb.label}</span>
                {/if}
              </li>
            {/each}
          </ol>
        </nav>
      {/if}
      <h1 class="text-2xl font-bold text-ink">
        {group?.title || `${repo.owner}/${repo.repo}`}
      </h1>
      {#if group?.description}
        <p class="whitespace-pre-wrap text-sm text-ink-subtle">{group.description}</p>
      {/if}
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
        {#if source?.kind === 'saved'}
          <span class="inline-flex items-center gap-1 font-medium text-ink-soft">
            <HardDrive size={13} /> Saved copy{savedAt
              ? ` · ${new Date(savedAt).toLocaleDateString()}`
              : ''}
          </span>
        {:else}
          <a
            href={repoBrowseUrl(repo, repo.path)}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline"
          >
            <FolderGit2 size={13} />
            {repo.owner}/{repo.repo}
            <ExternalLink size={11} />
          </a>
        {/if}
        {#if !loaded.fromManifest}
          <!-- Said plainly because it's the difference between a curated group and a directory
               listing, and because adding a .qwizgroup is what an author would do next. -->
          <span>Listed from the repository&rsquo;s .qwiz files — no .qwizgroup here yet.</span>
        {/if}
      </p>
    </div>

    {#if playable}
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-subtle bg-surface-raised p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <!-- Toggle chips rather than checkboxes: a native checkbox reads as a form field, but
               these are a way of PLAYING, the same kind of choice a segmented control makes — and
               there's no styled-checkbox precedent in this app to match against anyway. -->
          <button
            type="button"
            aria-pressed={mergeRun}
            class={toggleTone(mergeRun)}
            onclick={() => (mergeRun = !mergeRun)}
          >
            Merge
          </button>
          <button
            type="button"
            aria-pressed={shuffleRun}
            class={toggleTone(shuffleRun)}
            onclick={() => (shuffleRun = !shuffleRun)}
          >
            Shuffle
          </button>
        </div>
        <Button href={playHref} variant="primary">
          <Play size={16} />
          {playLabel}
        </Button>
      </div>
      <p class="-mt-4 text-xs text-ink-subtle">
        {mergeRun
          ? 'Every question from every quiz, as one run.'
          : 'Each quiz in turn, with one scoreboard at the end.'}
        {shuffleRun ? ' Order randomised.' : ''}
      </p>
    {/if}

    {#if loaded.warnings.length > 0}
      <ul
        class="space-y-1 rounded-lg border border-warning-line-faint bg-warning-surface p-4 text-sm text-warning-ink-strong"
      >
        {#each loaded.warnings as warning (warning)}
          <li>{warning}</li>
        {/each}
      </ul>
    {/if}

    {#if loaded.subGroups.length > 0}
      <div class="space-y-2">
        <h2 class="text-sm font-semibold text-ink-soft">Groups</h2>
        <ul class="space-y-0.5 rounded-lg border border-line-subtle bg-surface-raised p-2">
          {#each loaded.subGroups as sub (sub)}
            <li>
              <a
                href={groupUrl(repo, sub)}
                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-ink hover:bg-surface-hover"
              >
                <FolderTreeIcon size={15} class="shrink-0 text-ink-faint" />
                <span class="truncate">{subGroupLabel(sub)}</span>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <ErrorList errors={playError} />

    {#if group && group.entries.length > 0}
      {#if isJourney}
        <!-- A journey is a map, not a tree: the order is the whole point, so folders would say
             nothing and a flat list would hide what unlocks what. -->
        <JourneyMap {group} {progress} onPlay={playEntry} onReset={resetProgress} />
      {:else}
        <div class="space-y-2">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-sm font-semibold text-ink-soft">
              {group.entries.length} quiz{group.entries.length === 1 ? '' : 'zes'}
            </h2>
            {#if folderPaths.length > 0}
              <button
                type="button"
                class="text-xs font-medium text-accent-ink hover:underline"
                onclick={toggleAll}
              >
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            {/if}
          </div>
          <div class="rounded-lg border border-line-subtle bg-surface-raised p-2">
            <FolderTree node={tree} hrefFor={quizHref} {expanded} onToggle={toggle} />
          </div>
        </div>
      {/if}
    {/if}

    <!-- Saving takes the whole group, files and all, so it opens later with no network. The old
         copy here just told the reader nothing was saved, which is information rather than an
         action — this is the action. Same shape as the per-quiz "Save a copy" button (icon, label,
         secondary variant), since it's the same kind of action at a different scope. -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line-faint pt-4">
      {#if savedId}
        <span class="inline-flex items-center gap-1.5 text-sm font-medium text-positive-ink">
          <Check size={15} /> Saved to this browser
        </span>
        <div class="flex items-center gap-3">
          {#if source?.kind === 'remote'}
            <button
              type="button"
              class="text-xs font-medium text-accent-ink hover:underline"
              onclick={saveToBrowser}
              disabled={saving}
            >
              Update the copy
            </button>
          {/if}
          <button
            type="button"
            class="text-xs font-medium text-negative-ink hover:underline"
            onclick={removeSaved}
          >
            Remove
          </button>
        </div>
      {:else}
        <span class="text-xs text-ink-subtle">Keeps the whole group, playable offline.</span>
        <Button onclick={saveToBrowser} disabled={saving}>
          {#if saving}
            <Loader2 size={15} class="animate-spin" /> Saving…
          {:else}
            <BookmarkPlus size={15} /> Save a copy
          {/if}
        </Button>
      {/if}
    </div>
  </div>
{:else if errors.length > 0}
  <div class="space-y-4">
    <ErrorList {errors} />
    <p class="text-center">
      <a href="/" class="text-sm font-medium text-accent-ink hover:underline">
        Go to your own quizzes
      </a>
    </p>
  </div>
{/if}
