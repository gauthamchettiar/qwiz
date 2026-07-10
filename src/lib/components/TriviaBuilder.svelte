<script lang="ts">
  import { untrack } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Plus, ChevronDown, Download } from '@lucide/svelte';
  import { defaultTriviaSettings, type QuestionInstance, type Trivia, type TriviaSettings } from '../types';
  import { questionTypeList, getQuestionType } from '../question-types/registry';
  import { getDraft, saveDraft, deleteDraft } from '../drafts';
  import { saveTrivia } from '../store';
  import { validateTriviaImport } from '../triviaSchema';
  import { downloadJson, slugify } from '../download';
  import { clickOutside } from '../clickOutside';
  import QuestionEditorCard from './QuestionEditorCard.svelte';
  import QuestionTypePicker from './QuestionTypePicker.svelte';
  import TriviaSettingsEditor from './TriviaSettingsEditor.svelte';

  let { initial }: { initial?: Trivia } = $props();

  // `initial` only ever supplies the starting value (Astro passes it once, pre-hydration);
  // untrack documents that we intentionally don't want this to stay reactively bound to it.
  // Brand-new (unsaved) trivias get a stable local draftId for autosave, either resumed from
  // a ?draft=<id> URL param or freshly generated. Editing an existing trivia never drafts —
  // the server copy is the source of truth there.
  const resumedDraft = untrack(() => {
    if (initial || typeof window === 'undefined') return null;
    const draftId = new URLSearchParams(window.location.search).get('draft');
    return draftId ? getDraft(draftId) : null;
  });
  const draftId = untrack(() => resumedDraft?.id ?? (initial ? null : crypto.randomUUID()));

  let title = $state(untrack(() => resumedDraft?.title ?? initial?.title ?? ''));
  let description = $state(untrack(() => resumedDraft?.description ?? initial?.description ?? ''));
  // JSON round-trip rather than structuredClone: Svelte 5 wraps object/array props in
  // reactive proxies, and structuredClone throws DataCloneError on those. Trivia data is
  // always plain JSON (no Dates/Maps/etc.), so this is a safe, simple deep clone.
  let questions = $state<QuestionInstance[]>(
    untrack(() => JSON.parse(JSON.stringify(resumedDraft?.questions ?? initial?.questions ?? [])))
  );
  // Merged with defaults so editing a trivia saved before a settings field existed (e.g. the
  // newer theme colors) shows every control populated, ready to save forward.
  let settings = $state<TriviaSettings>(
    untrack(() => ({ ...defaultTriviaSettings(), ...(resumedDraft?.settings ?? initial?.settings) }))
  );
  let errors = $state<string[]>([]);
  let errorPaths = $state<string[]>([]);
  let saving = $state(false);

  // Derived from `errorPaths` so a failed save visibly points at the offending field/card,
  // instead of just listing messages the user has to cross-reference themselves.
  const titleInvalid = $derived(errorPaths.includes('/title'));
  const settingsInvalid = $derived(errorPaths.some((p) => p.startsWith('/settings')));
  const invalidQuestionIndices = $derived(
    new Set(
      errorPaths
        .filter((p) => p.startsWith('/questions/'))
        .map((p) => Number(p.split('/')[2]))
        .filter((n) => Number.isInteger(n))
    )
  );
  let showAddMenu = $state(false);
  // Only one question is ever in edit mode; every other card shows its read-only,
  // player-styled Preview. `pendingFocus` is opaque here — only the owning type's Editor
  // interprets it (see the QuestionTypeDefinition.Preview/Editor contract).
  let editingQuestionId = $state<string | null>(null);
  let pendingFocus = $state<unknown>(null);

  // Debounced local autosave for brand-new trivias only, so an accidental tab close doesn't
  // lose in-progress work before the first real "Save trivia". Skips (and clears out) empty
  // drafts — no point cluttering the home page with an untouched "Untitled trivia".
  $effect(() => {
    if (!draftId) return;
    const isEmpty = title.trim().length === 0 && description.trim().length === 0 && questions.length === 0;
    const timeout = setTimeout(() => {
      if (isEmpty) deleteDraft(draftId);
      else saveDraft({ id: draftId, title, description, questions, settings, updatedAt: new Date().toISOString() });
    }, 800);
    return () => clearTimeout(timeout);
  });

  const totalMaxPoints = $derived(
    questions.reduce((sum, q) => {
      const def = getQuestionType(q.type);
      return sum + def.grade(q.data, {}).max;
    }, 0)
  );

  function addQuestion(type: string) {
    const def = getQuestionType(type);
    const id = crypto.randomUUID();
    questions = [...questions, { id, type, data: def.createDefault() }];
    showAddMenu = false;
    // New questions open straight into edit mode, focused per the type's own default.
    editingQuestionId = id;
    pendingFocus = def.defaultFocusTarget?.() ?? null;
  }

  function enterEdit(questionId: string, target: unknown) {
    editingQuestionId = questionId;
    pendingFocus = target;
  }

  // Double-clicking anywhere that isn't inside a question card collapses whichever one is
  // being edited back to its read-only preview.
  function onBackgroundDoubleClick(e: MouseEvent) {
    if (!editingQuestionId) return;
    const target = e.target as HTMLElement;
    if (!target.closest('[data-question-card]')) {
      editingQuestionId = null;
      pendingFocus = null;
    }
  }

  function onAddQuestionClick() {
    showAddMenu = !showAddMenu;
  }

  function updateQuestion(id: string, data: unknown) {
    questions = questions.map((q) => (q.id === id ? { ...q, data } : q));
  }

  // Switching an existing question's type is a plain reset to that type's blank default —
  // keeps type-switching simple and predictable rather than trying to carry structure forward.
  function switchQuestionType(id: string, newType: string) {
    const def = getQuestionType(newType);
    questions = questions.map((q) => (q.id === id ? { id: q.id, type: newType, data: def.createDefault() } : q));
  }

  // Replaces a question wholesale (id kept, type and data taken as-is) — used by the per-question
  // "Edit JSON" dialog, which can change type as well as data.
  function replaceQuestion(question: QuestionInstance) {
    questions = questions.map((q) => (q.id === question.id ? question : q));
  }

  // Deep-copies a question (including its options, points, extras — everything) into a new
  // question right after the original, so duplicating a mostly-similar question is one click.
  function cloneQuestion(id: string) {
    const idx = questions.findIndex((q) => q.id === id);
    if (idx === -1) return;
    const source = questions[idx];
    const cloned: QuestionInstance = { id: crypto.randomUUID(), type: source.type, data: JSON.parse(JSON.stringify(source.data)) };
    questions = [...questions.slice(0, idx + 1), cloned, ...questions.slice(idx + 1)];
  }

  function removeQuestion(id: string) {
    questions = questions.filter((q) => q.id !== id);
    if (editingQuestionId === id) editingQuestionId = null;
  }

  function moveQuestion(id: string, dir: -1 | 1) {
    const idx = questions.findIndex((q) => q.id === id);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= questions.length) return;
    const copy = [...questions];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    questions = copy;
  }

  function buildTrivia(): Trivia {
    const now = new Date().toISOString();
    const draft: Trivia = {
      id: initial?.id ?? crypto.randomUUID(),
      title,
      description,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      questions,
      settings
    };
    // Round-trip through JSON so this checks exactly what Import JSON checks — the builder's
    // in-memory question data can carry `undefined` placeholders (e.g. unset optional option
    // fields) that plain JSON never has, and shouldn't affect validity either way.
    return JSON.parse(JSON.stringify(draft));
  }

  function save() {
    const saved = buildTrivia();
    const result = validateTriviaImport(saved);
    if (!result.valid) {
      errors = result.errors;
      errorPaths = result.paths;
      return;
    }
    errors = [];
    errorPaths = [];

    saving = true;
    saveTrivia(saved);
    if (draftId) deleteDraft(draftId);
    window.location.href = `/local/trivia?id=${saved.id}`;
  }

  function downloadCurrent() {
    downloadJson(`${slugify(title)}.json`, buildTrivia());
  }
