<script lang="ts">
  import { untrack } from 'svelte';
  import { Plus } from '@lucide/svelte';
  import { defaultTriviaSettings, type QuestionInstance, type Trivia, type TriviaSettings } from '../types';
  import { questionTypeList, getQuestionType } from '../question-types/registry';
  import type { QuestionTypeDefinition } from '../question-types/types';
  import { getDraft, saveDraft, deleteDraft } from '../drafts';
  import { saveTrivia } from '../store';
  import { validateTriviaImport } from '../triviaSchema';
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
  let saving = $state(false);
  let showAddMenu = $state(false);
  let lockedQuestionId = $state<string | null>(null);
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

  function buildNewQuestionData(def: QuestionTypeDefinition): unknown {
    const lockedQuestion = lockedQuestionId ? questions.find((q) => q.id === lockedQuestionId) : undefined;
    if (lockedQuestion && lockedQuestion.type === def.type && def.cloneAsTemplate) {
      return def.cloneAsTemplate(lockedQuestion.data);
    }
    return def.createDefault();
  }

  function addQuestion(type: string) {
    const def = getQuestionType(type);
    const id = crypto.randomUUID();
    questions = [...questions, { id, type, data: buildNewQuestionData(def) }];
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

  // Switching an existing question's type is a plain reset to that type's blank default — the
  // "format lock" clone-as-template feature already covers deliberately carrying structure
  // forward, so type-switching stays simple and predictable.
  function switchQuestionType(id: string, newType: string) {
    const def = getQuestionType(newType);
    questions = questions.map((q) => (q.id === id ? { id: q.id, type: newType, data: def.createDefault() } : q));
  }

  function removeQuestion(id: string) {
    questions = questions.filter((q) => q.id !== id);
    if (lockedQuestionId === id) lockedQuestionId = null;
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

  function toggleLock(id: string) {
    lockedQuestionId = lockedQuestionId === id ? null : id;
  }

  function save() {
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
    const saved: Trivia = JSON.parse(JSON.stringify(draft));

    const result = validateTriviaImport(saved);
    if (!result.valid) {
      errors = result.errors;
      return;
    }
    errors = [];

    saving = true;
    saveTrivia(saved);
    if (draftId) deleteDraft(draftId);
    window.location.href = `/trivia?id=${saved.id}`;
  }
</script>

<div class="space-y-6" ondblclick={onBackgroundDoubleClick}>
  <div class="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <div class="-mx-1 space-y-1">
      <input
        type="text"
        class="w-full rounded-md border-0 bg-transparent px-1 py-1 text-2xl font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
      <TriviaSettingsEditor {settings} {totalMaxPoints} onChange={(s) => (settings = s)} />
    </div>
  </div>

  {#if errors.length > 0}
    <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <ul class="list-inside list-disc space-y-1">
        {#each errors as err}
          <li>{err}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="space-y-4">
    {#each questions as question, i (question.id)}
      <QuestionEditorCard
        {question}
        index={i}
        total={questions.length}
        locked={lockedQuestionId === question.id}
        editing={editingQuestionId === question.id}
        focusTarget={editingQuestionId === question.id ? pendingFocus : null}
        onChange={(data: unknown) => updateQuestion(question.id, data)}
        onRemove={() => removeQuestion(question.id)}
        onMoveUp={() => moveQuestion(question.id, -1)}
        onMoveDown={() => moveQuestion(question.id, 1)}
        onToggleLock={() => toggleLock(question.id)}
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

  <div class="relative">
    {#if showAddMenu}
      <div class="absolute inset-x-0 bottom-full z-10 mb-2 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
        <QuestionTypePicker types={questionTypeList} onSelect={addQuestion} />
      </div>
    {/if}

    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      onclick={onAddQuestionClick}
    >
      <Plus size={15} /> Add question
    </button>
  </div>

  <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
    <p class="text-xs text-slate-400">
      Saved only in this browser — download a JSON copy afterward for a permanent backup.
    </p>
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
