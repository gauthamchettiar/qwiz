<script lang="ts">
  import { CircleQuestionMark } from '@lucide/svelte';
  import { clickOutside } from '@/lib/utils/clickOutside';
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

  // A real open/closed toggle rather than CSS `:hover` — hover has no equivalent on a touch
  // screen, so a hover-only tooltip is simply unreachable there. Tap to open, tap the trigger
  // again/tap elsewhere/Escape to close; still works with a mouse via a plain click.
  let open = $state(false);
</script>

<span class="relative inline-flex" use:clickOutside={() => (open = false)}>
  <button
    type="button"
    class="cursor-help text-slate-300 hover:text-slate-500"
    aria-label="What does this setting do?"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <CircleQuestionMark size={12} />
  </button>
  {#if open}
    <span
      class="absolute bottom-full left-1/2 z-20 mb-1.5 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2.5 text-xs font-normal normal-case leading-relaxed text-slate-600 shadow-md"
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
  {/if}
</span>
