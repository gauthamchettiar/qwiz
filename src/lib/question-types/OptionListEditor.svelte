<script lang="ts">
  import { Plus, LayoutList, Grid2x2, Grid3x3 } from '@lucide/svelte';
  import { updateInList, removeFromList, moveInList } from '../listOps';
  import OptionEditor from './multiple/OptionEditor.svelte';
  import { blankOption, type AnswerOption, type OptionDisplayMode } from './multiple';

  // Shared answer-option list used by both question editors: the display-mode toggle, the
  // options themselves (with per-option reorder/remove), the add button, and per-option focus.
  // add/remove just emit the new options array via `onChange`; the parent applies any side
  // effects (e.g. Multiple re-clamping its min/max to the new count).
  let {
    options,
    displayMode,
    onChange,
    onDisplayModeChange
  }: {
    options: AnswerOption[];
    displayMode: OptionDisplayMode;
    onChange: (options: AnswerOption[]) => void;
    onDisplayModeChange: (mode: OptionDisplayMode) => void;
  } = $props();

  const MAX = 25;
  const MIN = 2;

  let refs: Record<string, { focus: () => void }> = $state({});
  export function focus(id: string) {
    refs[id]?.focus();
  }

  const displayModes: { mode: OptionDisplayMode; label: string; icon: typeof LayoutList }[] = [
    { mode: 'list', label: 'List', icon: LayoutList },
    { mode: 'grid-2', label: 'Grid x2', icon: Grid2x2 },
    { mode: 'grid-3', label: 'Grid x3', icon: Grid3x3 }
  ];

  function add() {
    if (options.length >= MAX) return;
    onChange([...options, blankOption('text')]);
  }
</script>

<div class="space-y-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-xs font-medium text-slate-500">Options ({options.length})</p>
    <div class="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs">
      {#each displayModes as dm (dm.mode)}
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-1 font-medium {(displayMode ?? 'list') === dm.mode
            ? 'bg-slate-900 text-white'
            : 'bg-white text-slate-600 hover:bg-slate-100'}"
          onclick={() => onDisplayModeChange(dm.mode)}
          aria-label={dm.label}
          title={dm.label}
        >
          <dm.icon size={13} />
        </button>
      {/each}
    </div>
  </div>

  {#each options as option, i (option.id)}
    <OptionEditor
      bind:this={refs[option.id]}
      {option}
      index={i}
      total={options.length}
      canRemove={options.length > MIN}
      onChange={(o) => onChange(updateInList(options, option.id, o))}
      onRemove={() => options.length > MIN && onChange(removeFromList(options, option.id))}
      onMoveUp={() => onChange(moveInList(options, option.id, -1))}
      onMoveDown={() => onChange(moveInList(options, option.id, 1))}
    />
  {/each}

  <button
    type="button"
    class="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
    disabled={options.length >= MAX}
    onclick={add}
  >
    <Plus size={14} /> Add option
  </button>
</div>
