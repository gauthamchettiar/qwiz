<script lang="ts">
  import { Code, Copy, Play, Square, TriangleAlert } from '@lucide/svelte';
  import {
    parseQuizScriptQuestion,
    resolveQuestionSettings,
    suggestedSettingKeysForVariant,
    type QuizScriptQuestion,
    type QuizScriptSettings
  } from '@/lib/utils/quizScript';
  import type { QuizQuestion } from '@/lib/schemas/quiz';
  import type { FocusTarget } from '@/lib/utils/questionFocus';
  import QuestionView from './QuestionView.svelte';
  import QuestionForm from './QuestionForm.svelte';
  import QuestionPlayer from './QuestionPlayer.svelte';
  import CodeFrame from './CodeFrame.svelte';
  import SettingsLegend from './SettingsLegend.svelte';
  import ConfirmDeleteButton from './ConfirmDeleteButton.svelte';

  let {
    question,
    quizSettings,
    mode,
    draft,
    focusTarget,
    onEnterCode,
    onEnterForm,
    onDraftChange,
    onCommitForm,
    onFocusHandled,
    onClone,
    onDelete
  }: {
    question: QuizQuestion;
    /** The quiz's own settings, so this card resolves the same inherited defaults a real run
     * would — see `resolveQuestionSettings`. Without it the preview and the "try it" tester would
     * both describe a question the player never actually gets. */
    quizSettings: QuizScriptSettings;
    mode: 'view' | 'code' | 'form';
    draft: string;
    focusTarget: FocusTarget | null;
    onEnterCode: () => void;
    onEnterForm: (target: FocusTarget) => void;
    onDraftChange: (next: string) => void;
    onCommitForm: (next: QuizScriptQuestion) => void;
    onFocusHandled: () => void;
    onClone: () => void;
    onDelete: () => void;
  } = $props();

  // Resolved (quiz defaults folded in), not just parsed — everything below reads settings off this,
  // so there's no path where the editor shows one set of effective settings and the player another.
  const parsedSaved = $derived.by(() => {
    const parsed = parseQuizScriptQuestion(question.code).question;
    return { ...parsed, settings: resolveQuestionSettings(parsed, quizSettings) };
  });
  const draftErrors = $derived(mode === 'code' ? parseQuizScriptQuestion(draft).errors : []);
  // The SAVED question's own errors, in every mode — a question really can be saved broken, since
  // form mode commits on every keystroke (see QuestionForm's `emit`) rather than only once it's
  // valid, which is what makes a half-finished question survive a reload at all. Before this the
  // card said nothing about it outside code mode, so a stack of questions gave no sign which one
  // was wrong.
  const savedErrorCount = $derived(parseQuizScriptQuestion(question.code).errors.length);
  // The legend below the code textarea only offers keys that actually apply to whatever variant
  // is currently written in `draft` (see `suggestedSettingKeysForVariant`) — re-parsed live so
  // switching a question's variant mid-edit (e.g. `pick_many:` -> `type_answer:`) updates it
  // immediately.
  const draftSuggestedKeys = $derived(
    mode === 'code'
      ? suggestedSettingKeysForVariant(parseQuizScriptQuestion(draft).question.variant)
      : []
  );
  // Auto-grows with content so PageUp/PageDown (which this app dedicates entirely to switching
  // which question is in code mode — see QuizBuilder's keydown handler) rarely needs to fight
  // the textarea's own native scroll-within behavior in the first place.
  const rows = $derived(Math.min(16, Math.max(4, draft.split('\n').length)));

  // Independent of `mode` (view/code/form) — a quick "try it" tester that renders right in the
  // card, rather than switching mode or navigating to /local/play, so checking a single change
  // doesn't mean playing through the whole quiz to reach it. Always tests the saved question
  // (`parsedSaved`), which already updates live while in form mode (every field commits
  // immediately — see QuestionForm) and on commit while in code mode.
  let playing = $state(false);

  let textareaEl: HTMLTextAreaElement | undefined = $state();

  // Only depends on `mode`, so this fires exactly once per genuine transition INTO code mode
  // (e.g. PageUp/PageDown landing here) — not on every keystroke while already in it.
  $effect(() => {
    if (mode === 'code') textareaEl?.focus();
  });
</script>

<!-- In code mode, grows to 150% of its own normal width via a symmetric breakout (+25% margin
     pulled in on each side) rather than a viewport-relative size: `vw` units are disconnected
     from how wide the card already is (this page is capped at max-w-3xl), so sizing off the
     viewport directly could easily compute *narrower* than a plain sibling card on common laptop
     widths. Scaling relative to its own width guarantees it's always wider than the others.
     Gated at `xl:` (1280px), not `lg:` (1024px): the breakout only clears the viewport's own
     edges once the page's centered margin is at least ~168px, which needs a viewport of ~1104px
     — below that (but still ≥1024px) the card would spill off both sides of the window. `xl:`
     has enough headroom above that threshold to never hit it while resizing. -->
