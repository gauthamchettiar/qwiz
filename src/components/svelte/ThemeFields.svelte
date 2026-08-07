<script lang="ts">
  import { Check, ChevronDown, ChevronRight, Download, Upload } from '@lucide/svelte';
  import Button from './Button.svelte';
  import CodeEditor from './CodeEditor.svelte';
  import { downloadTextFile } from '@/lib/utils/download';
  import { PLAY_PRESETS } from '@/lib/themes/playPresets';

  // The look a QUIZ is played in. Not to be confused with the theme picker in the header, which is
  // the app's own colour scheme and belongs to whoever is using Qwiz rather than to any quiz.
  //
  // A disclosure rather than a dialog, and shaped exactly like the Settings one below it: both are
  // occasional, both are things about the quiz as a whole, and a modal for one and an inline panel
  // for the other would have made them look like different kinds of thing. Collapsed by default —
  // most quizzes never set a look — with the current choice on the toggle, so it says what it is
  // without being opened.
  //
  // Two controls, and only two. A preset, which is this app's own stylesheet named by the file
  // rather than carried in it, and a CSS box for anything on top. There is deliberately no
  // colour-by-colour editor between them: a preset already covers what most people want, and
  // anyone wanting more than a preset wants a stylesheet, not fifty-three swatches.

  let {
    preset = $bindable(),
    css = $bindable()
  }: {
    preset: string | undefined;
    css: string | undefined;
  } = $props();

  let open = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let importError = $state('');
  const panelId = $props.id();

  const chosen = $derived(preset ?? 'none');
  const presetLabel = $derived(PLAY_PRESETS.find((p) => p.id === chosen)?.label ?? chosen);
  /** What the collapsed row says. Reads as a sentence about the quiz, not as a field value.
   *
   * Deliberately avoids the word "player": this string becomes the toggle's accessible name, and
   * `getByRole` matches names by SUBSTRING — "each player's" made this button collide with the
   * builder's own Play button, failing nine authoring specs across all four browsers. */
  const summary = $derived(
    [chosen === 'none' ? undefined : presetLabel, css?.trim() ? 'custom CSS' : undefined]
      .filter(Boolean)
      .join(' + ') || 'Follows the app theme'
  );

  function choose(id: string) {
    preset = id === 'none' ? undefined : id;
  }

  async function onFileChosen(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    if (text.trim() === '') {
      importError = 'That file is empty.';
      return;
    }
    css = text;
    importError = '';
  }

  /** A plain `.css` file, because that is exactly what it is: openable in any editor, pasteable
   * into another quiz, and readable without this app. */
  function exportCss() {
    downloadTextFile('quiz-theme.css', css ?? '');
  }
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".css,text/css"
  onchange={onFileChosen}
  class="hidden"
/>

<div class="space-y-1.5">
  <button
    type="button"
    class="flex items-center gap-1 text-xs font-medium text-ink-subtle hover:text-ink-muted"
    aria-expanded={open}
    aria-controls={panelId}
    onclick={() => (open = !open)}
  >
    {#if open}
      <ChevronDown size={14} class="shrink-0" />
    {:else}
      <ChevronRight size={14} class="shrink-0" />
    {/if}
    Theme
    <span class="font-normal text-ink-faint">·</span>
    <span class="font-normal text-ink-subtle">{summary}</span>
  </button>

  <div id={panelId} class="space-y-3" hidden={!open}>
    <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {#each PLAY_PRESETS as option (option.id)}
        <button
          type="button"
          class="flex items-start gap-2 rounded-md border p-2.5 text-left {chosen === option.id
            ? 'border-accent-line bg-accent-surface'
            : 'border-line-subtle hover:bg-surface-hover'}"
          aria-pressed={chosen === option.id}
          onclick={() => choose(option.id)}
        >
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-medium text-ink">{option.label}</span>
            <span class="block text-xs text-ink-subtle">{option.hint}</span>
          </span>
          {#if chosen === option.id}
            <Check size={14} class="mt-0.5 shrink-0 text-accent-ink" />
          {/if}
        </button>
      {/each}
    </div>
    <p class="text-xs text-ink-subtle">
      A preset is Qwiz's own styling, so it travels as a name — the file stays small, and whoever
      plays the quiz sees it without being asked anything.
    </p>

    <div class="space-y-1.5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium text-ink-subtle">Your own CSS</span>
        <div class="flex-1"></div>
        <Button size="sm" onclick={() => fileInput?.click()}>
          <Upload size={14} class="shrink-0" /> Import .css
        </Button>
        <Button size="sm" onclick={exportCss}>
          <Download size={14} class="shrink-0" /> Export .css
        </Button>
      </div>
      <p class="text-xs text-ink-subtle">
        Applied on top of the preset. Target the <code class="font-mono">.qwiz-*</code> classes —
        <code class="font-mono">.qwiz-question-text</code>,
        <code class="font-mono">.qwiz-option</code>,
        <code class="font-mono">.qwiz-option--correct</code> and the rest are listed in the styling reference.
      </p>
      <CodeEditor
        value={css ?? ''}
        language="css"
        rows={8}
        ariaLabel="Custom CSS for this quiz"
        onInput={(next) => (css = next.trim() === '' ? undefined : next)}
      />
      {#if css?.trim()}
        <p class="text-xs text-warning-ink-strong">
          Anyone you send this quiz to is asked before your CSS runs — it can change anything on the
          page, so they get to decide. The preset above never asks.
        </p>
      {/if}
      {#if importError}
        <p class="text-xs text-negative-ink">{importError}</p>
      {/if}
    </div>
  </div>
</div>
