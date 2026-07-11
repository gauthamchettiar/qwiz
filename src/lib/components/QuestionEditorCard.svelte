<script lang="ts">
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ChevronUp, ChevronDown, Code2, Copy } from '@lucide/svelte';
  import type { QuestionInstance } from '../types';
  import { getQuestionType, questionTypeList } from '../question-types/registry';
  import { clickOutside } from '../clickOutside';
  import QuestionTypePicker from './QuestionTypePicker.svelte';
  import QuestionCodeDialog from './QuestionCodeDialog.svelte';
  import ConfirmDeleteButton from './ConfirmDeleteButton.svelte';

  let {
    question,
    index,
    total,
    editing,
    invalid = false,
    focusTarget,
    onChange,
    onRemove,
    onMoveUp,
    onMoveDown,
    onReplace,
    onClone,
    onEnterEdit,
    onFocusHandled,
    onSwitchType
  }: {
    question: QuestionInstance;
    index: number;
    total: number;
    editing: boolean;
    invalid?: boolean;
    focusTarget?: unknown;
    onChange: (data: unknown) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onReplace: (question: QuestionInstance) => void;
    onClone: () => void;
    onEnterEdit: (target: unknown) => void;
    onFocusHandled: () => void;
    onSwitchType: (type: string) => void;
  } = $props();

  const def = $derived(getQuestionType(question.type));
  const ungraded = $derived(def.isUngraded?.(question.data) ?? false);
  let showTypeMenu = $state(false);
  let codeDialog: { open: () => void };

  function selectType(type: string) {
    showTypeMenu = false;
    if (type === question.type) return;
    onSwitchType(type);
  }
</script>

<div
  data-question-card
  class="rounded-lg border p-4 {invalid
    ? 'bg-white border-red-300 ring-2 ring-red-100'
    : editing
      ? 'bg-white border-slate-400'
      : ungraded
        ? 'bg-slate-100 border-slate-200'
        : 'bg-white border-slate-200'}"
>
  <div class="mb-3 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold text-slate-900">Question {index + 1}</span>
      <div class="relative" use:clickOutside={() => (showTypeMenu = false)}>
        <button
          type="button"
          class="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors {showTypeMenu
            ? 'border-slate-400 bg-slate-100 text-slate-900'
            : 'border-slate-200 text-slate-500 hover:bg-slate-50'}"
          onclick={() => (showTypeMenu = !showTypeMenu)}
        >
          {def.label}
          <ChevronDown size={11} class="text-slate-400 transition-transform {showTypeMenu ? 'rotate-180' : ''}" />
        </button>
        {#if showTypeMenu}
          <div
            class="absolute z-10 mt-3 w-[26rem] max-w-[90vw] rounded-lg border border-slate-200 bg-white p-3 shadow-md"
            transition:scale={{ duration: 120, start: 0.97, opacity: 0, easing: cubicOut }}
          >
            <QuestionTypePicker types={questionTypeList} onSelect={selectType} />
            <div class="absolute -top-1.5 left-5 size-3 rotate-45 border-l border-t border-slate-200 bg-white"></div>
          </div>
        {/if}
      </div>
      {#if ungraded}
        <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Not Graded</span>
      {/if}
    </div>
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="rounded p-1.5 text-slate-400 hover:bg-slate-100"
        onclick={() => codeDialog.open()}
        aria-label="Edit question JSON"
        title="Edit question JSON"
      >
        <Code2 size={15} />
      </button>
      <button
        type="button"
        class="rounded p-1.5 text-slate-400 hover:bg-slate-100"
        onclick={onClone}
        aria-label="Clone question"
        title="Clone question"
      >
        <Copy size={15} />
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
      <ConfirmDeleteButton onConfirm={onRemove} ariaLabel="Delete question" />
    </div>
  </div>

  {#if editing || !def.Preview}
    <def.Editor data={question.data} {onChange} {focusTarget} {onFocusHandled} />
  {:else}
    <def.Preview data={question.data} onFocus={onEnterEdit} />
  {/if}
</div>

<QuestionCodeDialog bind:this={codeDialog} {question} onApply={onReplace} />
