<script lang="ts">
  import { ChevronsUpDown } from '@lucide/svelte';

  let {
    kinds,
    current,
    onSelect
  }: {
    kinds: { kind: string; label: string; icon: any }[];
    current: string;
    onSelect: (kind: string) => void;
  } = $props();

  let open = $state(false);
  const currentDef = $derived(kinds.find((k) => k.kind === current) ?? kinds[0]);

  function select(kind: string) {
    open = false;
    if (kind !== current) onSelect(kind);
  }
</script>

<div class="relative shrink-0">
  <button
    type="button"
    class="flex items-center gap-0.5 rounded-md border border-slate-300 bg-white px-2 py-2 text-slate-600 hover:bg-slate-50"
    onclick={() => (open = !open)}
    aria-label={`Change type (currently ${currentDef.label})`}
    title={currentDef.label}
  >
    <currentDef.icon size={15} />
    <ChevronsUpDown size={12} class="text-slate-400" />
  </button>
  {#if open}
    <div class="absolute z-10 mt-1 w-32 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
      {#each kinds as k (k.kind)}
        <button
          type="button"
          class="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100 {k.kind === current
            ? 'font-semibold text-indigo-600'
            : 'text-slate-700'}"
          onclick={() => select(k.kind)}
        >
          <k.icon size={13} /> {k.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
