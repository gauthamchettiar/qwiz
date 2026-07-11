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
      class="group flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      onclick={() => onSelect(def.type)}
    >
      {#if def.icon}
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 group-hover:bg-slate-200"
        >
          <def.icon size={16} />
        </span>
      {/if}
      <span>
        <span class="block text-sm font-semibold text-slate-800">{def.label}</span>
        <span class="mt-0.5 block text-xs text-slate-500">{def.description}</span>
      </span>
    </button>
  {/each}
</div>
