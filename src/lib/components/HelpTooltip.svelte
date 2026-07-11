<script lang="ts">
  import { CircleQuestionMark } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  let { text, preview }: { text: string; preview?: Snippet } = $props();
</script>

<span class="group/tip relative inline-flex">
  <button
    type="button"
    aria-label="What does this do?"
    class="text-slate-300 hover:text-slate-500"
  >
    <CircleQuestionMark size={13} />
  </button>
  <span
    class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2.5 text-left text-xs font-normal normal-case tracking-normal text-slate-600 opacity-0 shadow-md transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
  >
    {#if preview}
      <div class="mb-2">{@render preview()}</div>
    {/if}
    {text}
  </span>
</span>
