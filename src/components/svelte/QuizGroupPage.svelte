<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    ExternalLink,
    FolderGit2,
    FolderTree as FolderTreeIcon,
    Loader2,
    Play
  } from '@lucide/svelte';
  import { parseRepoRef, repoBrowseUrl, repoKey, type RepoRef } from '@/lib/utils/githubRef';
  import { pinnedRef, groupUrl } from '@/lib/utils/remoteSource';
  import { allFolderPaths, buildFolderTree } from '@/lib/utils/folderTree';
  import { entryRequiresWin, type JourneyProgress } from '@/lib/utils/journey';
  import { groupMode, type QuizGroup, type QuizGroupEntry } from '@/lib/utils/quizGroup';
  import {
    readJourneyProgress,
    recordJourneyPlay,
    resetJourneyProgress
  } from '@/lib/stores/groupProgress';
  import {
    isPlayableAsRun,
    loadQuizGroup,
    type LoadedQuizGroup
  } from '@/lib/remote/quizGroupSource';
  import { fetchRepoFile } from '@/lib/remote/github';
  import { quizFromQwizSource } from '@/lib/utils/importQwiz';
  import type { QuizRunResult } from '@/lib/utils/grading';
  import type { Quiz } from '@/lib/schemas/quiz';
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

  const group = $derived<QuizGroup | null>(loaded?.group ?? null);
  const isJourney = $derived(group !== null && groupMode(group) === 'journey');
  const tree = $derived(group && repo ? buildFolderTree(group.entries, repo.path ?? '') : null);
  const folderPaths = $derived(tree ? allFolderPaths(tree) : []);
  const allExpanded = $derived(folderPaths.length > 0 && expanded.size >= folderPaths.length);

  // Only the modes that are actually a single sitting get a Play action; `folders` is a browser,
  // and `journey` has its own screen where the order is the point.
  const playable = $derived(group !== null && isPlayableAsRun(group));

  /** What the one button promises, so a player knows what they're starting. */
  const playLabel = $derived.by(() => {
    if (!group) return 'Play';
    switch (groupMode(group)) {
      case 'merge':
        return 'Play all as one quiz';
      case 'playlist':
        return 'Play all in order';
      case 'shuffle':
        return 'Play a random draw';
      default:
        return 'Play';
    }
  });

  const groupKey = $derived(repo ? repoKey(repo) : '');

  async function playEntry(entry: QuizGroupEntry) {
    if (!repo || starting) return;
    starting = true;
    playError = [];
    try {
      const fetched = await fetchRepoFile(repo, entry.path);
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

  function toggle(path: string) {
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
  }

  function toggleAll() {
    const shouldCollapse = allExpanded;
    expanded.clear();
    if (!shouldCollapse) for (const path of folderPaths) expanded.add(path);
  }

  onMount(async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('repo');
      if (!raw) {
        errors = ['This link doesn’t say which repository to open.'];
        return;
      }

      const parsed = parseRepoRef(raw);
      if (!parsed) {
        errors = [
          "That doesn't look like a repository. Use owner/name, or the whole github.com address."
        ];
        return;
      }

      // A pasted /tree/ URL can carry the folder; an explicit ?path= wins over it.
      const path = params.get('path') ?? parsed.path;
      const ref: RepoRef = { ...pinnedRef(params, parsed), ...(path ? { path } : {}) };
      repo = ref;

      const result = await loadQuizGroup(ref);
      if (!result.loaded) {
        errors = [result.error ?? "That group couldn't be loaded."];
        return;
      }
      loaded = result.loaded;
      progress = readJourneyProgress(repoKey(ref));

      // Open the top level by default. A collapsed tree of folder names says nothing about what's
      // in the group, and the whole reason someone opened this link was to see that.
      const built = buildFolderTree(result.loaded.group.entries, ref.path ?? '');
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
      <h1 class="text-2xl font-bold text-ink">
        {group?.title || `${repo.owner}/${repo.repo}`}
      </h1>
      {#if group?.description}
        <p class="whitespace-pre-wrap text-sm text-ink-subtle">{group.description}</p>
      {/if}
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
        <a
          href={repoBrowseUrl(repo, repo.path)}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline"
        >
          <FolderGit2 size={13} />
          {repo.owner}/{repo.repo}{repo.path ? `/${repo.path}` : ''}
          <ExternalLink size={11} />
        </a>
        {#if !loaded.fromManifest}
          <!-- Said plainly because it's the difference between a curated group and a directory
               listing, and because adding a .qwizgroup is what an author would do next. -->
          <span>Listed from the repository&rsquo;s .qwiz files — no .qwizgroup here yet.</span>
        {/if}
      </p>
    </div>

    {#if playable}
      <a
        href={`/group/play?${new URLSearchParams({
          repo: `${repo.owner}/${repo.repo}`,
          ...(repo.path ? { path: repo.path } : {}),
          ...(repo.ref ? { ref: repo.ref } : {})
        }).toString()}`}
        class="flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-ink-inverse hover:bg-accent-hover"
      >
        <Play size={16} />
        {playLabel}
      </a>
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
        <ul class="space-y-2">
          {#each loaded.subGroups as sub (sub)}
            <li>
              <a
                href={groupUrl(repo, sub)}
                class="flex items-center gap-2 rounded-lg border border-line-subtle bg-surface-raised px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-line hover:bg-surface-hover"
              >
                <FolderTreeIcon size={15} class="shrink-0 text-ink-faint" />
                <span class="truncate">{sub}</span>
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
          <FolderTree node={tree} {repo} {expanded} onToggle={toggle} />
        </div>
      {/if}
    {/if}

    <p class="text-center text-xs text-ink-subtle">
      Nothing here is saved to this browser. Open a quiz to play it, then &ldquo;Save a copy&rdquo;
      to keep it.
    </p>
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
