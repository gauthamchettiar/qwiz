<script lang="ts">
  import { Settings2, ChevronDown } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  // The collapsible "Question settings" shell shared by both editors. Type-specific controls
  // are passed in as children.
  let { children }: { children: Snippet } = $props();
</script>

<details class="group rounded-md border border-slate-200">
  <summary
    class="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
  >
    <Settings2 size={13} />
    Question settings
    <ChevronDown size={13} class="ml-auto text-slate-400 transition-transform group-open:rotate-180" />
  </summary>
  <div class="space-y-3 border-t border-slate-100 px-3 py-3">
    {@render children()}
  </div>
</details>
