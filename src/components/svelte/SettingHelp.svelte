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
  <span
    class="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-64 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2.5 text-xs font-normal normal-case leading-relaxed text-slate-600 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
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
