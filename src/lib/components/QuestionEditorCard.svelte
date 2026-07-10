<script lang="ts">
  import { ChevronUp, ChevronDown, Trash2, Lock, LockOpen } from '@lucide/svelte';
  import type { QuestionInstance } from '../types';
  import { getQuestionType, questionTypeList } from '../question-types/registry';
  import QuestionTypePicker from './QuestionTypePicker.svelte';

  let {
    question,
    index,
    total,
    locked,
    editing,
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
  class="rounded-lg border bg-white p-4 shadow-sm {editing
    ? 'ring-2 ring-indigo-100'
    : ''} {locked ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'}"
>
  <div class="mb-3 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold text-indigo-600">Question {index + 1}</span>
      <div class="relative">
        <button
          type="button"
          class="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
          onclick={() => (showTypeMenu = !showTypeMenu)}
        >
          {def.label}
        </button>
        {#if showTypeMenu}
          <div class="absolute z-10 mt-1 w-80 max-w-[90vw] rounded-md border border-slate-200 bg-white p-2 shadow-lg">
            <QuestionTypePicker types={questionTypeList} onSelect={selectType} />
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
