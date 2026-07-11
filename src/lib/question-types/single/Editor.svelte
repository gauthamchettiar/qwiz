<script lang="ts">
  import type { ContentBlock } from '../../types';
  import ContentBlockEditor from '../../components/ContentBlockEditor.svelte';
  import CheckboxRow from '../../components/CheckboxRow.svelte';
  import ExtrasEditor from '../ExtrasEditor.svelte';
  import OptionListEditor from '../OptionListEditor.svelte';
  import QuestionSettings from '../QuestionSettings.svelte';
  import type { OptionDisplayMode, PromptExtra } from '../multiple';
  import { type SingleData, type AnswerOption, type SingleFocusTarget } from './index';

  let {
    data,
    onChange,
    focusTarget,
    onFocusHandled
  }: {
    data: SingleData;
    onChange: (data: SingleData) => void;
    focusTarget?: unknown;
    onFocusHandled?: () => void;
  } = $props();

  let promptRef: { focus: () => void } | undefined = $state();
  let optionList: { focus: (id: string) => void } | undefined = $state();
  let extras: { focus: (id: string) => void } | undefined = $state();

  $effect(() => {
    const target = focusTarget as SingleFocusTarget | null | undefined;
    if (!target) return;
    if (target.field === 'prompt') promptRef?.focus();
    else if (target.field === 'option') optionList?.focus(target.optionId);
    else if (target.field === 'extra') extras?.focus(target.extraId);
    onFocusHandled?.();
  });
</script>

<div class="space-y-5">
  <div class="mb-2">
    <p class="mb-1 block text-xs font-medium text-slate-500">Question</p>
    <ContentBlockEditor bind:this={promptRef} value={data.prompt} onChange={(block: ContentBlock) => onChange({ ...data, prompt: block })} />
  </div>

  <ExtrasEditor bind:this={extras} extras={data.extras} onChange={(e: PromptExtra[]) => onChange({ ...data, extras: e })} />

  <QuestionSettings>
    <CheckboxRow
      checked={data.shuffleOptions ?? false}
      label="Shuffle option order each time this question is played"
      onChange={(v) => onChange({ ...data, shuffleOptions: v })}
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
    onChange={(options: AnswerOption[]) => onChange({ ...data, options })}
    onDisplayModeChange={(mode: OptionDisplayMode) => onChange({ ...data, displayMode: mode })}
  />
</div>
