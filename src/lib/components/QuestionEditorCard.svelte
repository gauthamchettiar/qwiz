<script lang="ts">
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ChevronUp, ChevronDown, Trash2, Lock, LockOpen } from '@lucide/svelte';
  import type { QuestionInstance } from '../types';
  import { getQuestionType, questionTypeList } from '../question-types/registry';
  import { clickOutside } from '../clickOutside';
  import QuestionTypePicker from './QuestionTypePicker.svelte';

  let {
    question,
    index,
    total,
    locked,
    editing,
    invalid = false,
    focusTarget,
    onChange,
    onRemove,
    onMoveUp,
    onMoveDown,
    onToggleLock,
    onEnterEdit,
    onFocusHandled,
    onSwitchType
  }: {
    question: QuestionInstance;
    index: number;
    total: number;
    locked: boolean;
    editing: boolean;
    invalid?: boolean;
    focusTarget?: unknown;
    onChange: (data: unknown) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onToggleLock: () => void;
    onEnterEdit: (target: unknown) => void;
    onFocusHandled: () => void;
    onSwitchType: (type: string) => void;
  } = $props();

  const def = $derived(getQuestionType(question.type));
  let showTypeMenu = $state(false);

  function selectType(type: string) {
    showTypeMenu = false;
    if (type === question.type) return;
    onSwitchType(type);
  }
</script>

<div
  data-question-card
  class="rounded-lg border bg-white p-4 shadow-sm {invalid
    ? 'border-red-300 ring-2 ring-red-100'
    : editing
      ? 'border-slate-200 ring-2 ring-indigo-100'
      : locked
        ? 'border-indigo-400 ring-1 ring-indigo-200'
        : 'border-slate-200'}"
>
  <div class="mb-3 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold text-indigo-600">Question {index + 1}</span>
      <div class="relative" use:clickOutside={() => (showTypeMenu = false)}>
        <button
          type="button"
          class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors {showTypeMenu
            ? 'border-indigo-300 bg-indigo-50/60 text-indigo-700'
            : 'border-slate-200 text-slate-500 hover:bg-slate-50'}"
          onclick={() => (showTypeMenu = !showTypeMenu)}
        >
          {def.label}
          <ChevronDown size={11} class="text-slate-400 transition-transform {showTypeMenu ? 'rotate-180' : ''}" />
        </button>
        {#if showTypeMenu}
          <div
            class="absolute z-10 mt-3 w-[26rem] max-w-[90vw] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
            transition:scale={{ duration: 120, start: 0.97, opacity: 0, easing: cubicOut }}
          >
            <QuestionTypePicker types={questionTypeList} onSelect={selectType} />
            <div class="absolute -top-1.5 left-5 size-3 rotate-45 border-l border-t border-slate-200 bg-white"></div>
          </div>
        {/if}
      </div>
      {#if locked}
        <span class="text-xs font-medium text-indigo-500">Locked — new questions use this format</span>
      {/if}
    </div>
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="rounded p-1.5 {locked ? 'text-indigo-600 hover:bg-indigo-50' : 'text-slate-400 hover:bg-slate-100'}"
        onclick={onToggleLock}
        aria-label={locked ? 'Unlock format' : 'Lock format for new questions'}
        title={locked ? 'Unlock format' : 'Lock format for new questions'}
      >
        {#if locked}
          <Lock size={15} />
        {:else}
          <LockOpen size={15} />
        {/if}
      </button>
      <button
        type="button"
        class="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        disabled={index === 0}
        onclick={onMoveUp}
        aria-label="Move question up"
      >
        <ChevronUp size={15} />
      </button>
      <button
        type="button"
        class="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        disabled={index === total - 1}
        onclick={onMoveDown}
        aria-label="Move question down"
      >
        <ChevronDown size={15} />
      </button>
      <button
        type="button"
        class="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
        onclick={onRemove}
        aria-label="Delete question"
      >
        <Trash2 size={15} />
      </button>
    </div>
  </div>

  {#if editing || !def.Preview}
    <def.Editor data={question.data} {onChange} {focusTarget} {onFocusHandled} />
  {:else}
    <def.Preview data={question.data} onFocus={onEnterEdit} />
  {/if}
</div>
