<script lang="ts">
  import { Plus, Trash2, ChevronUp, ChevronDown } from '@lucide/svelte';
  import type { ContentBlock } from '../../types';
  import ContentBlockEditor from '../../components/ContentBlockEditor.svelte';
  import CheckboxRow from '../../components/CheckboxRow.svelte';
  import ExtrasEditor from '../ExtrasEditor.svelte';
  import QuestionSettings from '../QuestionSettings.svelte';
  import { updateInList, removeFromList, moveInList } from '../../listOps';
  import type { PromptExtra } from '../multiple';
  import {
    blankAnswer,
    boxCount,
    guessBudget,
    type TypedData,
    type TypedMode,
    type TypedInputStyle,
    type TypedGrading,
    type TypedFocusTarget
  } from './index';

  let {
    data,
    onChange,
    focusTarget,
    onFocusHandled
  }: {
    data: TypedData;
    onChange: (data: TypedData) => void;
    focusTarget?: unknown;
    onFocusHandled?: () => void;
  } = $props();

  let promptRef: { focus: () => void } | undefined = $state();
  let answerRefs: Record<string, HTMLInputElement> = $state({});
  let extras: { focus: (id: string) => void } | undefined = $state();

  $effect(() => {
    const target = focusTarget as TypedFocusTarget | null | undefined;
    if (!target) return;
    if (target.field === 'prompt') promptRef?.focus();
    else if (target.field === 'answer') answerRefs[target.answerId]?.focus();
    else if (target.field === 'extra') extras?.focus(target.extraId);
    onFocusHandled?.();
  });

  const modes: { value: TypedMode; label: string; hint: string }[] = [
    { value: 'single', label: 'One input', hint: 'A single answer, checked against the accepted list.' },
    { value: 'multi', label: 'Multiple', hint: 'Bank guesses one by one; graded once they run out.' },
    { value: 'multi-realtime', label: 'Multiple, live', hint: 'Like Multiple, but each guess is marked right/wrong as it lands.' }
  ];
  const inputStyles: { value: TypedInputStyle; label: string }[] = [
    { value: 'text', label: 'Text field' },
    { value: 'boxes', label: 'Character boxes' }
  ];
  const gradings: { value: TypedGrading; label: string }[] = [
    { value: 'correct-only', label: 'Correct only' },
    { value: 'penalize', label: 'Penalize wrong' }
  ];

  const isMulti = $derived(data.mode !== 'single');
  const currentModeHint = $derived(modes.find((m) => m.value === data.mode)?.hint ?? '');

  function setAnswer(id: string, patch: Partial<{ text: string; points: number }>) {
    const a = data.answers.find((x) => x.id === id);
    if (!a) return;
    onChange({ ...data, answers: updateInList(data.answers, id, { ...a, ...patch }) });
  }
  function addAnswer() {
    if (data.answers.length >= 50) return;
    onChange({ ...data, answers: [...data.answers, blankAnswer()] });
  }
  function toOptionalPositiveInt(raw: string): number | null {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return null;
    return Math.max(1, Math.round(n));
  }
</script>

