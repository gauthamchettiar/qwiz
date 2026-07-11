<script lang="ts">
  import { Settings, ChevronDown, Trophy, Timer, Settings2, Palette, Eye, RotateCcw } from '@lucide/svelte';
  import HelpTooltip from './HelpTooltip.svelte';
  import {
    defaultTriviaSettings,
    FONT_STACKS,
    type FontChoice,
    type RevealTiming,
    type RevealWinTiming,
    type TriviaSettings
  } from '../types';

  let {
    settings,
    totalMaxPoints,
    questionCount,
    invalid = false,
    onChange
  }: {
    settings: TriviaSettings;
    totalMaxPoints: number;
    questionCount: number;
    invalid?: boolean;
    onChange: (settings: TriviaSettings) => void;
  } = $props();

  const pointsToWinComputed = $derived(
    settings.pointsToWinPercent !== null ? Math.round((settings.pointsToWinPercent / 100) * totalMaxPoints) : null
  );

  const fontChoices: { value: FontChoice; label: string }[] = [
    { value: 'sans', label: 'Sans' },
    { value: 'serif', label: 'Serif' },
    { value: 'mono', label: 'Mono' },
    { value: 'rounded', label: 'Rounded' }
  ];

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

  // Score can only reveal after every question if answers do too (seeing a score with no
  // answer to explain it is confusing). Switching either reveal timing to "after every
  // question" also nudges on the answer-lock setting, since revising an answer after seeing
  // the result defeats the point.
  function setRevealAnswers(value: RevealTiming) {
    const revealScore = value !== 'after-question' && settings.revealScore === 'after-question' ? 'end' : settings.revealScore;
    onChange({
      ...settings,
      revealAnswers: value,
      revealScore,
      disableEditAfterReveal: value === 'after-question' || revealScore === 'after-question' ? true : settings.disableEditAfterReveal
    });
  }

  function setRevealScore(value: RevealTiming) {
    const revealAnswers = value === 'after-question' ? 'after-question' : settings.revealAnswers;
    onChange({
      ...settings,
      revealScore: value,
      revealAnswers,
      disableEditAfterReveal: value === 'after-question' || revealAnswers === 'after-question' ? true : settings.disableEditAfterReveal
    });
  }

  // Modifying an answer after its reveal only makes sense if the player can navigate back to
  // it, so the two stay linked: disabling Back forces Modify off, and enabling Modify forces
  // Back on.
  function setDisableBack(value: boolean) {
    onChange({
      ...settings,
      disableBack: value,
      disableEditAfterReveal: value ? true : settings.disableEditAfterReveal
    });
  }

  function setDisableEditAfterReveal(value: boolean) {
    onChange({
      ...settings,
      disableEditAfterReveal: value,
      disableBack: value ? settings.disableBack : false
    });
  }

  function toOptionalNumber(raw: string): number | null {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function toOptionalPercent(raw: string): number | null {
    const n = toOptionalNumber(raw);
    return n === null ? null : Math.min(100, Math.max(0, n));
  }

  function toOptionalPositiveInt(raw: string): number | null {
    const n = toOptionalNumber(raw);
    return n === null ? null : Math.max(1, Math.round(n));
  }

  function toLines(raw: string): string[] {
    return raw.split('\n');
  }

  // Resets just the visual/theme fields — colors — back to their shipped defaults. Win/lose
  // messages are content, not "look", so they're left alone.
  function resetAppearance() {
    const d = defaultTriviaSettings();
    onChange({
      ...settings,
      primaryColor: d.primaryColor,
      secondaryColor: d.secondaryColor,
      accentColor: d.accentColor,
      correctColor: d.correctColor,
      wrongColor: d.wrongColor,
      partialColor: d.partialColor,
      neutralColor: d.neutralColor,
      textColor: d.textColor,
      bgColor: d.bgColor,
      fontFamily: d.fontFamily
    });
  }
</script>

{#snippet label(text: string, help: string)}
  <p class="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
    {text}
    <HelpTooltip text={help} />
  </p>
{/snippet}

{#snippet segmented(options: { value: string; label: string }[], current: string, onSelect: (v: any) => void)}
  <div class="inline-flex flex-wrap rounded-md border border-slate-300 bg-white text-xs">
    {#each options as opt, i (opt.value)}
      <button
        type="button"
        class="px-2.5 py-1.5 font-medium {current === opt.value
          ? 'bg-slate-900 text-white'
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

{#snippet boolSegmented(
  labelText: string,
  help: string,
  value: boolean,
  disableIsTrue: boolean,
  onSelect: (v: boolean) => void
)}
  <div>
    {@render label(labelText, help)}
    {@render segmented(
      [
        { value: 'disable', label: 'Disable' },
        { value: 'enable', label: 'Enable' }
      ],
      value === disableIsTrue ? 'disable' : 'enable',
      (v: string) => onSelect(v === 'disable' ? disableIsTrue : !disableIsTrue)
    )}
  </div>
{/snippet}

{#snippet colorField(labelText: string, value: string, help: string, onSet: (v: string) => void, preview: any)}
  <div>
    <p class="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
      {labelText}
      <HelpTooltip text={help} {preview} />
    </p>
    <input
      type="color"
      class="h-8 w-16 rounded-md border border-slate-300"
      {value}
      oninput={(e) => onSet(e.currentTarget.value)}
    />
  </div>
{/snippet}

{#snippet group(Icon: typeof Trophy, label: string, children: () => any, action?: () => any)}
  <div class="space-y-3 rounded-lg border border-slate-200 p-3">
    <div class="flex items-center justify-between gap-2">
      <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon size={13} />
        {label}
      </p>
      {#if action}{@render action()}{/if}
    </div>
    {@render children()}
  </div>
{/snippet}

<details class="group {invalid ? 'rounded-lg border border-red-300 ring-2 ring-red-100 p-2 -m-2' : ''}" open={invalid}>
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
          {@render label('Points to win (%)', 'The percentage of the played total a player needs to reach to be marked as having won this trivia. Leave blank to skip win/lose tracking entirely.')}
          <div class="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="100"
              class="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
              placeholder="None"
              value={settings.pointsToWinPercent ?? ''}
              oninput={(e) => set('pointsToWinPercent', toOptionalPercent(e.currentTarget.value))}
            />
            <span class="text-sm text-slate-400">%</span>
            {#if pointsToWinComputed !== null}
              <span class="text-sm text-slate-400">({pointsToWinComputed} / {totalMaxPoints} pts)</span>
            {/if}
          </div>
        </div>
        {@render boolSegmented(
          'Points display at top',
          "Shows a running 'earned / max so far' tally while answering, next to the question counter.",
          settings.showRunningScore,
          false,
          (v) => set('showRunningScore', v)
        )}
        <div>
          {@render label('Lives', 'Number of wrong answers allowed before the player automatically fails, regardless of points earned. Leave blank for unlimited.')}
          <div class="flex items-center gap-2">
            <input
              type="number"
              min="1"
              class="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
              placeholder="Unlimited"
              value={settings.maxWrongAnswers ?? ''}
              oninput={(e) => set('maxWrongAnswers', toOptionalPositiveInt(e.currentTarget.value))}
            />
            <span class="text-sm text-slate-400">wrong answers</span>
          </div>
        </div>
      </div>
    {/snippet}
    {#snippet timers()}
      <div class="space-y-3">
        <div>
          {@render label('Per-question limit (seconds)', 'Seconds allowed per question before it auto-submits and moves on. Leave blank for no limit.')}
          <input
            type="number"
            class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="No limit"
            value={settings.perQuestionTimeLimit ?? ''}
            oninput={(e) => set('perQuestionTimeLimit', toOptionalNumber(e.currentTarget.value))}
          />
        </div>
        <div>
          {@render label('Overall limit (seconds)', 'Total seconds allowed for the whole trivia before it jumps straight to results. Leave blank for no limit.')}
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

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {@render group(Trophy, 'Scoring', scoring)}
      {@render group(Timer, 'Timing', timers)}
    </div>

    {#snippet reveal()}
      <div class="space-y-3">
        <div>
          {@render label('Reveal answers', 'When the correct answer (and how each option scored) is shown to the player: after every question, only once at the end, or never.')}
          {@render segmented(revealTimingOptions, settings.revealAnswers, setRevealAnswers)}
        </div>
        <div>
          {@render label('Reveal score', 'When point totals are shown to the player: after every question, only once at the end, or never.')}
          {@render segmented(revealTimingOptions, settings.revealScore, setRevealScore)}
        </div>
        <div>
          {@render label('Reveal win', 'When the win/lose message is shown: once at the end, or never shown at all.')}
          {@render segmented(revealWinOptions, settings.revealWin, (v) => set('revealWin', v))}
        </div>
        {@render boolSegmented(
          'Modify after answer reveal',
          "Once a question's answer has been revealed, whether the player can still go back and change their pick. Requires the Back button to be enabled.",
          settings.disableEditAfterReveal,
          true,
          setDisableEditAfterReveal
        )}
      </div>
    {/snippet}

    {#snippet behavior()}
      <div class="space-y-3">
        {@render boolSegmented(
          'Back button',
          "Whether players can navigate to previous questions while answering. Disabling it also disables Modify after answer reveal, since that relies on being able to go back.",
          settings.disableBack,
          true,
          setDisableBack
        )}
        {@render boolSegmented(
          'Shuffle question order',
          'Randomizes the order questions appear in for each attempt.',
          settings.shuffleQuestions,
          false,
          (v) => set('shuffleQuestions', v)
        )}
        <div>
          {@render label('Max questions', 'When shuffling, ask this many random questions from the pool instead of all of them. Leave blank to use every question. Only applies while Shuffle question order is enabled.')}
          <input
            type="number"
            min="1"
            class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            placeholder={`All questions (${questionCount})`}
            disabled={!settings.shuffleQuestions}
            value={settings.maxQuestions ?? ''}
            oninput={(e) => set('maxQuestions', toOptionalNumber(e.currentTarget.value))}
          />
        </div>
        {@render boolSegmented(
          'Intro screen before Q1',
          'Shows a cover screen with the description and a Start button before the first question, instead of jumping straight in.',
          settings.showIntro,
          false,
          (v) => set('showIntro', v)
        )}
      </div>
    {/snippet}

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {@render group(Eye, 'Reveal', reveal)}
      {@render group(Settings2, 'Behavior', behavior)}
    </div>

    {#snippet primaryPreview()}
      <button
        type="button"
        class="rounded-md px-3 py-1 text-xs font-medium text-white"
        style={`background:${settings.primaryColor}`}>Start</button
      >
    {/snippet}
    {#snippet secondaryPreview()}
      <span
        class="inline-block rounded-md border px-3 py-1 text-xs font-medium"
        style={`border-color:${settings.secondaryColor}; color:${settings.secondaryColor}`}>Back</span
      >
    {/snippet}
    {#snippet accentPreview()}
      <span
        class="inline-block rounded-md px-3 py-1 text-xs font-medium text-white"
        style={`background:${settings.accentColor}`}>Selected</span
      >
    {/snippet}
    {#snippet correctPreview()}
      <span
        class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
        style={`border-color:${settings.correctColor}; background:${settings.correctColor}1a; color:${settings.correctColor}`}
        >✓ Correct</span
      >
    {/snippet}
    {#snippet wrongPreview()}
      <span
        class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
        style={`border-color:${settings.wrongColor}; background:${settings.wrongColor}1a; color:${settings.wrongColor}`}
        >✕ Wrong</span
      >
    {/snippet}
    {#snippet partialPreview()}
      <span
        class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
        style={`border-color:${settings.partialColor}; background:${settings.partialColor}1a; color:${settings.partialColor}`}
        >½ Partial</span
      >
    {/snippet}
    {#snippet neutralPreview()}
      <span
        class="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
        style={`border-color:${settings.neutralColor}; color:${settings.neutralColor}`}>Not scored</span
      >
    {/snippet}
    {#snippet textPreview()}
      <span class="text-sm font-medium" style={`color:${settings.textColor}`}>Sample question text</span>
    {/snippet}
    {#snippet bgPreview()}
      <span
        class="inline-block rounded-md border border-slate-200 px-3 py-1 text-xs"
        style={`background:${settings.bgColor}`}>Card background</span
      >
    {/snippet}

    {#snippet appearance()}
      <div class="space-y-4">
        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Interactive</p>
          <div class="flex flex-wrap gap-4">
            {@render colorField(
              'Primary',
              settings.primaryColor,
              'Main action buttons throughout the player: Start, Next, Finish, Continue, Play again.',
              (v) => set('primaryColor', v),
              primaryPreview
            )}
            {@render colorField(
              'Secondary',
              settings.secondaryColor,
              'The Back button and other secondary, less prominent actions.',
              (v) => set('secondaryColor', v),
              secondaryPreview
            )}
            {@render colorField(
              'Accent',
              settings.accentColor,
              'Highlight color for the currently selected option, the running score, and reveal buttons.',
              (v) => set('accentColor', v),
              accentPreview
            )}
          </div>
        </div>
        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Feedback</p>
          <div class="flex flex-wrap gap-4">
            {@render colorField(
              'Correct',
              settings.correctColor,
              'Used wherever a correct answer or full-credit pick is indicated.',
              (v) => set('correctColor', v),
              correctPreview
            )}
            {@render colorField(
              'Wrong',
              settings.wrongColor,
              'Used wherever an incorrect answer or zero-credit pick is indicated.',
              (v) => set('wrongColor', v),
              wrongPreview
            )}
            {@render colorField(
              'Partial',
              settings.partialColor,
              'Used for partial-credit results — some points earned, but not the maximum.',
              (v) => set('partialColor', v),
              partialPreview
            )}
            {@render colorField(
              'Neutral',
              settings.neutralColor,
              "Used for unscored content, like revealed fun facts that don't award points.",
              (v) => set('neutralColor', v),
              neutralPreview
            )}
          </div>
        </div>
        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Base</p>
          <div class="flex flex-wrap gap-4">
            {@render colorField(
              'Text',
              settings.textColor,
              'Base text color for question and answer content.',
              (v) => set('textColor', v),
              textPreview
            )}
            {@render colorField(
              'Background',
              settings.bgColor,
              'Background color of the question, intro, and results cards.',
              (v) => set('bgColor', v),
              bgPreview
            )}
          </div>
        </div>

        <div>
          {@render label('Font', 'Typeface used throughout the player — question text, answers, and everything else.')}
          <div class="inline-flex overflow-hidden rounded-md border border-slate-300">
            {#each fontChoices as f, i (f.value)}
              <button
                type="button"
                class="px-3 py-1.5 text-sm {(settings.fontFamily ?? 'sans') === f.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100'} {i > 0 ? 'border-l border-slate-300' : ''}"
                style={`font-family:${FONT_STACKS[f.value]}`}
                onclick={() => set('fontFamily', f.value)}
              >
                {f.label}
              </button>
            {/each}
          </div>
        </div>

        <div>
          {@render label('Win messages (one per line)', 'One or more messages shown when the player wins (meets Points to win). A random one is picked each time.')}
          <textarea
            class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            rows="2"
            value={settings.winMessage.join('\n')}
            oninput={(e) => set('winMessage', toLines(e.currentTarget.value))}
          ></textarea>
        </div>
        <div>
          {@render label('Lose messages (one per line)', "One or more messages shown when the player doesn't win. A random one is picked each time.")}
          <textarea
            class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            rows="2"
            value={settings.loseMessage.join('\n')}
            oninput={(e) => set('loseMessage', toLines(e.currentTarget.value))}
          ></textarea>
        </div>
      </div>
    {/snippet}
    {#snippet resetAppearanceAction()}
      <button
        type="button"
        class="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
        onclick={resetAppearance}
      >
        <RotateCcw size={12} /> Reset to default
      </button>
    {/snippet}
    {@render group(Palette, 'Appearance', appearance, resetAppearanceAction)}
  </div>
</details>
