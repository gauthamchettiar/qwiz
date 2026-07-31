<script lang="ts">
  import { SETTING_RULES, type SettingRule } from '@/lib/utils/quizScript';
  import SettingHelp from './SettingHelp.svelte';

  // The settings vocabulary available where it's shown: every key that applies here, each one
  // clickable for what it does. Complements the per-row "?" (which explains the ONE key a row
  // already holds) and the docs link (the whole reference, in a new tab) by answering the question
  // neither does — "what can I even set here?" — without leaving the page.
  //
  // Shown under the code-mode textarea, where there's no <select> offering the keys, and inside a
  // settings block once its disclosure is OPEN. The disclosure part is deliberate: an earlier
  // version of this listed every key permanently above a block most questions never use, which is
  // the thing that was worth collapsing — not the list itself.
  //
  // `rules` defaults to the per-question table; pass `QUIZ_SETTING_RULES` for the quiz-wide block.
  let {
    keys,
    rules = SETTING_RULES
  }: { keys: readonly string[]; rules?: Record<string, SettingRule> } = $props();
</script>

{#if keys.length > 0}
  <!-- Tight vertical gap because each key is now barely taller than its own text (see SettingHelp)
       — the loose `gap-y-1` this used to need was compensating for 32px icon buttons stacked
       beside 16px of text. -->
  <div class="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500">
    <span class="mr-0.5">Settings:</span>
    {#each keys as key (key)}
      <SettingHelp {key} {rules} />
    {/each}
  </div>
{/if}
