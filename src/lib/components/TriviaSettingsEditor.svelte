<script lang="ts">
  import { Settings, ChevronDown, Trophy, Timer, Settings2, Palette } from '@lucide/svelte';
  import HelpTooltip from './HelpTooltip.svelte';
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
          {@render label('Points to win', 'The score a player needs to reach to be marked as having won this trivia. Leave blank to skip win/lose tracking entirely.')}
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
        {@render boolSegmented(
          'Points display at top',
          "Shows a running 'earned / max so far' tally while answering, next to the question counter.",
          settings.showRunningScore,
          false,
          (v) => set('showRunningScore', v)
        )}
      </div>
    {/snippet}
    {@render group(Trophy, 'Scoring', scoring)}

    {#snippet timers()}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
    {@render group(Timer, 'Timers', timers)}

    {#snippet behavior()}
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
          "Once a question's answer has been revealed, whether the player can still go back and change their pick.",
          settings.disableEditAfterReveal,
          true,
          (v) => set('disableEditAfterReveal', v)
        )}
        {@render boolSegmented(
          'Back button',
          'Whether players can navigate to previous questions while answering.',
          settings.disableBack,
          true,
          (v) => set('disableBack', v)
        )}
        {@render boolSegmented(
          'Shuffle question order',
          'Randomizes the order questions appear in for each attempt.',
          settings.shuffleQuestions,
          false,
          (v) => set('shuffleQuestions', v)
        )}
      </div>
    {/snippet}
    {@render group(Settings2, 'Behavior', behavior)}

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
          <p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Interactive</p>
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
          <p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Feedback</p>
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
          <p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Base</p>
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

        {@render boolSegmented(
          'Intro screen before Q1',
          'Shows a cover screen with the description and a Start button before the first question, instead of jumping straight in.',
          settings.showIntro,
          false,
          (v) => set('showIntro', v)
        )}
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
    {@render group(Palette, 'Appearance', appearance)}
  </div>
</details>
