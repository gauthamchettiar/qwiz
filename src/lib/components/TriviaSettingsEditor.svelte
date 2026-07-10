<script lang="ts">
  import { Settings, ChevronDown, Trophy, Timer, Settings2, Palette } from '@lucide/svelte';
  import type { RevealTiming, RevealWinTiming, TriviaSettings } from '../types';

  let {
    settings,
    totalMaxPoints,
    onChange
  }: {
    settings: TriviaSettings;
    totalMaxPoints: number;
    onChange: (settings: TriviaSettings) => void;
  } = $props();

  const revealTimingOptions: { value: RevealTiming; label: string }[] = [
    { value: 'after-question', label: 'After every question' },
    { value: 'end', label: 'At end' },
    { value: 'never', label: 'Never' }
  ];
  const revealWinOptions: { value: RevealWinTiming; label: string }[] = [
    { value: 'end', label: 'At end' },
    { value: 'never', label: 'Never' }
  ];

  function set<K extends keyof TriviaSettings>(key: K, value: TriviaSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  // Switching either reveal timing to "after every question" nudges on the answer-lock
  // setting too, since revising an answer after seeing the result defeats the point.
  function setRevealAnswers(value: RevealTiming) {
    onChange({
      ...settings,
      revealAnswers: value,
      disableEditAfterReveal: value === 'after-question' ? true : settings.disableEditAfterReveal
    });
  }

  function setRevealScore(value: RevealTiming) {
    onChange({
      ...settings,
      revealScore: value,
      disableEditAfterReveal: value === 'after-question' ? true : settings.disableEditAfterReveal
    });
  }

  function toOptionalNumber(raw: string): number | null {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function toLines(raw: string): string[] {
    return raw.split('\n');
  }
</script>

{#snippet segmented(options: { value: string; label: string }[], current: string, onSelect: (v: any) => void)}
  <div class="inline-flex flex-wrap rounded-md border border-slate-300 bg-white text-xs">
    {#each options as opt, i (opt.value)}
      <button
        type="button"
        class="px-2.5 py-1.5 font-medium {current === opt.value
          ? 'bg-indigo-600 text-white'
          : 'text-slate-600 hover:bg-slate-100'} {i === 0 ? 'rounded-l-md' : ''} {i === options.length - 1
          ? 'rounded-r-md'
          : ''}"
        onclick={() => onSelect(opt.value)}
      >
        {opt.label}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet group(Icon: typeof Trophy, label: string, children: () => any)}
  <div class="space-y-3 rounded-lg border border-dashed border-slate-300 p-3">
    <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <Icon size={13} />
      {label}
    </p>
    {@render children()}
  </div>
{/snippet}

<details class="group">
  <summary
    class="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-medium text-slate-700 hover:text-slate-900"
  >
    <Settings size={15} />
    Trivia settings
    <ChevronDown size={15} class="ml-auto text-slate-400 transition-transform group-open:rotate-180" />
  </summary>
  <div class="space-y-4 border-t border-slate-100 pt-4">
    {#snippet scoring()}
      <div class="space-y-3">
        <div>
          <p class="mb-1 text-xs font-medium text-slate-500">Points to win</p>
          <div class="flex items-center gap-2">
            <input
              type="number"
              class="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
              placeholder="None"
              value={settings.pointsToWin ?? ''}
              oninput={(e) => set('pointsToWin', toOptionalNumber(e.currentTarget.value))}
            />
            <span class="text-sm text-slate-400">/ {totalMaxPoints} total</span>
          </div>
        </div>
        <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            class="h-4 w-4 accent-indigo-600"
            checked={settings.showRunningScore}
            onchange={(e) => set('showRunningScore', e.currentTarget.checked)}
          />
          Show current points at top
        </label>
      </div>
    {/snippet}
    {@render group(Trophy, 'Scoring', scoring)}

    {#snippet timers()}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p class="mb-1 text-xs font-medium text-slate-500">Per-question limit (seconds)</p>
          <input
            type="number"
            class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="No limit"
            value={settings.perQuestionTimeLimit ?? ''}
            oninput={(e) => set('perQuestionTimeLimit', toOptionalNumber(e.currentTarget.value))}
          />
        </div>
        <div>
          <p class="mb-1 text-xs font-medium text-slate-500">Overall limit (seconds)</p>
          <input
            type="number"
            class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="No limit"
            value={settings.overallTimeLimit ?? ''}
            oninput={(e) => set('overallTimeLimit', toOptionalNumber(e.currentTarget.value))}
          />
        </div>
      </div>
    {/snippet}
    {@render group(Timer, 'Timers', timers)}

    {#snippet behavior()}
      <div class="space-y-3">
        <div>
          <p class="mb-1 text-xs font-medium text-slate-500">Reveal answers</p>
          {@render segmented(revealTimingOptions, settings.revealAnswers, setRevealAnswers)}
        </div>
        <div>
          <p class="mb-1 text-xs font-medium text-slate-500">Reveal score</p>
          {@render segmented(revealTimingOptions, settings.revealScore, setRevealScore)}
        </div>
        <div>
          <p class="mb-1 text-xs font-medium text-slate-500">Reveal win</p>
          {@render segmented(revealWinOptions, settings.revealWin, (v) => set('revealWin', v))}
        </div>
        <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            class="h-4 w-4 accent-indigo-600"
            checked={settings.disableEditAfterReveal}
            onchange={(e) => set('disableEditAfterReveal', e.currentTarget.checked)}
          />
          Disable modifying revealed answers
        </label>
        <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            class="h-4 w-4 accent-indigo-600"
            checked={settings.disableBack}
            onchange={(e) => set('disableBack', e.currentTarget.checked)}
          />
          Disable back button
        </label>
        <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            class="h-4 w-4 accent-indigo-600"
            checked={settings.shuffleQuestions}
            onchange={(e) => set('shuffleQuestions', e.currentTarget.checked)}
          />
          Shuffle question order
        </label>
      </div>
    {/snippet}
    {@render group(Settings2, 'Behavior', behavior)}

    {#snippet appearance()}
      <div class="space-y-3">
        <div>
          <p class="mb-1 text-xs font-medium text-slate-500">Accent color</p>
          <input
            type="color"
            class="h-8 w-16 rounded-md border border-slate-300"
            value={settings.accentColor}
            oninput={(e) => set('accentColor', e.currentTarget.value)}
          />
        </div>
        <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            class="h-4 w-4 accent-indigo-600"
            checked={settings.showIntro}
            onchange={(e) => set('showIntro', e.currentTarget.checked)}
          />
          Show intro screen before Q1
        </label>
        <div>
          <p class="mb-1 text-xs font-medium text-slate-500">Win messages (one per line)</p>
          <textarea
            class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            rows="2"
            value={settings.winMessage.join('\n')}
            oninput={(e) => set('winMessage', toLines(e.currentTarget.value))}
          ></textarea>
        </div>
        <div>
          <p class="mb-1 text-xs font-medium text-slate-500">Lose messages (one per line)</p>
          <textarea
            class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            rows="2"
            value={settings.loseMessage.join('\n')}
            oninput={(e) => set('loseMessage', toLines(e.currentTarget.value))}
          ></textarea>
        </div>
      </div>
    {/snippet}
    {@render group(Palette, 'Appearance', appearance)}
  </div>
</details>
