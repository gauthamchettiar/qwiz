<script lang="ts">
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';
  import { playPresetCss } from '@/lib/themes/playPresets';

  // A live sample of the look, paginated across the screens a run actually passes through.
  //
  // Static markup rather than a real `<QuizPlayer>`: this has to show the ANSWERED and FINISHED
  // states side by side with the welcome one, and driving a real player into three different
  // states inside a builder panel would mean either three players or a fake run, both of which
  // carry the timers, the leave guard and the save path along with them. What it must not do is
  // invent its own class names — every element below carries the same `.qwiz-*` class the real
  // screen does, so what the preview shows is what the stylesheet does.
  //
  // The CSS is scoped by `@scope` to this element, so a preset's `body` rule and its `:root`
  // variables can't escape into the builder around it.

  let { preset = 'none', css = '' }: { preset?: string; css?: string } = $props();

  const SCREENS = ['Welcome', 'Question', 'Answered', 'Results'] as const;
  let screen = $state(0);

  // Built as a real element rather than injected with `{@html}`. This codebase has no raw-HTML
  // sink anywhere — `public/_headers` cites that fact as the reason its CSP can live with
  // `'unsafe-inline'` — and adding one here, in the component whose whole job is rendering
  // author-supplied CSS, would be the worst possible place to start.
  //
  // It goes in `<head>`, not inside this component: `@scope`'s root is matched wherever it lives,
  // so the scoping is identical, and Svelte's runtime never has to reconcile a node it didn't
  // render. Browsers without `@scope` (Firefox before 128) drop the block whole and show the
  // preview unstyled, which is the right way for this to fail.
  $effect(() => {
    if (scoped === '') return;
    const style = document.createElement('style');
    style.textContent = `@scope ([data-preview]) { ${scoped} }`;
    document.head.append(style);
    return () => style.remove();
  });

  const scoped = $derived.by(() => {
    const sheet = `${playPresetCss(preset)}\n${css ?? ''}`.trim();
    if (sheet === '') return '';
    // `:root` and `body` mean nothing inside a scope, so they're rewritten onto the scope root —
    // which is exactly what they address when the theme is applied for real.
    return sheet.replace(/(^|\})\s*(:root|body)\s*\{/g, '$1 :scope {');
  });
</script>

<div class="rounded-md border border-line-subtle">
  <div class="flex items-center gap-1 border-b border-line-faint px-2 py-1.5">
    <span class="text-xs font-medium text-ink-subtle">Preview</span>
    <div class="flex-1"></div>
    <button
      type="button"
      class="rounded p-1 text-ink-subtle hover:bg-surface-hover disabled:opacity-40"
      disabled={screen === 0}
      onclick={() => (screen -= 1)}
      aria-label="Previous screen"
    >
      <ChevronLeft size={14} />
    </button>
    <span class="w-20 text-center text-xs text-ink-soft">{SCREENS[screen]}</span>
    <button
      type="button"
      class="rounded p-1 text-ink-subtle hover:bg-surface-hover disabled:opacity-40"
      disabled={screen === SCREENS.length - 1}
      onclick={() => (screen += 1)}
      aria-label="Next screen"
    >
      <ChevronRight size={14} />
    </button>
  </div>

  <!-- `overflow-hidden` matters: a preset can set a page background, and this is the box that is
       allowed to wear it. -->
  <div class="qwiz-preview overflow-hidden p-2" data-preview>
    {#if screen === 0}
      <div class="qwiz-welcome space-y-2 rounded-lg border border-line-subtle p-3">
        <h1 class="qwiz-title text-xl font-bold">Capital Cities</h1>
        <p class="qwiz-description text-sm">A quick run around the world.</p>
        <ul class="qwiz-rules space-y-1 text-sm">
          <li>10 questions.</li>
          <li>Any question can be skipped.</li>
        </ul>
        <span
          class="qwiz-start inline-flex rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-inverse"
        >
          Start quiz
        </span>
      </div>
    {:else if screen === 1}
      {@render questionCard(false)}
    {:else if screen === 2}
      {@render questionCard(true)}
    {:else}
      <div class="qwiz-results overflow-hidden rounded-lg border border-line-subtle">
        <div class="qwiz-results-head flex items-center gap-3 bg-surface-hover px-4 py-4">
          <span class="qwiz-results-percent text-lg font-bold">80%</span>
          <div>
            <h2 class="qwiz-results-title text-base font-bold">You won!</h2>
            <p class="qwiz-description text-xs">8 of 10 points across 10 questions</p>
          </div>
        </div>
        <div class="px-4 py-3">
          <span class="qwiz-back-to-summary text-xs">Review answers</span>
        </div>
      </div>
    {/if}
  </div>
</div>

{#snippet questionCard(answered: boolean)}
  <div class="qwiz-card space-y-2 rounded-lg border border-line-subtle p-3">
    <div class="flex items-center justify-between">
      <p class="qwiz-progress text-xs font-medium">Question 3 of 10</p>
      <p class="qwiz-score text-xs font-medium">Score: 2 / 10</p>
    </div>
    <div class="qwiz-progressbar h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
      <div class="qwiz-progressbar-fill h-full w-1/3 bg-accent"></div>
    </div>

    {#if answered}
      <div class="qwiz-verdict flex items-center gap-2 rounded-lg border border-line-subtle p-2.5">
        <p class="qwiz-verdict-label flex-1 text-sm font-semibold">Correct</p>
        <span class="qwiz-verdict-score rounded-full bg-accent px-2 py-0.5 text-xs font-semibold">
          +1
        </span>
      </div>
    {/if}

    <p class="qwiz-question-text text-sm font-medium">What is the capital of Japan?</p>
    <div class="qwiz-options space-y-1.5">
      <div
        class="qwiz-option {answered
          ? 'qwiz-option--correct'
          : 'qwiz-option--selected'} rounded-md border border-line-subtle p-2.5"
      >
        <span class="qwiz-option-label text-sm">Tokyo</span>
      </div>
      <div
        class="qwiz-option {answered
          ? 'qwiz-option--wrong'
          : ''} rounded-md border border-line-subtle p-2.5"
      >
        <span class="qwiz-option-label text-sm">Osaka</span>
      </div>
      <div class="qwiz-option rounded-md border border-line-subtle p-2.5">
        <span class="qwiz-option-label text-sm">Kyoto</span>
      </div>
    </div>
    <div class="flex justify-end">
      <span
        class="{answered
          ? 'qwiz-next'
          : 'qwiz-submit'} inline-flex rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-inverse"
      >
        {answered ? 'Next question' : 'Submit answer'}
      </span>
    </div>
  </div>
{/snippet}
