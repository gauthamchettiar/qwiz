<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2 } from '@lucide/svelte';
  import { parseRepoRef, type RepoRef } from '@/lib/utils/githubRef';
  import {
    pinnedRef,
    groupUrl,
    savedGroupUrl,
    readGroupRunOptions
  } from '@/lib/utils/remoteSource';
  import { entryLabel } from '@/lib/utils/folderTree';
  import { groupMode, type QuizGroup, type QuizGroupEntry } from '@/lib/utils/quizGroup';
  import { mergeGroupDocument, orderSources, type MergeSource } from '@/lib/utils/mergeGroup';
  import { quizFromQwizSource } from '@/lib/utils/importQwiz';
  import { parseQwizFile, parseQuizScriptQuestion } from '@/lib/utils/quizScript';
  import type { QuizScriptQuestion } from '@/lib/utils/quizScript';
  import { remoteGroupSource, savedGroupSource } from '@/lib/remote/groupSource';
  import { getSavedGroup } from '@/lib/stores/savedGroups';
  import type { QuizRunResult } from '@/lib/utils/grading';
  import type { Quiz } from '@/lib/schemas/quiz';
  import QuizPlayer from './QuizPlayer.svelte';
  import GauntletSession from './GauntletSession.svelte';
  import ErrorList from './ErrorList.svelte';
  import Button from './Button.svelte';

  // Plays a whole group as one sitting. Two shapes share this component because they share every
  // question about state except how many quizzes there are:
  //   merged     → one synthesised quiz, so `stages` has a single entry
  //   sequential → one stage per quiz, in order, with a scoreboard across them
  // Which of the two is a PLAYER choice now (the Merge toggle, carried in the URL), not an
  // author's; `:mode=merge` in a manifest simply means the toggle starts on. Only `journey` never
  // reaches here — its order is the content, so collapsing it would skip every gate it imposes.
  interface Stage {
    label: string;
    quiz: Quiz;
    source: string;
  }

  let repo = $state<RepoRef | null>(null);
  /** Set when this run came from a saved copy — the id, not the repository, is how it's addressed
   * on the way back out. A locally-built group has no owner/repo at all, so `groupUrl` would emit
   * `/group?repo=%2F` and strand the player on an error screen. */
  let savedId = $state<string | null>(null);

  /** Where "leave this run" goes. One function rather than the branch written at both call sites
   * (the gauntlet's exit and the results screen), which is how they'd drift. */
  function backToGroupHref(ref: RepoRef): string {
    return savedId ? savedGroupUrl(savedId) : groupUrl(ref, ref.path);
  }
  let group = $state<QuizGroup | null>(null);
  let stages = $state<Stage[]>([]);
  let index = $state(0);
  let scores = $state<{ label: string; result: QuizRunResult }[]>([]);
  let errors = $state<string[]>([]);
  let warnings = $state<string[]>([]);
  let loading = $state(true);
  // Gauntlet only: parsed questions per entry, since it draws ACROSS quizzes mid-run rather than
  // playing any one of them start to finish.
  // A plain record rather than a Map: it's a lookup table built once and replaced wholesale, so
  // there's nothing for a reactive Map to buy. `$state.raw` for the same reason.
  let gauntletQuestions = $state.raw<Record<string, QuizScriptQuestion[]> | null>(null);
  let groupBase = $state('');
  let shuffling = $state(false);

  const current = $derived(stages[index] ?? null);
  const done = $derived(stages.length > 0 && index >= stages.length);
  const totals = $derived(
    scores.reduce(
      (sum, entry) => ({
        earned: sum.earned + entry.result.earned,
        max: sum.max + entry.result.max
      }),
      { earned: 0, max: 0 }
    )
  );
  // No group-level win/lose threshold exists (each quiz defines its own points_to_win, if any), so
  // this is always accent-toned rather than switching to a positive tone the way a single quiz's
  // own results screen does.
  const totalsPercentage = $derived(totals.max > 0 ? (totals.earned / totals.max) * 100 : 0);

  function recordFinish(label: string, result: QuizRunResult) {
    scores = [...scores, { label, result }];
  }

  /** Builds one stage per entry — playlist. A quiz that doesn't parse is dropped with a warning
   * rather than stopping the run; the same rule the folders list and merge both follow. */
  function buildStages(entries: readonly QuizGroupEntry[], texts: Map<string, string>): Stage[] {
    const built: Stage[] = [];
    for (const entry of entries) {
      const source = texts.get(entry.path);
      if (source === undefined) continue;
      const { quiz } = quizFromQwizSource(source);
      if (!quiz) {
        warnings = [...warnings, `Skipped "${entryLabel(entry)}" — it doesn't parse.`];
        continue;
      }
      built.push({ label: quiz.title || entryLabel(entry), quiz, source });
    }
    return built;
  }

  onMount(async () => {
    try {
      const params = new URLSearchParams(window.location.search);

      // A saved group plays entirely from this browser; a repo one reads through the cache. Both
      // present the same interface, so nothing below here knows which it got.
      const savedParam = params.get('saved');
      let source;
      if (savedParam) {
        const found = getSavedGroup(savedParam);
        if (!found) {
          errors = ["That saved group isn't in this browser any more."];
          return;
        }
        savedId = found.id;
        repo = {
          owner: found.owner,
          repo: found.repo,
          ...(found.path ? { path: found.path } : {}),
          ...(found.ref ? { ref: found.ref } : {})
        };
        source = savedGroupSource(found);
      } else {
        const raw = params.get('repo');
        const parsed = raw ? parseRepoRef(raw) : null;
        if (!parsed) {
          errors = ['This link doesn’t say which repository to play.'];
          return;
        }
        const path = params.get('path') ?? parsed.path;
        const ref: RepoRef = { ...pinnedRef(params, parsed), ...(path ? { path } : {}) };
        repo = ref;
        source = remoteGroupSource(ref);
      }

      const result = await source.load();
      if (!result.loaded) {
        errors = [result.error ?? "That group couldn't be loaded."];
        return;
      }
      group = result.loaded.group;
      warnings = result.loaded.warnings;

      const mode = groupMode(group);
      // A `merge` manifest means "merged" even without the toggle; anywhere else the player says.
      const run = readGroupRunOptions(window.location.search);
      const merged = mode === 'merge' || run.merge;
      shuffling = run.shuffle;

      const entries = orderSources(group.entries, run.shuffle);

      const fetched = await source.readFiles(entries.map((entry) => entry.path));
      if (fetched.skipped.length > 0) {
        warnings = [
          ...warnings,
          `Couldn't read ${fetched.skipped.length} of this group's quizzes: ${fetched.skipped.join(', ')}.`
        ];
      }
      const texts = new Map(fetched.files.map((file) => [file.path, file.content]));

      if (mode === 'gauntlet') {
        groupBase = repo?.path ?? '';
        const parsed: Record<string, QuizScriptQuestion[]> = {};
        for (const entry of entries) {
          const source = texts.get(entry.path);
          if (source === undefined) continue;
          const file = parseQwizFile(source);
          if (file.errors.length > 0) {
            warnings = [...warnings, `Skipped "${entryLabel(entry)}" — it doesn't parse.`];
            continue;
          }
          parsed[entry.id] = file.questionCodes.map(
            (code) => parseQuizScriptQuestion(code).question
          );
        }
        if (Object.values(parsed).every((questions) => questions.length === 0)) {
          errors = ["None of this group's quizzes could be played."];
          return;
        }
        gauntletQuestions = parsed;
        return;
      }

      if (!merged) {
        stages = buildStages(entries, texts);
        if (stages.length === 0) errors = ["None of this group's quizzes could be played."];
        return;
      }

      // Merged: one synthesised document, played by the ordinary player.
      const sources: MergeSource[] = entries
        .filter((entry) => texts.has(entry.path))
        .map((entry) => ({
          id: entry.id,
          title: entryLabel(entry),
          source: texts.get(entry.path) as string
        }));

      const document = mergeGroupDocument(group, sources, { shuffle: run.shuffle });
      if (!document.source) {
        errors = document.errors;
        return;
      }
      if (document.skipped.length > 0) {
        warnings = [...warnings, `Skipped ${document.skipped.join(', ')} — they don't parse.`];
      }

      const { quiz, errors: buildErrors } = quizFromQwizSource(document.source);
      if (!quiz) {
        errors = buildErrors;
        return;
      }
      stages = [{ label: quiz.title, quiz, source: document.source }];
    } finally {
      loading = false;
    }
  });

  // Deliberately unused by merge/shuffle: with one stage there is nothing to continue TO, so the
  // player keeps its ordinary results screen (Back to quizzes / Play again) rather than growing a
  // Continue button that ends the run.
  const continueAction = $derived(
    stages.length > 1 && index < stages.length - 1
      ? { label: 'Next quiz', onclick: () => (index += 1) }
      : stages.length > 1
        ? { label: 'See group results', onclick: () => (index += 1) }
        : undefined
  );
