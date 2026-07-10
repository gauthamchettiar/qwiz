<script lang="ts">
  import { CircleDot, Target, ListChecks, SlidersHorizontal, Plus, LayoutList, Grid2x2, Grid3x3, LayoutGrid } from '@lucide/svelte';
  import type { ContentBlock } from '../../types';
  import ContentBlockEditor from '../../components/ContentBlockEditor.svelte';
  import { genId } from '../shared';
  import OptionEditor from './OptionEditor.svelte';
  import ExtraEditor from './ExtraEditor.svelte';
  import {
    blankOption,
    blankExtra,
    type ChoiceData,
    type ChoiceVariant,
    type ChoiceOption,
    type OptionKind,
    type OptionDisplayMode,
    type PromptExtraKind,
    type ChoiceFocusTarget
  } from './index';

  let {
    data,
    onChange,
    focusTarget,
    onFocusHandled
  }: {
    data: ChoiceData;
    onChange: (data: ChoiceData) => void;
    focusTarget?: unknown;
    onFocusHandled?: () => void;
  } = $props();

  const radioGroupName = genId();
  let showAddExtraMenu = $state(false);
  let showAddOptionMenu = $state(false);

  let promptRef: { focus: () => void } | undefined = $state();
  let optionRefs: Record<string, { focus: () => void }> = $state({});

  $effect(() => {
    const target = focusTarget as ChoiceFocusTarget | null | undefined;
    if (!target) return;
    if (target.field === 'prompt') promptRef?.focus();
    else if (target.field === 'option') optionRefs[target.optionId]?.focus();
    onFocusHandled?.();
  });

  const variants: { variant: ChoiceVariant; label: string; icon: typeof CircleDot; description: string }[] = [
    {
      variant: 'single-one',
      label: 'Single (One)',
      icon: CircleDot,
      description: 'One correct answer. Player picks one. Points are awarded per question.'
    },
    {
      variant: 'single-graded',
      label: 'Single (Graded)',
      icon: Target,
      description: 'Player picks one answer. Each answer carries its own point value.'
    },
    {
      variant: 'multiple-many',
      label: 'Multiple (Many)',
      icon: ListChecks,
      description: 'Player must pick every correct answer. Points are awarded per question.'
    },
    {
      variant: 'multiple-graded',
      label: 'Multiple (Graded)',
      icon: SlidersHorizontal,
      description: 'Player picks any number of answers. Each answer carries its own point value.'
    }
  ];

  const optionKindMenu: { kind: OptionKind; label: string }[] = [
    { kind: 'text', label: 'Text' },
    { kind: 'input', label: 'Input' },
    { kind: 'reveal', label: 'Reveal' },
    { kind: 'image', label: 'Image' },
    { kind: 'video', label: 'Video' }
  ];

  const extraKindMenu: { kind: PromptExtraKind; label: string }[] = [
    { kind: 'text', label: 'Text' },
    { kind: 'reveal', label: 'Reveal' },
    { kind: 'image', label: 'Image' },
    { kind: 'video', label: 'Video' }
  ];

  const displayModes: { mode: OptionDisplayMode; label: string; icon: typeof LayoutList }[] = [
    { mode: 'list', label: 'List', icon: LayoutList },
    { mode: 'grid-2', label: 'Grid x2', icon: Grid2x2 },
    { mode: 'grid-3', label: 'Grid x3', icon: Grid3x3 },
    { mode: 'grid-4', label: 'Grid x4', icon: LayoutGrid }
  ];

  const activeVariant = $derived(variants.find((v) => v.variant === data.variant)!);
  const isMultipleVariant = $derived(data.variant === 'multiple-many' || data.variant === 'multiple-graded');
  const inputOptionCount = $derived(data.options.filter((o) => o.kind === 'input').length);
  const canLinkInputs = $derived(isMultipleVariant && inputOptionCount >= 2);

  function setVariant(variant: ChoiceVariant) {
    onChange({ ...data, variant });
  }

  function updatePrompt(block: ContentBlock) {
    onChange({ ...data, prompt: block });
  }

  function updateOption(id: string, updated: ChoiceOption) {
    onChange({ ...data, options: data.options.map((o) => (o.id === id ? updated : o)) });
  }

  function setCorrectOption(id: string) {
    onChange({ ...data, options: data.options.map((o) => ({ ...o, correct: o.id === id })) });
  }

  function addOption(kind: OptionKind) {
    if (data.options.length >= 25) return;
    onChange({ ...data, options: [...data.options, blankOption(kind)] });
    showAddOptionMenu = false;
  }

  function removeOption(id: string) {
    if (data.options.length <= 2) return;
    onChange({ ...data, options: data.options.filter((o) => o.id !== id) });
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
  <div>
    <div class="inline-flex flex-wrap rounded-md border border-slate-300 bg-white text-xs">
      {#each variants as v, i (v.variant)}
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 font-medium {data.variant === v.variant
            ? 'bg-indigo-600 text-white'
            : 'text-slate-600 hover:bg-slate-100'} {i === 0 ? 'rounded-l-md' : ''} {i === variants.length - 1
            ? 'rounded-r-md'
            : ''}"
          onclick={() => setVariant(v.variant)}
        >
          <v.icon size={14} />
          {v.label}
        </button>
      {/each}
    </div>
    <p class="mt-1 text-xs text-slate-400">{activeVariant.description}</p>
  </div>

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

  {#if data.variant === 'single-one' || data.variant === 'multiple-many'}
    <label class="flex items-center gap-2 text-xs font-medium text-slate-500">
      Question points
      <input
        type="number"
        class="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
        value={data.questionPoints}
        oninput={(e) => onChange({ ...data, questionPoints: Number(e.currentTarget.value) || 0 })}
      />
    </label>
  {/if}

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

    <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
      <input
        type="checkbox"
        class="h-4 w-4 accent-indigo-600"
        checked={data.shuffleOptions ?? false}
        onchange={(e) => onChange({ ...data, shuffleOptions: e.currentTarget.checked })}
      />
      Shuffle option order each time this question is played
    </label>

    {#if canLinkInputs}
      <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          class="h-4 w-4 accent-indigo-600"
          checked={data.linkedInputs ?? false}
          onchange={(e) => onChange({ ...data, linkedInputs: e.currentTarget.checked })}
        />
        Link input options — answers can go in any linked box, but not repeated from the same box's list
      </label>
    {/if}

    {#each data.options as option (option.id)}
      <OptionEditor
        bind:this={optionRefs[option.id]}
        {option}
        variant={data.variant}
        {radioGroupName}
        canRemove={data.options.length > 2}
        linked={(data.linkedInputs ?? false) && canLinkInputs && option.kind === 'input'}
        onChange={(o) => updateOption(option.id, o)}
        onRemove={() => removeOption(option.id)}
        onSetCorrect={() => setCorrectOption(option.id)}
      />
    {/each}

    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-slate-300"
        disabled={data.options.length >= 25}
        onclick={() => (showAddOptionMenu = !showAddOptionMenu)}
      >
        <Plus size={14} /> Add option
      </button>
      {#if showAddOptionMenu}
        <div class="absolute z-10 mt-1 w-40 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
          {#each optionKindMenu as k (k.kind)}
            <button
              type="button"
              class="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
              onclick={() => addOption(k.kind)}
            >
              {k.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
