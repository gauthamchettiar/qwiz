<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import { clickOutside } from '../clickOutside';
  import { updateInList, removeFromList } from '../listOps';
  import ExtraEditor from './multiple/ExtraEditor.svelte';
  import { blankExtra, type PromptExtra, type PromptExtraKind } from './multiple';

  // Shared extras (text / image / video / reveal) editor used by both the single and multiple
  // question editors — the list, the add menu, and per-extra focus all live here so neither
  // Editor has to reimplement them.
  let { extras, onChange }: { extras: PromptExtra[]; onChange: (extras: PromptExtra[]) => void } = $props();

  let showAddMenu = $state(false);
  let refs: Record<string, { focus: () => void }> = $state({});

  export function focus(id: string) {
    refs[id]?.focus();
  }

  const kindMenu: { kind: PromptExtraKind; label: string }[] = [
    { kind: 'text', label: 'Text' },
    { kind: 'image', label: 'Image' },
    { kind: 'video', label: 'Video' },
    { kind: 'reveal', label: 'Reveal' }
  ];

  function add(kind: PromptExtraKind) {
    onChange([...extras, blankExtra(kind)]);
    showAddMenu = false;
  }
</script>

<div class="space-y-2">
  {#each extras as extra (extra.id)}
    <ExtraEditor
      bind:this={refs[extra.id]}
      {extra}
      onChange={(e) => onChange(updateInList(extras, extra.id, e))}
      onRemove={() => onChange(removeFromList(extras, extra.id))}
    />
  {/each}
  <div class="relative" use:clickOutside={() => (showAddMenu = false)}>
    <button
      type="button"
      class="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      onclick={() => (showAddMenu = !showAddMenu)}
    >
      <Plus size={13} /> Add extra content
    </button>
    {#if showAddMenu}
      <div class="absolute z-10 mt-1 w-40 rounded-md border border-slate-200 bg-white p-1 shadow-md">
        {#each kindMenu as k (k.kind)}
          <button
            type="button"
            class="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
            onclick={() => add(k.kind)}
          >
            {k.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