</script>

{#if loading}
  <p
    class="flex items-center justify-center gap-2 rounded-lg border border-line-subtle p-6 text-sm text-ink-subtle"
  >
    <Loader2 size={16} class="animate-spin" /> Loading from GitHub…
  </p>
{:else if errors.length > 0}
  <div class="space-y-4">
    <ErrorList {errors} />
    <p class="text-center">
      <a href="/" class="text-sm font-medium text-accent-ink hover:underline">
        Go to your own quizzes
      </a>
    </p>
  </div>
{:else if gauntletQuestions && group && repo}
  <div class="space-y-4">
    {#if warnings.length > 0}
      <ul
        class="space-y-1 rounded-lg border border-warning-line-faint bg-warning-surface p-4 text-sm text-warning-ink-strong"
      >
        {#each warnings as warning (warning)}
          <li>{warning}</li>
        {/each}
      </ul>
    {/if}
    <GauntletSession
      {group}
      base={groupBase}
      questionsByEntry={gauntletQuestions}
      onExit={() => (window.location.href = backToGroupHref(repo))}
    />
  </div>
{:else if done && repo}
  <!-- Only reachable with more than one stage: a merged group ends on the player's own results.
       Same score-ring card QuizPlayer's own results screen uses, always accent-toned since a group
       has no single pass/fail threshold to switch on. -->
  <div class="overflow-hidden rounded-xl border border-line-subtle bg-surface-raised">
    <div
      class="flex flex-col items-center gap-4 bg-surface-hover px-6 py-8 text-center sm:flex-row sm:gap-6 sm:text-left"
    >
      <div
        class="relative grid h-24 w-24 shrink-0 place-items-center rounded-full text-accent"
        style={`background: conic-gradient(currentColor ${Math.round(totalsPercentage) * 3.6}deg, transparent 0deg)`}
      >
        <div class="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-surface-hover">
          <span class="text-xl font-bold text-ink">{Math.round(totalsPercentage)}%</span>
        </div>
      </div>
      <div class="space-y-1">
        <h1 class="text-lg font-bold text-ink">{group?.title || 'Group complete'}</h1>
        <p class="text-sm text-ink-subtle">
          {totals.earned} of {totals.max} points across {scores.length} quiz{scores.length === 1
            ? ''
            : 'zes'}
        </p>
      </div>
    </div>

    <ul class="space-y-1 px-6 py-4 text-sm">
      {#each scores as entry (entry.label)}
        <li class="flex items-baseline justify-between gap-3 border-b border-line-faint py-1">
          <span class="truncate text-ink-muted">{entry.label}</span>
          <span class="shrink-0 font-medium text-ink">
            {entry.result.earned} / {entry.result.max}
          </span>
        </li>
      {/each}
    </ul>

    <div
      class="flex flex-wrap items-center justify-center gap-2 border-t border-line-faint px-6 py-4"
    >
      <Button href={backToGroupHref(repo)}>Back to the group</Button>
      <Button href="/">Your own quizzes</Button>
    </div>
  </div>
{:else if current}
  <div class="space-y-4">
    {#if warnings.length > 0}
      <ul
        class="space-y-1 rounded-lg border border-warning-line-faint bg-warning-surface p-4 text-sm text-warning-ink-strong"
      >
        {#each warnings as warning (warning)}
          <li>{warning}</li>
        {/each}
      </ul>
    {/if}
    {#if stages.length > 1}
      <p class="text-center text-xs font-medium text-ink-subtle">
        Quiz {index + 1} of {stages.length}{shuffling ? ' · shuffled' : ''}
      </p>
    {/if}
    {#key current.label}
      <QuizPlayer
        quiz={current.quiz}
        saveCopySource={current.source}
        onFinish={(result) => recordFinish(current.label, result)}
        {continueAction}
      />
    {/key}
  </div>
{/if}
