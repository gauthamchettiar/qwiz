<script lang="ts">
  import { untrack } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Plus, ChevronDown, Download, Play, X, Undo2, Redo2 } from '@lucide/svelte';
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
  import TriviaPlayer from './TriviaPlayer.svelte';
  import Button from './Button.svelte';
  import ErrorList from './ErrorList.svelte';

  let { initial, heading }: { initial?: Trivia; heading: string } = $props();

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
  let tags = $state<string[]>(untrack(() => [...(resumedDraft?.tags ?? initial?.tags ?? [])]));
  let tagDraft = $state('');
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
      else saveDraft({ id: draftId, title, description, questions, settings, tags, updatedAt: new Date().toISOString() });
    }, 800);
    return () => clearTimeout(timeout);
  });

  // --- Undo / redo ---------------------------------------------------------------------------
  // A history of serialized builder states. New states are pushed (debounced) as you edit;
  // undo/redo walk the stack. `applyingHistory` + the snapshot-equality check keep an applied
  // snapshot from being re-recorded as a fresh edit.
  let history = $state<string[]>([]);
  let histIdx = $state(0);
  let applyingHistory = false;

  function snapshot(): string {
    return JSON.stringify({ title, description, tags, questions, settings });
  }
  untrack(() => {
    history = [snapshot()];
    histIdx = 0;
  });

  $effect(() => {
    const snap = snapshot();
    if (applyingHistory) return;
    const t = setTimeout(() => {
      if (snap === history[histIdx]) return;
      const next = [...history.slice(0, histIdx + 1), snap];
      history = next.length > 100 ? next.slice(next.length - 100) : next;
      histIdx = history.length - 1;
    }, 400);
    return () => clearTimeout(t);
  });

  const canUndo = $derived(histIdx > 0);
  const canRedo = $derived(histIdx < history.length - 1);

  function applySnapshot(s: string) {
    const o = JSON.parse(s);
    applyingHistory = true;
    title = o.title;
    description = o.description;
    tags = o.tags;
    questions = o.questions;
    settings = o.settings;
    editingQuestionId = null;
    pendingFocus = null;
    queueMicrotask(() => (applyingHistory = false));
  }
  function undo() {
    if (!canUndo) return;
    histIdx -= 1;
    applySnapshot(history[histIdx]);
  }
  function redo() {
    if (!canRedo) return;
    histIdx += 1;
    applySnapshot(history[histIdx]);
  }

  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const el = document.activeElement;
      const editable = el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (editable) return; // leave native text undo alone while typing in a field
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
  // being edited back to its read-only preview. Bound to the window (not a template
  // ondblclick) so it also fires in the blank margins outside the centered column, not just
  // within this component's own content div.
  $effect(() => {
    function onBackgroundDoubleClick(e: MouseEvent) {
      if (!editingQuestionId) return;
      const target = e.target as HTMLElement;
      if (!target.closest('[data-question-card]')) {
        editingQuestionId = null;
        pendingFocus = null;
      }
    }
    window.addEventListener('dblclick', onBackgroundDoubleClick);
    return () => window.removeEventListener('dblclick', onBackgroundDoubleClick);
  });

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

  function addTag() {
    const t = tagDraft.trim().toLowerCase();
    if (t && !tags.includes(t)) tags = [...tags, t];
    tagDraft = '';
  }
  function removeTag(t: string) {
    tags = tags.filter((x) => x !== t);
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
      settings,
      ...(tags.length > 0 ? { tags } : {})
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

  // Lets the current draft/saved trivia be played as-is, without saving first. Snapshotting
  // into its own state (rather than handing the player a live reference) means editing while
  // the dialog is closed can't reach into an in-progress play session.
  let playSnapshot = $state<Trivia | null>(null);

  function openPlay() {
    playSnapshot = buildTrivia();
  }

  function closePlay() {
    playSnapshot = null;
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-slate-900">{heading}</h1>
    <div class="flex items-center gap-1.5">
      <button
        type="button"
        class="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canUndo}
        onclick={undo}
        aria-label="Undo"
        title="Undo (⌘Z)"
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        class="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canRedo}
        onclick={redo}
        aria-label="Redo"
        title="Redo (⌘⇧Z)"
      >
        <Redo2 size={16} />
      </button>
      <Button size="sm" onclick={openPlay}>
        <Play size={15} /> Play
      </Button>
    </div>
  </div>

  <ErrorList {errors} size="md" />

  <div class="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
    <div class="-mx-1 space-y-1">
      <input
        type="text"
        class="w-full rounded-md px-1 py-1 text-2xl font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 {titleInvalid
          ? 'border border-red-300 ring-1 ring-red-100'
          : 'border-0 bg-transparent'}"
        placeholder="Untitled trivia"
        bind:value={title}
      />
      <textarea
        class="w-full resize-none rounded-md border-0 bg-transparent px-1 py-1 text-sm text-slate-500 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
        rows="2"
        placeholder="Add a description…"
        bind:value={description}
      ></textarea>
      <div class="flex flex-wrap items-center gap-1.5 px-1">
        {#each tags as tag (tag)}
          <span class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {tag}
            <button type="button" onclick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`} class="hover:text-slate-900">
              <X size={12} />
            </button>
          </span>
        {/each}
        <input
          type="text"
          class="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-xs text-slate-600 placeholder:text-slate-300 focus:outline-none"
          placeholder={tags.length ? 'Add tag…' : 'Add tags (press Enter)…'}
          bind:value={tagDraft}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            } else if (e.key === 'Backspace' && tagDraft === '' && tags.length) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          onblur={addTag}
        />
      </div>
    </div>

    <div class="border-t border-slate-100 pt-5">
      <TriviaSettingsEditor
        {settings}
        {totalMaxPoints}
        questionCount={questions.length}
        invalid={settingsInvalid}
        onChange={(s) => (settings = s)}
      />
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
      <p class="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400">
        No questions yet. Add one below to get started.
      </p>
    {/if}
  </div>

  <div class="relative" use:clickOutside={() => (showAddMenu = false)}>
    {#if showAddMenu}
      <div
        class="absolute inset-x-0 bottom-full z-10 mb-3 rounded-lg border border-slate-200 bg-white p-3 shadow-md"
        transition:scale={{ duration: 120, start: 0.97, opacity: 0, easing: cubicOut }}
      >
        <QuestionTypePicker types={questionTypeList} onSelect={addQuestion} />
        <div class="absolute -bottom-1.5 left-5 size-3 rotate-45 border-b border-r border-slate-200 bg-white"></div>
      </div>
    {/if}

    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors {showAddMenu
        ? 'border-slate-400 bg-slate-100 text-slate-900'
        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}"
      onclick={onAddQuestionClick}
    >
      <Plus size={15} /> Add question
      <ChevronDown size={13} class="text-slate-400 transition-transform {showAddMenu ? 'rotate-180' : ''}" />
    </button>
  </div>

  <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
    <Button onclick={downloadCurrent}>
      <Download size={15} /> Download JSON
    </Button>
    <Button variant="primary" disabled={saving} onclick={save}>
      {saving ? 'Saving…' : 'Save to this browser'}
    </Button>
  </div>
</div>

{#if playSnapshot}
  <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 p-4">
    <div class="mx-auto max-w-2xl rounded-lg border border-slate-300 bg-white p-6 shadow-md">
      <div class="mb-4 flex items-center justify-between">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Playing draft</p>
        <button
          type="button"
          class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          onclick={closePlay}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
      <TriviaPlayer trivia={playSnapshot} />
    </div>
  </div>
{/if}
