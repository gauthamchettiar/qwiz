<script lang="ts">
  import { Plus, LayoutList, Grid2x2, Grid3x3, Settings2, ChevronDown } from '@lucide/svelte';
  import type { ContentBlock } from '../../types';
  import ContentBlockEditor from '../../components/ContentBlockEditor.svelte';
  import OptionEditor from './OptionEditor.svelte';
  import ExtraEditor from './ExtraEditor.svelte';
  import {
    blankOption,
    blankExtra,
    type MultipleData,
    type AnswerOption,
    type OptionKind,
    type OptionDisplayMode,
    type PromptExtraKind,
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

  let showAddExtraMenu = $state(false);

  let promptRef: { focus: () => void } | undefined = $state();
  let optionRefs: Record<string, { focus: () => void }> = $state({});

  $effect(() => {
    const target = focusTarget as MultipleFocusTarget | null | undefined;
    if (!target) return;
    if (target.field === 'prompt') promptRef?.focus();
    else if (target.field === 'option') optionRefs[target.optionId]?.focus();
    onFocusHandled?.();
  });

  const extraKindMenu: { kind: PromptExtraKind; label: string }[] = [
    { kind: 'text', label: 'Text' },
    { kind: 'image', label: 'Image' },
    { kind: 'video', label: 'Video' },
    { kind: 'reveal', label: 'Reveal' }
  ];

  const displayModes: { mode: OptionDisplayMode; label: string; icon: typeof LayoutList }[] = [
    { mode: 'list', label: 'List', icon: LayoutList },
    { mode: 'grid-2', label: 'Grid x2', icon: Grid2x2 },
    { mode: 'grid-3', label: 'Grid x3', icon: Grid3x3 }
  ];

  // Keeps min/max always valid for the current option count, so an invalid state can't be
  // reached through normal use: 1 <= max <= optionCount, 0 <= min <= max.
  function clampMinMax(min: number, max: number, optionCount: number): { min: number; max: number } {
    const clampedMax = Math.max(1, Math.min(max, optionCount));
    const clampedMin = Math.max(0, Math.min(min, clampedMax));
    return { min: clampedMin, max: clampedMax };
  }

  function updatePrompt(block: ContentBlock) {
    onChange({ ...data, prompt: block });
  }

  function updateOption(id: string, updated: AnswerOption) {
    onChange({ ...data, options: data.options.map((o) => (o.id === id ? updated : o)) });
  }

  function addOption() {
    if (data.options.length >= 25) return;
    const options = [...data.options, blankOption('text')];
    const { min, max } = clampMinMax(data.min, data.max, options.length);
    onChange({ ...data, options, min, max });
  }

  function removeOption(id: string) {
    if (data.options.length <= 2) return;
    const options = data.options.filter((o) => o.id !== id);
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

  function addExtra(kind: PromptExtraKind) {
    onChange({ ...data, extras: [...data.extras, blankExtra(kind)] });
    showAddExtraMenu = false;
  }

  function updateExtra(id: string, updated: (typeof data.extras)[number]) {
    onChange({ ...data, extras: data.extras.map((e) => (e.id === id ? updated : e)) });
  }

  function removeExtra(id: string) {
    onChange({ ...data, extras: data.extras.filter((e) => e.id !== id) });
  }
</script>

<div class="space-y-5">
  <div class="mb-2">
    <p class="mb-1 block text-xs font-medium text-slate-500">Question</p>
    <ContentBlockEditor bind:this={promptRef} value={data.prompt} onChange={updatePrompt} />
  </div>

  <div class="space-y-2">
    {#each data.extras as extra (extra.id)}
      <ExtraEditor {extra} onChange={(e) => updateExtra(extra.id, e)} onRemove={() => removeExtra(extra.id)} />
    {/each}
    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
        onclick={() => (showAddExtraMenu = !showAddExtraMenu)}
      >
        <Plus size={13} /> Add extra content
      </button>
      {#if showAddExtraMenu}
        <div class="absolute z-10 mt-1 w-40 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
          {#each extraKindMenu as k (k.kind)}
            <button
              type="button"
              class="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
              onclick={() => addExtra(k.kind)}
            >
              {k.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <details class="group rounded-md border border-dashed border-slate-300">
    <summary
      class="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
    >
      <Settings2 size={13} />
      Question settings
      <ChevronDown size={13} class="ml-auto text-slate-400 transition-transform group-open:rotate-180" />
    </summary>
    <div class="space-y-3 border-t border-slate-100 px-3 py-3">
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
      <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          class="h-4 w-4 accent-indigo-600"
          checked={data.shuffleOptions ?? false}
          onchange={(e) => onChange({ ...data, shuffleOptions: e.currentTarget.checked })}
        />
        Shuffle option order each time this question is played
      </label>
    </div>
  </details>

  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-medium text-slate-500">
        Options ({data.options.length})
      </p>
      <div class="inline-flex rounded-md border border-slate-300 bg-white text-xs">
        {#each displayModes as dm, i (dm.mode)}
          <button
            type="button"
            class="flex items-center gap-1 px-2 py-1 font-medium {(data.displayMode ?? 'list') === dm.mode
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'} {i === 0 ? 'rounded-l-md' : ''} {i === displayModes.length - 1
              ? 'rounded-r-md'
              : ''}"
            onclick={() => onChange({ ...data, displayMode: dm.mode })}
            aria-label={dm.label}
            title={dm.label}
          >
            <dm.icon size={13} />
          </button>
        {/each}
      </div>
    </div>

    {#each data.options as option (option.id)}
      <OptionEditor
        bind:this={optionRefs[option.id]}
        {option}
        canRemove={data.options.length > 2}
        onChange={(o) => updateOption(option.id, o)}
        onRemove={() => removeOption(option.id)}
      />
    {/each}

    <button
      type="button"
      class="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-slate-300"
      disabled={data.options.length >= 25}
      onclick={addOption}
    >
      <Plus size={14} /> Add option
    </button>
  </div>
</div>