<div class="space-y-5">
  <div class="mb-2">
    <p class="mb-1 block text-xs font-medium text-slate-500">Question</p>
    <ContentBlockEditor bind:this={promptRef} value={data.prompt} onChange={(block: ContentBlock) => onChange({ ...data, prompt: block })} />
  </div>

  <ExtrasEditor bind:this={extras} extras={data.extras} onChange={(e: PromptExtra[]) => onChange({ ...data, extras: e })} />

  <div class="space-y-2">
    <p class="text-xs font-medium text-slate-500">Answer mode</p>
    <div class="inline-flex flex-wrap overflow-hidden rounded-md border border-slate-300">
      {#each modes as m, i (m.value)}
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-medium {data.mode === m.value
            ? 'bg-slate-900 text-white'
            : 'bg-white text-slate-600 hover:bg-slate-100'} {i > 0 ? 'border-l border-slate-300' : ''}"
          onclick={() => onChange({ ...data, mode: m.value })}
        >
          {m.label}
        </button>
      {/each}
    </div>
    <p class="text-xs text-slate-400">{currentModeHint}</p>
  </div>

  <QuestionSettings>
    {#if data.mode === 'single'}
      <div>
        <p class="mb-1 text-xs font-medium text-slate-600">Input style</p>
        <div class="inline-flex overflow-hidden rounded-md border border-slate-300">
          {#each inputStyles as s, i (s.value)}
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium {data.inputStyle === s.value
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100'} {i > 0 ? 'border-l border-slate-300' : ''}"
              onclick={() => onChange({ ...data, inputStyle: s.value })}
            >
              {s.label}
            </button>
          {/each}
        </div>
        {#if data.inputStyle === 'boxes'}
          <p class="mt-1 text-xs text-slate-400">
            Shows {boxCount(data) || '—'} boxes, one per character of the first answer (spaces ignored).
          </p>
        {/if}
      </div>
    {:else}
      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
          Max guesses
          <input
            type="number"
            min="1"
            class="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
            placeholder={String(data.answers.length)}
            value={data.maxGuesses ?? ''}
            oninput={(e) => onChange({ ...data, maxGuesses: toOptionalPositiveInt(e.currentTarget.value) })}
          />
          <span class="font-normal text-slate-400">of {guessBudget(data)}</span>
        </label>
      </div>
      <div>
        <p class="mb-1 text-xs font-medium text-slate-600">Grading</p>
        <div class="inline-flex overflow-hidden rounded-md border border-slate-300">
          {#each gradings as g, i (g.value)}
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium {data.grading === g.value
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100'} {i > 0 ? 'border-l border-slate-300' : ''}"
              onclick={() => onChange({ ...data, grading: g.value })}
            >
              {g.label}
            </button>
          {/each}
        </div>
      </div>
      {#if data.grading === 'penalize'}
        <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
          Points off per wrong guess
          <input
            type="number"
            min="0"
            class="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={data.wrongPenalty}
            oninput={(e) => onChange({ ...data, wrongPenalty: Number(e.currentTarget.value) || 0 })}
          />
        </label>
      {/if}
    {/if}
    <CheckboxRow
      checked={data.ungraded ?? false}
      label="Do not grade this question — answered but not scored; a practice/trial question only"
      onChange={(v) => onChange({ ...data, ungraded: v })}
    />
  </QuestionSettings>

  <div class="space-y-3">
    <p class="text-xs font-medium text-slate-500">
      Accepted answers ({data.answers.length}){data.mode === 'single' ? ' — extra rows act as synonyms' : ''}
    </p>
    {#each data.answers as answer, i (answer.id)}
      <div class="flex items-center gap-2 rounded-md border border-slate-200 p-2">
        <input
          type="text"
          bind:this={answerRefs[answer.id]}
          class="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="Accepted answer"
          value={answer.text}
          oninput={(e) => setAnswer(answer.id, { text: e.currentTarget.value })}
        />
        <label class="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          Points
          <input
            type="number"
            class="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={answer.points}
            oninput={(e) => setAnswer(answer.id, { points: Number(e.currentTarget.value) || 0 })}
          />
        </label>
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            class="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
            disabled={i === 0}
            onclick={() => onChange({ ...data, answers: moveInList(data.answers, answer.id, -1) })}
            aria-label="Move answer up"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            class="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
            disabled={i === data.answers.length - 1}
            onclick={() => onChange({ ...data, answers: moveInList(data.answers, answer.id, 1) })}
            aria-label="Move answer down"
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            class="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
            disabled={data.answers.length <= 1}
            onclick={() => onChange({ ...data, answers: removeFromList(data.answers, answer.id) })}
            aria-label="Remove answer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    {/each}
    <button
      type="button"
      class="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300"
      disabled={data.answers.length >= 50}
      onclick={addAnswer}
    >
      <Plus size={14} /> Add answer
    </button>
  </div>
</div>
