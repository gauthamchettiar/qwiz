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
      class="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
      onclick={() => onSelect(def.type)}
    >
      {#if def.icon}
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 group-hover:bg-indigo-100"
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