<div
  data-question-id={question.id}
  class="relative rounded-lg border p-4 {mode === 'view'
    ? 'border-line-subtle bg-surface-raised'
    : 'border-line-strong bg-surface-raised'} {mode === 'code' ? 'xl:w-[150%] xl:-mx-[25%]' : ''}"
>
  <!-- `lg:right-full` + `lg:mr-2` (rather than a corner-straddling negative offset) puts the
       button strip entirely outside the card with a real gap, its top aligned exactly with the
       card's own top edge — no overlap in either direction. Only switches to that absolute,
       outside-the-card treatment at `lg:` (1024px) — Base.astro's page container is
       `max-w-3xl` (768px) with `px-4` (16px) padding, so there's zero margin outside the card
       below 768px and only a thin, insufficient sliver just above it; `lg:` leaves ~144px of
       real margin on each side, comfortably more than this strip's own ~40px width. Below that,
       it renders as a plain in-flow horizontal row above the card's content instead — the
       absolute version would otherwise get pushed off-screen to the left with nowhere to go,
       which is what was causing horizontal overflow / a phantom empty gap on mobile. -->
  <div
    class="mb-3 flex items-center gap-1 lg:absolute lg:right-full lg:top-0 lg:mb-0 lg:mr-2 lg:flex-col"
  >
    <button
      type="button"
      class="rounded-md border border-line-subtle bg-surface-raised p-1.5 hover:bg-surface {playing
        ? 'bg-surface-hover text-ink'
        : 'text-ink-faint'}"
      onclick={() => (playing = !playing)}
      aria-label={playing ? 'Stop testing this question' : 'Try this question'}
      title={playing ? 'Stop testing this question' : 'Try this question'}
    >
      {#if playing}
        <Square size={15} />
      {:else}
        <Play size={15} />
      {/if}
    </button>
    <button
      type="button"
      class="rounded-md border border-line-subtle bg-surface-raised p-1.5 hover:bg-surface {mode ===
      'code'
        ? 'bg-surface-hover text-ink'
        : 'text-ink-faint'}"
      onclick={onEnterCode}
      aria-label="Edit question code"
      title="Edit question code"
    >
      <Code size={15} />
    </button>
    <button
      type="button"
      class="rounded-md border border-line-subtle bg-surface-raised p-1.5 text-ink-faint hover:bg-surface"
      onclick={onClone}
      aria-label="Clone question"
      title="Clone question"
    >
      <Copy size={15} />
    </button>
    <ConfirmDeleteButton onConfirm={onDelete} ariaLabel="Delete question" />
  </div>

  {#if mode === 'view'}
    <!-- View mode only: form mode already lists these in full via ErrorList, and code mode anchors
         each one to its own line via CodeFrame. Here it's a count, not the messages — the card is
         something you scan down a page of, and the messages are one click away in the mode built
         to show them, which is why the pill IS that click rather than sitting beside it. -->
    {#if savedErrorCount > 0}
      <button
        type="button"
        class="mb-3 flex items-center gap-1.5 rounded-md border border-negative-line-faint bg-negative-surface px-2 py-1 text-xs font-medium text-negative-ink-strong hover:bg-negative-surface-strong"
        onclick={onEnterCode}
      >
        <TriangleAlert size={13} class="shrink-0" />
        {savedErrorCount === 1 ? '1 error' : `${savedErrorCount} errors`}
      </button>
    {/if}
    <QuestionView question={parsedSaved} onFocus={onEnterForm} />
  {:else if mode === 'code'}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="space-y-2">
        <textarea
          bind:this={textareaEl}
          class="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-muted focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-subtle"
          {rows}
          value={draft}
          oninput={(e) => onDraftChange(e.currentTarget.value)}></textarea>
        <SettingsLegend keys={draftSuggestedKeys} />
        {#each draftErrors as error, index (index)}
          <CodeFrame {error} source={draft} />
        {/each}
      </div>
      <div class="rounded-md border border-line-faint p-3">
        <QuestionView question={parsedSaved} onFocus={onEnterForm} />
      </div>
    </div>
  {:else}
    <QuestionForm question={parsedSaved} {focusTarget} onChange={onCommitForm} {onFocusHandled} />
  {/if}

  {#if playing}
    <div
      class="mt-4 rounded-md border border-dashed border-accent-line-faint bg-accent-surface/40 p-4"
    >
      <p class="mb-3 flex items-center gap-1 text-xs font-medium text-accent-ink">
        <Play size={12} /> Try this question
      </p>
      <QuestionPlayer question={parsedSaved} standalone />
    </div>
  {/if}
</div>
