<script lang="ts">
  import { Layers, Trophy } from '@lucide/svelte';
  import { getQuestionType } from '../question-types/registry';
  import { fetchGithubTrivia, type CategoryConfig } from '../github';
  import { countTrivias, type FolderNode } from '../folderTree';
  import { shuffledArray } from '../shuffle';
  import { defaultTriviaSettings, type QuestionInstance } from '../types';

  let {
    config,
    tree,
    owner,
    repo,
    ref
  }: {
    config: CategoryConfig;
    tree: FolderNode;
    owner: string;
    repo: string;
    ref: string;
  } = $props();

  const s = defaultTriviaSettings();
  const themeStyle = `--accent:${s.accentColor};--color-primary:${s.primaryColor};--color-secondary:${s.secondaryColor};--color-correct:${s.correctColor};--color-wrong:${s.wrongColor};--color-bg:${s.bgColor}`;

  function subtreePaths(node: FolderNode): string[] {
    return [...node.trivias.map((t) => t.path), ...node.folders.flatMap(subtreePaths)];
  }
  // Top-level folders are the categories; any trivias sitting directly under quiz-data/ form a
  // "General" category.
  const categories = [
    ...(tree.trivias.length ? [{ name: 'General', count: tree.trivias.length, paths: tree.trivias.map((t) => t.path) }] : []),
    ...tree.folders.map((f) => ({ name: f.name, count: countTrivias(f), paths: subtreePaths(f) }))
  ];

  type RoundResult = { category: string; earned: number; max: number };

  let step = $state<'intro' | 'loading' | 'picking' | 'answering' | 'finished'>('intro');
  let round = $state(0); // completed rounds
  let roundResults = $state<RoundResult[]>([]);
  let notice = $state('');

  // Full-question cache per trivia path, and the set of already-used questions so a run doesn't
  // repeat itself.
  const cache = new Map<string, QuestionInstance[]>();
  const used = new Set<string>();

  let roundCategory = $state('');
  let roundQuestions = $state<{ key: string; question: QuestionInstance }[]>([]);
  let qIndex = $state(0);
  let responses = $state<Record<string, unknown>>({});

  const current = $derived(roundQuestions[qIndex]);
  const currentDef = $derived(current ? getQuestionType(current.question.type) : undefined);
  const currentComplete = $derived(
    current && currentDef ? (currentDef.isAnswerComplete?.(current.question.data, responses[current.question.id]) ?? true) : true
  );
  const isLastInRound = $derived(qIndex === roundQuestions.length - 1);

  const graded = $derived(roundResults.filter((r) => r.max > 0));
  const avgPct = $derived(
    graded.length ? Math.round(graded.reduce((a, r) => a + (r.earned / r.max) * 100, 0) / graded.length) : 0
  );

  async function pick(cat: { name: string; paths: string[] }) {
    notice = '';
    step = 'loading';
    const pool: { key: string; question: QuestionInstance }[] = [];
    for (const p of cat.paths) {
      let qs = cache.get(p);
      if (!qs) {
        const res = await fetchGithubTrivia(owner, repo, p, ref);
        qs = res.ok ? res.trivia.questions : [];
        cache.set(p, qs);
      }
      for (const q of qs) pool.push({ key: `${p}#${q.id}`, question: q });
    }
    const fresh = shuffledArray(pool.filter((x) => !used.has(x.key)));
    const chosen = fresh.slice(0, config.questionsPerPick);
    if (chosen.length === 0) {
      notice = `“${cat.name}” has no fresh questions left — try another category.`;
      step = 'picking';
      return;
    }
    chosen.forEach((x) => used.add(x.key));
    roundCategory = cat.name;
    roundQuestions = chosen;
    qIndex = 0;
    responses = {};
    step = 'answering';
  }

  function setResponse(id: string, r: unknown) {
    responses = { ...responses, [id]: r };
  }

  function next() {
    if (!isLastInRound) {
      qIndex += 1;
      return;
    }
    // Grade the round and move on.
    let earned = 0;
    let max = 0;
    for (const { question } of roundQuestions) {
      const g = getQuestionType(question.type).grade(question.data, responses[question.id]);
      earned += g.earned;
      max += g.max;
    }
    roundResults = [...roundResults, { category: roundCategory, earned, max }];
    round += 1;
    step = round >= config.rounds ? 'finished' : 'picking';
  }

  function start() {
    step = 'picking';
  }
  function restart() {
    step = 'intro';
    round = 0;
    roundResults = [];
    used.clear();
    notice = '';
  }
