<script lang="ts">
  import { Plus, LayoutList, Grid2x2, Grid3x3, Settings2, ChevronDown } from '@lucide/svelte';
  import type { ContentBlock } from '../../types';
  import ContentBlockEditor from '../../components/ContentBlockEditor.svelte';
  import OptionEditor from '../multiple/OptionEditor.svelte';
  import { blankExtra, type OptionDisplayMode, type PromptExtraKind } from '../multiple';
  import ExtraEditor from '../multiple/ExtraEditor.svelte';
  import { blankOption, type SingleData, type AnswerOption, type SingleFocusTarget } from './index';

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

  let showAddExtraMenu = $state(false);
  let promptRef: { focus: () => void } | undefined = $state();
  let optionRefs: Record<string, { focus: () => void }> = $state({});

  $effect(() => {
    const target = focusTarget as SingleFocusTarget | null | undefined;
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

  function updatePrompt(block: ContentBlock) {
    onChange({ ...data, prompt: block });
  }

  function updateOption(id: string, updated: AnswerOption) {
    onChange({ ...data, options: data.options.map((o) => (o.id === id ? updated : o)) });
  }

  function addOption() {
    if (data.options.length >= 25) return;
    onChange({ ...data, options: [...data.options, blankOption('text')] });
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
    <div class="border-t border-slate-100 px-3 py-3">
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
