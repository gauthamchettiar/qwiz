<script lang="ts">
  import type { QuestionTypeDefinition } from '../question-types/types';

  let {
    types,
    onSelect
  }: {
    types: QuestionTypeDefinition[];
    onSelect: (type: string) => void;
  } = $props();
</script>

<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
  {#each types as def (def.type)}
    <button
      type="button"
      class="flex items-start gap-2.5 rounded-md border border-slate-200 bg-white p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/30"
      onclick={() => onSelect(def.type)}
    >
      {#if def.icon}
        <def.icon size={18} class="mt-0.5 shrink-0 text-indigo-500" />
      {/if}
      <span>
        <span class="block text-sm font-semibold text-slate-800">{def.label}</span>
        <span class="mt-0.5 block text-xs text-slate-500">{def.description}</span>
      </span>
    </button>
  {/each}
</div>
