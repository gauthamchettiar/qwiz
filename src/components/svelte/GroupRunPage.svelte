<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2, Trophy } from '@lucide/svelte';
  import { parseRepoRef, type RepoRef } from '@/lib/utils/githubRef';
  import { pinnedRef, groupUrl } from '@/lib/utils/remoteSource';
  import { entryLabel } from '@/lib/utils/folderTree';
  import { groupMode, type QuizGroup, type QuizGroupEntry } from '@/lib/utils/quizGroup';
  import { mergeGroupDocument, selectSources, type MergeSource } from '@/lib/utils/mergeGroup';
  import { quizFromQwizSource } from '@/lib/utils/importQwiz';
  import { parseQwizFile, parseQuizScriptQuestion } from '@/lib/utils/quizScript';
  import type { QuizScriptQuestion } from '@/lib/utils/quizScript';
  import { shuffledArray } from '@/lib/utils/shuffle';
  import { loadQuizGroup } from '@/lib/remote/quizGroupSource';
  import { fetchRepoFiles } from '@/lib/remote/github';
  import type { QuizRunResult } from '@/lib/utils/grading';
  import type { Quiz } from '@/lib/schemas/quiz';
  import QuizPlayer from './QuizPlayer.svelte';
  import GauntletSession from './GauntletSession.svelte';
  import ErrorList from './ErrorList.svelte';

  // Plays a whole group as one sitting. Two shapes share this component because they share every
  // question about state except how many quizzes there are:
  //   merge / shuffle → one synthesised quiz, so `stages` has a single entry
  //   playlist        → one stage per quiz, in order, with a scoreboard across them
  // `folders` and `journey` never reach here; they're browsing screens, not runs.
  interface Stage {
    label: string;
    quiz: Quiz;
    source: string;
  }

  let repo = $state<RepoRef | null>(null);
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
      const raw = params.get('repo');
      const parsed = raw ? parseRepoRef(raw) : null;
      if (!parsed) {
        errors = ['This link doesn’t say which repository to play.'];
        return;
      }

      const path = params.get('path') ?? parsed.path;
      const ref: RepoRef = { ...pinnedRef(params, parsed), ...(path ? { path } : {}) };
      repo = ref;

      const result = await loadQuizGroup(ref);
      if (!result.loaded) {
        errors = [result.error ?? "That group couldn't be loaded."];
        return;
      }
      group = result.loaded.group;
      warnings = result.loaded.warnings;

      const mode = groupMode(group);
      // `selectSources` is where shuffle's draw happens; every other mode takes all of them in
      // the manifest's order.
      let entries = selectSources(group, group.entries);
      if (mode === 'playlist' && group.settings.shuffle_quizzes === true) {
        entries = shuffledArray(entries);
      }

      const fetched = await fetchRepoFiles(
        ref,
        entries.map((entry) => entry.path)
      );
      if (fetched.skipped.length > 0) {
        warnings = [
          ...warnings,
          `Couldn't read ${fetched.skipped.length} of this group's quizzes: ${fetched.skipped.join(', ')}.`
        ];
      }
      const texts = new Map(fetched.files.map((file) => [file.path, file.content]));

      if (mode === 'gauntlet') {
        groupBase = ref.path ?? '';
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

      if (mode === 'playlist') {
        stages = buildStages(entries, texts);
        if (stages.length === 0) errors = ["None of this group's quizzes could be played."];
        return;
      }

      // merge / shuffle: one synthesised document, played by the ordinary player.
      const sources: MergeSource[] = entries
        .filter((entry) => texts.has(entry.path))
        .map((entry) => ({
          id: entry.id,
          title: entryLabel(entry),
          source: texts.get(entry.path) as string
        }));

      const merged = mergeGroupDocument(group, sources);
      if (!merged.source) {
        errors = merged.errors;
        return;
      }
      if (merged.skipped.length > 0) {
        warnings = [...warnings, `Skipped ${merged.skipped.join(', ')} — they don't parse.`];
      }

      const { quiz, errors: buildErrors } = quizFromQwizSource(merged.source);
      if (!quiz) {
        errors = buildErrors;
        return;
      }
      stages = [{ label: quiz.title, quiz, source: merged.source }];
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
      onExit={() => (window.location.href = groupUrl(repo, repo.path))}
    />
  </div>
{:else if done && repo}
  <!-- Only reachable with more than one stage: a merged group ends on the player's own results. -->
  <div class="space-y-4 rounded-lg border border-line-subtle bg-surface-raised p-6 text-center">
    <Trophy size={28} class="mx-auto text-accent-ink" />
    <h1 class="text-xl font-bold text-ink">{group?.title || 'Group complete'}</h1>
    <p class="text-sm text-ink-subtle">
      {totals.earned} / {totals.max} points across {scores.length} quiz{scores.length === 1
        ? ''
        : 'zes'}
    </p>
    <ul class="mx-auto max-w-sm space-y-1 text-left text-sm">
      {#each scores as entry (entry.label)}
        <li class="flex items-baseline justify-between gap-3 border-b border-line-faint py-1">
          <span class="truncate text-ink-muted">{entry.label}</span>
          <span class="shrink-0 font-medium text-ink">
            {entry.result.earned} / {entry.result.max}
          </span>
        </li>
      {/each}
    </ul>
    <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
      <a
        href={groupUrl(repo, repo.path)}
        class="rounded-md border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface"
      >
        Back to the group
      </a>
      <a
        href="/"
        class="rounded-md border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface"
      >
        Your own quizzes
      </a>
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
        Quiz {index + 1} of {stages.length}
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
