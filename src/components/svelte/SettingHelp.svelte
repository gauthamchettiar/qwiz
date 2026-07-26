<script lang="ts">
  import { CircleQuestionMark } from '@lucide/svelte';
  import { SETTING_RULES, type SettingRule } from '@/lib/utils/quizScript';

  // `rules` defaults to the per-question table; pass `QUIZ_SETTING_RULES` for a quiz-wide key.
  let { key, rules = SETTING_RULES }: { key: string; rules?: Record<string, SettingRule> } =
    $props();

  // Settings are a closed set (see SETTING_RULES / QUIZ_SETTING_RULES) — every key this is ever
  // called with is known.
  const description = $derived(rules[key]?.description ?? '');
  // Rendered one line per array entry (see below) rather than relying on CSS to turn embedded "\n"
  // characters back into line breaks — a blank entry (from a "\n\n" paragraph break in the source
  // string) becomes a spacer between blocks instead of an empty paragraph.
  const lines = $derived(description.split('\n'));
</script>

<span class="group relative inline-flex">
  <CircleQuestionMark size={12} class="cursor-help text-slate-300 hover:text-slate-500" />
  <!-- `max-w-[calc(100vw-2rem)]` caps this so it can never itself force the page wider than the
       viewport (it's `opacity-0` until hover, but the browser still counts an absolutely
       positioned element's full geometry toward scrollWidth even while invisible — a `w-64`
       tooltip centered on a trigger near either edge was overflowing horizontally on mobile,
       inflating the page's scrollable width even though nothing looked wrong at rest). Doesn't
       fully solve a trigger sitting very close to the viewport edge still clipping one side —
       real edge-aware repositioning needs a positioning library this app has deliberately not
       taken on (see CLAUDE.md's daisyUI/Bits UI section) — but every trigger in practice sits
       inboard of the page's own padding, so this covers the realistic cases. -->
  <span
    class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2.5 text-xs font-normal normal-case leading-relaxed text-slate-600 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
  >
    {#each lines as line, i (i)}
      {#if line === ''}
        <div class="h-2"></div>
      {:else if line.startsWith('Accepted values:') || line.startsWith('Default:')}
        {@const [label, ...rest] = line.split(':')}
        <p><span class="font-semibold text-slate-700">{label}:</span>{rest.join(':')}</p>
      {:else}
        <p>{line}</p>
      {/if}
    {/each}
  </span>
</span>
