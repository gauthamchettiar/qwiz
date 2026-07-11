<script lang="ts">
  import type { ContentBlock } from '../../types';
  import ContentBlockEditor from '../../components/ContentBlockEditor.svelte';
  import CheckboxRow from '../../components/CheckboxRow.svelte';
  import ExtrasEditor from '../ExtrasEditor.svelte';
  import OptionListEditor from '../OptionListEditor.svelte';
  import QuestionSettings from '../QuestionSettings.svelte';
  import {
    type MultipleData,
    type AnswerOption,
    type OptionDisplayMode,
    type PromptExtra,
    type MultipleFocusTarget
  } from './index';

  let {
    data,
    onChange,
    focusTarget,
    onFocusHandled
  }: {
    data: MultipleData;
    onChange: (data: MultipleData) => void;
    focusTarget?: unknown;
    onFocusHandled?: () => void;
  } = $props();

  let promptRef: { focus: () => void } | undefined = $state();
  let optionList: { focus: (id: string) => void } | undefined = $state();
  let extras: { focus: (id: string) => void } | undefined = $state();

  $effect(() => {
    const target = focusTarget as MultipleFocusTarget | null | undefined;
    if (!target) return;
    if (target.field === 'prompt') promptRef?.focus();
    else if (target.field === 'option') optionList?.focus(target.optionId);
    else if (target.field === 'extra') extras?.focus(target.extraId);
    onFocusHandled?.();
  });

  // Keeps min/max always valid for the current option count, so an invalid state can't be
  // reached through normal use: 1 <= max <= optionCount, 0 <= min <= max.
  function clampMinMax(min: number, max: number, optionCount: number): { min: number; max: number } {
    const clampedMax = Math.max(1, Math.min(max, optionCount));
    const clampedMin = Math.max(0, Math.min(min, clampedMax));
    return { min: clampedMin, max: clampedMax };
  }

  function setOptions(options: AnswerOption[]) {
    const { min, max } = clampMinMax(data.min, data.max, options.length);
    onChange({ ...data, options, min, max });
  }

  function setMin(raw: string) {
    const { min, max } = clampMinMax(Number(raw) || 0, data.max, data.options.length);
    onChange({ ...data, min, max });
  }

  function setMax(raw: string) {
    const { min, max } = clampMinMax(data.min, Number(raw) || 1, data.options.length);
    onChange({ ...data, min, max });
  }
</script>

<div class="space-y-5">
  <div class="mb-2">
    <p class="mb-1 block text-xs font-medium text-slate-500">Question</p>
    <ContentBlockEditor bind:this={promptRef} value={data.prompt} onChange={(block: ContentBlock) => onChange({ ...data, prompt: block })} />
  </div>

  <ExtrasEditor bind:this={extras} extras={data.extras} onChange={(e: PromptExtra[]) => onChange({ ...data, extras: e })} />

  <QuestionSettings>
    <div class="flex flex-wrap items-center gap-4">
      <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
        Min selections
        <input
          type="number"
          min="0"
          class="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={data.min}
          oninput={(e) => setMin(e.currentTarget.value)}
        />
      </label>
      <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
        Max selections
        <input
          type="number"
          min="1"
          class="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={data.max}
          oninput={(e) => setMax(e.currentTarget.value)}
        />
      </label>
    </div>
    <p class="text-xs text-slate-400">
      Min 0 lets players skip; max can't exceed the option count ({data.options.length}).
    </p>
    <CheckboxRow
      checked={data.shuffleOptions ?? false}
      label="Shuffle option order each time this question is played"
      onChange={(v) => onChange({ ...data, shuffleOptions: v })}
    />
    <CheckboxRow
      checked={data.allOrNone ?? false}
      label="All or none — full points only if every correct option is chosen and nothing else; otherwise 0"
      onChange={(v) => onChange({ ...data, allOrNone: v })}
    />
    <CheckboxRow
      checked={data.ungraded ?? false}
      label="Do not grade this question — answered but not scored; a practice/trial question only"
      onChange={(v) => onChange({ ...data, ungraded: v })}
    />
  </QuestionSettings>

  <OptionListEditor
    bind:this={optionList}
    options={data.options}
    displayMode={data.displayMode ?? 'list'}
    onChange={setOptions}
    onDisplayModeChange={(mode: OptionDisplayMode) => onChange({ ...data, displayMode: mode })}
  />
</div>
