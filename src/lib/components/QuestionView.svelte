<script lang="ts">
  import { CircleCheck, CircleX, Video, Eye } from '@lucide/svelte';
  import type { QuizScriptOption, QuizScriptQuestion } from '../quizScript';
  import type { FocusTarget } from './questionFocus';

  // Unlike quizare, which needs a per-type Editor/Preview registry because its question types
  // have genuinely different data shapes, every quizScript question is one unified
  // {text, media, options, settings} shape regardless of `variant` — so there's exactly one
  // view component here, no registry, no per-variant dispatch.
  let { question, onFocus }: { question: QuizScriptQuestion; onFocus?: (target: FocusTarget) => void } = $props();

  const interactive = $derived(!!onFocus);
  const settingsEntries = $derived(Object.entries(question.settings));
  // "grid" auto-picks its column count from how many options there are, rather than the author
  // choosing 2 vs 3 themselves: few options read fine as a 2-wide grid (2x2 at 4), more than that
  // gets cramped at 2-wide so it steps up to 3 (3x3 at 9). "list" (or the setting being absent)
  // is the original one-per-row layout.
  const optionsContainerClass = $derived(
    question.settings.option_display === 'grid'
      ? question.options.length <= 4
        ? 'grid grid-cols-2 gap-2'
        : 'grid grid-cols-2 sm:grid-cols-3 gap-2'
      : 'space-y-2'
  );

  function pointsLabel(option: QuizScriptOption): string {
    if (option.points === undefined) return option.correct ? 'Correct' : 'Incorrect';
    return `${option.points >= 0 ? '+' : ''}${option.points} pts`;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="space-y-3">
  {#if question.variant !== 'question'}
    <span class="inline-block rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
      {question.variant}
    </span>
  {/if}

  {#if question.text || question.media.length === 0}
    <div
      class="rounded-md p-2 {interactive ? 'cursor-pointer hover:ring-2 hover:ring-slate-300' : ''}"
      role={interactive ? 'button' : undefined}
      tabindex={interactive ? 0 : undefined}
      onclick={() => onFocus?.({ field: 'text' })}
      onkeydown={(e) => e.key === 'Enter' && onFocus?.({ field: 'text' })}
    >
      <p class="whitespace-pre-wrap text-slate-900">{question.text || 'Untitled question'}</p>
    </div>
  {/if}

  {#snippet mediaBlock(media: { kind: 'image' | 'video'; alt: string; url: string }, size: 'question' | 'option')}
    {#if media.kind === 'image'}
      <img
        src={media.url}
        alt={media.alt}
        class="rounded-md border border-slate-200 object-contain {size === 'question' ? 'max-h-80' : 'max-h-40'}"
      />
    {:else}
      <div class="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <Video size={15} class="shrink-0 text-slate-400" />
        <span class="truncate">{media.alt || media.url}</span>
      </div>
    {/if}
  {/snippet}

  {#each question.media as media, index (index)}
    <div
      class="rounded-md p-2 {interactive ? 'cursor-pointer hover:ring-2 hover:ring-slate-300' : ''}"
      role={interactive ? 'button' : undefined}
      tabindex={interactive ? 0 : undefined}
      onclick={() => onFocus?.({ field: 'media', index })}
      onkeydown={(e) => e.key === 'Enter' && onFocus?.({ field: 'media', index })}
    >
      {@render mediaBlock(media, 'question')}
    </div>
  {/each}

  {#each question.extras as extra, index (index)}
    <div
      class="rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 {interactive
        ? 'cursor-pointer hover:ring-2 hover:ring-slate-300'
        : ''}"
      role={interactive ? 'button' : undefined}
      tabindex={interactive ? 0 : undefined}
      onclick={() => onFocus?.({ field: 'extra', index })}
      onkeydown={(e) => e.key === 'Enter' && onFocus?.({ field: 'extra', index })}
    >
      <p class="flex items-center gap-1 text-xs font-medium text-slate-500">
        <Eye size={12} />
        {extra.label || 'Hint'}
      </p>
      <p class="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{extra.content}</p>
      {#if extra.points !== 0}
        <span class="mt-1 inline-block text-xs font-semibold {extra.points > 0 ? 'text-green-700' : 'text-red-600'}">
          {extra.points >= 0 ? '+' : ''}{extra.points} pts
        </span>
      {/if}
    </div>
  {/each}

  <div class={optionsContainerClass}>
    {#each question.options as option, index (index)}
      {#if question.variant === 'typed'}
        <!-- Every accepted answer is correct by construction (see quizScript.ts) — a
             green/red split here would be uninformative, so this just shows the text and,
             only when the author actually gave it its own %N% weight, a plain points badge. -->
        <div
          class="rounded-md border border-slate-200 p-3 {interactive ? 'cursor-pointer hover:ring-2 hover:ring-slate-300' : ''}"
          role={interactive ? 'button' : undefined}
          tabindex={interactive ? 0 : undefined}
          onclick={() => onFocus?.({ field: 'option', index })}
          onkeydown={(e) => e.key === 'Enter' && onFocus?.({ field: 'option', index })}
        >
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
        </div>
      {:else}
        <div
          class="rounded-md border p-3 {option.correct ? 'border-green-400 border-dashed' : 'border-slate-200'} {interactive
            ? 'cursor-pointer hover:ring-2 hover:ring-slate-300'
            : ''}"
          role={interactive ? 'button' : undefined}
          tabindex={interactive ? 0 : undefined}
          onclick={() => onFocus?.({ field: 'option', index })}
          onkeydown={(e) => e.key === 'Enter' && onFocus?.({ field: 'option', index })}
        >
          {#if option.content.kind === 'text'}
            <p class="text-sm text-slate-900">{option.content.text}</p>
          {:else}
            {@render mediaBlock(option.content, 'option')}
          {/if}
          {#if option.correct}
            <span class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green-700">
              <CircleCheck size={13} /> {pointsLabel(option)}
            </span>
          {:else}
            <span class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600">
              <CircleX size={13} /> {pointsLabel(option)}
            </span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  {#if settingsEntries.length > 0}
    <div
      class="flex flex-wrap items-center gap-1.5 rounded-md p-2 {interactive ? 'cursor-pointer hover:ring-2 hover:ring-slate-300' : ''}"
      role={interactive ? 'button' : undefined}
      tabindex={interactive ? 0 : undefined}
      onclick={() => onFocus?.({ field: 'settings' })}
      onkeydown={(e) => e.key === 'Enter' && onFocus?.({ field: 'settings' })}
    >
      {#each settingsEntries as [key, value] (key)}
        <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{key}: {String(value)}</span>
      {/each}
    </div>
  {/if}
</div>