</script>

<div style={themeStyle}>
  {#if step === 'intro'}
    <div class="space-y-5 rounded-lg border border-slate-200 p-6">
      {#if config.title}<h2 class="text-lg font-semibold text-slate-900">{config.title}</h2>{/if}
      {#if config.description}<p class="text-sm text-slate-500">{config.description}</p>{/if}
      <ul class="space-y-1.5 text-sm text-slate-600">
        <li class="flex items-center gap-2"><Layers size={15} class="text-[var(--accent)]" /> Choose a category every {config.questionsPerPick} question{config.questionsPerPick === 1 ? '' : 's'}.</li>
        <li class="flex items-center gap-2"><Trophy size={15} class="text-[var(--accent)]" /> {config.rounds} rounds — scored on your average across them.</li>
      </ul>
      <button type="button" class="rounded-md bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700" onclick={start}>
        Start
      </button>
    </div>
  {:else if step === 'loading'}
    <p class="text-sm text-slate-400">Loading questions…</p>
  {:else if step === 'picking'}
    <div class="space-y-4">
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>Round {round + 1} of {config.rounds}</span>
        {#if roundResults.length}<span>Average so far: {avgPct}%</span>{/if}
      </div>
      <p class="text-sm font-medium text-slate-700">Pick a category</p>
      {#if notice}<p class="text-xs text-[var(--color-wrong)]">{notice}</p>{/if}
      <div class="grid gap-3 sm:grid-cols-2">
        {#each categories as cat (cat.name)}
          <button
            type="button"
            class="rounded-md border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-400 hover:bg-slate-50"
            onclick={() => pick(cat)}
          >
            <span class="font-semibold text-slate-900">{cat.name}</span>
            <span class="ml-1 text-xs text-slate-400">({cat.count} triv{cat.count === 1 ? 'ia' : 'ias'})</span>
          </button>
        {/each}
      </div>
    </div>
  {:else if step === 'answering' && current && currentDef}
    <div class="space-y-6">
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>{roundCategory} · question {qIndex + 1} of {roundQuestions.length}</span>
        <span>Round {round + 1} of {config.rounds}</span>
      </div>
      <div class="rounded-lg border border-slate-200 bg-[var(--color-bg)] p-5">
        {#key current.key}
          <currentDef.Player
            data={current.question.data}
            response={responses[current.question.id]}
            onChange={(r: unknown) => setResponse(current.question.id, r)}
          />
        {/key}
      </div>
      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!currentComplete}
          onclick={next}
        >
          {isLastInRound ? (round + 1 >= config.rounds ? 'See results' : 'Next category') : 'Next'}
        </button>
      </div>
    </div>
  {:else if step === 'finished'}
    <div class="space-y-6">
      <div class="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-6 text-center">
        <p class="text-sm font-medium text-[var(--accent)]">Your average</p>
        <p class="text-3xl font-bold text-slate-900">{avgPct}%</p>
        <p class="mt-1 text-xs text-slate-500">across {graded.length} scored round{graded.length === 1 ? '' : 's'}</p>
      </div>
      <ul class="space-y-2">
        {#each roundResults as r, i (i)}
          <li class="flex items-center justify-between rounded-md border border-slate-200 p-3 text-sm">
            <span class="font-medium text-slate-700">Round {i + 1} · {r.category}</span>
            <span class="text-slate-500">{r.max > 0 ? `${r.earned} / ${r.max} pts (${Math.round((r.earned / r.max) * 100)}%)` : 'not scored'}</span>
          </li>
        {/each}
      </ul>
      <div class="flex justify-center">
        <button type="button" class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700" onclick={restart}>
          Try again
        </button>
      </div>
    </div>
  {/if}
</div>