</script>

<div class="space-y-6" ondblclick={onBackgroundDoubleClick}>
  {#if errors.length > 0}
    <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <ul class="list-inside list-disc space-y-1">
        {#each errors as err}
          <li>{err}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <div class="-mx-1 space-y-1">
      <input
        type="text"
        class="w-full rounded-md px-1 py-1 text-2xl font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 {titleInvalid
          ? 'border border-red-300 ring-1 ring-red-100'
          : 'border-0 bg-transparent'}"
        placeholder="Untitled trivia"
        bind:value={title}
      />
      <textarea
        class="w-full resize-none rounded-md border-0 bg-transparent px-1 py-1 text-sm text-slate-500 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        rows="2"
        placeholder="Add a description…"
        bind:value={description}
      ></textarea>
    </div>

    <div class="border-t border-slate-100 pt-5">
      <TriviaSettingsEditor {settings} {totalMaxPoints} invalid={settingsInvalid} onChange={(s) => (settings = s)} />
    </div>
  </div>

  <div class="space-y-4">
    {#each questions as question, i (question.id)}
      <QuestionEditorCard
        {question}
        index={i}
        total={questions.length}
        editing={editingQuestionId === question.id}
        invalid={invalidQuestionIndices.has(i)}
        focusTarget={editingQuestionId === question.id ? pendingFocus : null}
        onChange={(data: unknown) => updateQuestion(question.id, data)}
        onRemove={() => removeQuestion(question.id)}
        onMoveUp={() => moveQuestion(question.id, -1)}
        onMoveDown={() => moveQuestion(question.id, 1)}
        onReplace={replaceQuestion}
        onClone={() => cloneQuestion(question.id)}
        onEnterEdit={(target) => enterEdit(question.id, target)}
        onFocusHandled={() => (pendingFocus = null)}
        onSwitchType={(type) => switchQuestionType(question.id, type)}
      />
    {/each}

    {#if questions.length === 0}
      <p class="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        No questions yet. Add one below to get started.
      </p>
    {/if}
  </div>

  <div class="relative" use:clickOutside={() => (showAddMenu = false)}>
    {#if showAddMenu}
      <div
        class="absolute inset-x-0 bottom-full z-10 mb-3 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        transition:scale={{ duration: 120, start: 0.97, opacity: 0, easing: cubicOut }}
      >
        <QuestionTypePicker types={questionTypeList} onSelect={addQuestion} />
        <div class="absolute -bottom-1.5 left-5 size-3 rotate-45 border-b border-r border-slate-200 bg-white"></div>
      </div>
    {/if}

    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors {showAddMenu
        ? 'border-indigo-300 bg-indigo-50/60 text-indigo-700'
        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
      onclick={onAddQuestionClick}
    >
      <Plus size={15} /> Add question
      <ChevronDown size={13} class="text-slate-400 transition-transform {showAddMenu ? 'rotate-180' : ''}" />
    </button>
  </div>

  <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      onclick={downloadCurrent}
    >
      <Download size={15} /> Download JSON
    </button>
    <button
      type="button"
      class="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      disabled={saving}
      onclick={save}
    >
      {saving ? 'Saving…' : 'Save to this browser'}
    </button>
  </div>
</div>
