<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CircleCheck, CircleX, Video, Eye } from '@lucide/svelte';
  import type { QuizScriptOption, QuizScriptQuestion } from '@/lib/utils/quizScript';
  import type { FocusTarget } from '@/lib/utils/questionFocus';
  import { choiceOptionsLayoutClass } from '@/lib/utils/grading';

  // Unlike quizare, which needs a per-type Editor/Preview registry because its question types
  // have genuinely different data shapes, every quizScript question is one unified
  // {text, media, options, settings} shape regardless of `variant` — so there's exactly one
  // view component here, no registry, no per-variant dispatch.
  let {
    question,
    onFocus
  }: { question: QuizScriptQuestion; onFocus?: (target: FocusTarget) => void } = $props();

  const interactive = $derived(!!onFocus);
  const settingsEntries = $derived(Object.entries(question.settings));
  const optionsContainerClass = $derived(choiceOptionsLayoutClass(question));

  function pointsLabel(option: QuizScriptOption): string {
    if (option.points === undefined) return option.correct ? 'Correct' : 'Incorrect';
    return `${option.points >= 0 ? '+' : ''}${option.points} pts`;
  }
</script>

<!-- Shared wrapper for every focusable preview row below — two fully separate static branches
     (rather than one div with a conditional role/tabindex) so Svelte's a11y check can actually
     see that a nonnegative tabindex only ever appears together with role="button", instead of
     conservatively flagging a div whose role and tabindex are each independently conditional on
     the same `interactive` flag but written as two separate ternaries. -->
{#snippet focusableRow(extraClass: string, onActivate: () => void, children: Snippet)}
  {#if interactive}
    <div
      class="{extraClass} cursor-pointer hover:ring-2 hover:ring-slate-300"
      role="button"
      tabindex="0"
      onclick={onActivate}
      onkeydown={(e) => e.key === 'Enter' && onActivate()}
    >
      {@render children()}
    </div>
  {:else}
    <div class={extraClass}>
      {@render children()}
    </div>
  {/if}
{/snippet}

<div class="space-y-3">
  {#if question.variant !== 'question'}
    <span
      class="inline-block rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500"
    >
      {question.variant}
    </span>
  {/if}

  {#if question.text || question.media.length === 0}
    {#snippet textRow()}
      <p class="whitespace-pre-wrap text-slate-900">{question.text || 'Untitled question'}</p>
    {/snippet}
    {@render focusableRow('rounded-md p-2', () => onFocus?.({ field: 'text' }), textRow)}
  {/if}

  {#snippet mediaBlock(
    media: { kind: 'image' | 'video'; alt: string; url: string },
    size: 'question' | 'option'
  )}
    {#if media.kind === 'image'}
      <img
        src={media.url}
        alt={media.alt}
        class="rounded-md border border-slate-200 object-contain {size === 'question'
          ? 'max-h-80'
          : 'max-h-40'}"
      />
    {:else}
      <div
        class="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
      >
        <Video size={15} class="shrink-0 text-slate-400" />
        <span class="truncate">{media.alt || media.url}</span>
      </div>
    {/if}
  {/snippet}

  {#each question.media as media, index (index)}
    {#snippet mediaRow()}
      {@render mediaBlock(media, 'question')}
    {/snippet}
    {@render focusableRow('rounded-md p-2', () => onFocus?.({ field: 'media', index }), mediaRow)}
  {/each}

  {#each question.extras as extra, index (index)}
    {#snippet extraRow()}
      <p class="flex items-center gap-1 text-xs font-medium text-slate-500">
        <Eye size={12} />
        {extra.label || 'Hint'}
      </p>
      <p class="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{extra.content}</p>
      {#if extra.points !== 0}
        <span
          class="mt-1 inline-block text-xs font-semibold {extra.points > 0
            ? 'text-green-700'
            : 'text-red-600'}"
        >
          {extra.points >= 0 ? '+' : ''}{extra.points} pts
        </span>
      {/if}
    {/snippet}
    {@render focusableRow(
      'rounded-md border border-dashed border-slate-300 bg-slate-50 p-2',
      () => onFocus?.({ field: 'extra', index }),
      extraRow
    )}
  {/each}

  <div class={optionsContainerClass}>
    {#each question.options as option, index (index)}
      {#if question.variant === 'typed' || question.variant === 'character_input'}
        <!-- Every accepted answer is correct by construction (see quizScript.ts) — a
             green/red split here would be uninformative, so this just shows the text and,
             only when the author actually gave it its own %N% weight, a plain points badge.
             (`option.content.text` is already `[X]`-bracket-stripped by the parser for
             character_input — see `prerevealed` — so this preview doesn't show which characters
             are pre-revealed; switch to code mode to see the authored brackets.) -->
        {#snippet answerOptionRow()}
          {#if option.content.kind === 'text'}
            <p class="text-sm text-slate-900">{option.content.text}</p>
          {:else}
            {@render mediaBlock(option.content, 'option')}
          {/if}
          {#if option.points !== undefined}
            <span class="mt-1 inline-block text-xs font-semibold text-slate-500">
              {option.points >= 0 ? '+' : ''}{option.points} pts
            </span>
          {/if}
        {/snippet}
        {@render focusableRow(
          'rounded-md border border-slate-200 p-3',
          () => onFocus?.({ field: 'option', index }),
          answerOptionRow
        )}
      {:else}
        {#snippet choiceOptionRow()}
          {#if option.content.kind === 'text'}
            <p class="text-sm text-slate-900">{option.content.text}</p>
          {:else}
            {@render mediaBlock(option.content, 'option')}
          {/if}
          {#if option.correct}
            <span class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green-700">
              <CircleCheck size={13} />
              {pointsLabel(option)}
            </span>
          {:else}
            <span class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600">
              <CircleX size={13} />
              {pointsLabel(option)}
            </span>
          {/if}
        {/snippet}
        {@render focusableRow(
          `rounded-md border p-3 ${option.correct ? 'border-green-400 border-dashed' : 'border-slate-200'}`,
          () => onFocus?.({ field: 'option', index }),
          choiceOptionRow
        )}
      {/if}
    {/each}
  </div>

  {#if settingsEntries.length > 0}
    {#snippet settingsRow()}
      {#each settingsEntries as [key, value] (key)}
        <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
          >{key}: {String(value)}</span
        >
      {/each}
    {/snippet}
    {@render focusableRow(
      'flex flex-wrap items-center gap-1.5 rounded-md p-2',
      () => onFocus?.({ field: 'settings' }),
      settingsRow
    )}
  {/if}
</div>
