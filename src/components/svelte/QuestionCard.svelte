<script lang="ts">
  import { Code, Copy, Play, Square } from '@lucide/svelte';
  import {
    parseQuizScriptQuestion,
    suggestedSettingKeysForVariant,
    type QuizScriptQuestion
  } from '@/lib/utils/quizScript';
  import type { QuizQuestion } from '@/lib/schemas/quiz';
  import type { FocusTarget } from '@/lib/utils/questionFocus';
  import QuestionView from './QuestionView.svelte';
  import QuestionForm from './QuestionForm.svelte';
  import QuestionPlayer from './QuestionPlayer.svelte';
  import CodeFrame from './CodeFrame.svelte';
  import SettingHelp from './SettingHelp.svelte';
  import ConfirmDeleteButton from './ConfirmDeleteButton.svelte';

  let {
    question,
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

  const parsedSaved = $derived(parseQuizScriptQuestion(question.code).question);
  const draftErrors = $derived(mode === 'code' ? parseQuizScriptQuestion(draft).errors : []);
  // The legend below the code textarea only offers keys that actually apply to whatever variant
  // is currently written in `draft` (see `suggestedSettingKeysForVariant`) — re-parsed live so
  // switching a question's variant mid-edit (e.g. `choice:` -> `typed:`) updates it immediately.
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
    ? 'border-slate-200 bg-white'
    : 'border-slate-400 bg-white'} {mode === 'code' ? 'xl:w-[150%] xl:-mx-[25%]' : ''}"
>
  <!-- right-full + mr-2 (rather than a corner-straddling negative offset) puts the button
       entirely outside the card with a real gap, its top aligned exactly with the card's own
       top edge — no overlap in either direction. -->
  <div class="absolute right-full top-0 mr-2 flex flex-col gap-1">
    <button
      type="button"
      class="rounded-md border border-slate-200 bg-white p-1.5 hover:bg-slate-50 {playing
        ? 'bg-slate-100 text-slate-900'
        : 'text-slate-400'}"
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
      class="rounded-md border border-slate-200 bg-white p-1.5 hover:bg-slate-50 {mode === 'code'
        ? 'bg-slate-100 text-slate-900'
        : 'text-slate-400'}"
      onclick={onEnterCode}
      aria-label="Edit question code"
      title="Edit question code"
    >
      <Code size={15} />
    </button>
    <button
      type="button"
      class="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-slate-50"
      onclick={onClone}
      aria-label="Clone question"
      title="Clone question"
    >
      <Copy size={15} />
    </button>
    <ConfirmDeleteButton onConfirm={onDelete} ariaLabel="Delete question" />
  </div>

  {#if mode === 'view'}
    <QuestionView question={parsedSaved} onFocus={onEnterForm} />
  {:else if mode === 'code'}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="space-y-2">
        <textarea
          bind:this={textareaEl}
          class="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          {rows}
          value={draft}
          oninput={(e) => onDraftChange(e.currentTarget.value)}></textarea>
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
          <span>Settings:</span>
          {#each draftSuggestedKeys as key (key)}
            <span class="inline-flex items-center gap-0.5">
              {key}
              <SettingHelp {key} />
            </span>
          {/each}
        </div>
        {#each draftErrors as error, index (index)}
          <CodeFrame {error} source={draft} />
        {/each}
      </div>
      <div class="rounded-md border border-slate-100 p-3">
        <QuestionView question={parsedSaved} onFocus={onEnterForm} />
      </div>
    </div>
  {:else}
    <QuestionForm question={parsedSaved} {focusTarget} onChange={onCommitForm} {onFocusHandled} />
  {/if}

  {#if playing}
    <div class="mt-4 rounded-md border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
      <p class="mb-3 flex items-center gap-1 text-xs font-medium text-indigo-600">
        <Play size={12} /> Try this question
      </p>
      <QuestionPlayer question={parsedSaved} standalone />
    </div>
  {/if}
</div>
