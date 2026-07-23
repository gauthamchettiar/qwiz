<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { Check, Code, Download, FolderOpen, Play, Plus, Tag as TagIcon, X } from '@lucide/svelte';
  import { categorySuggestions, tagSuggestions } from '@/lib/utils/suggestions';
  import { deleteQuiz, saveQuiz } from '@/lib/stores/quizzes';
  import { downloadTextFile, slugify } from '@/lib/utils/download';
  import {
    QUIZ_SETTING_RULES,
    QUIZ_SUGGESTED_SETTING_KEYS,
    parseQuizScriptFrontmatter,
    parseQuizScriptQuestion,
    serializeQuizScript,
    serializeQuizScriptFrontmatter,
    serializeQuizScriptQuestion,
    settingValueSuggestions,
    validateSettingValue,
    type QuizScriptFrontmatter,
    type QuizScriptQuestion
  } from '@/lib/utils/quizScript';
  import type { Quiz, QuizQuestion } from '@/lib/schemas/quiz';
  import type { FocusTarget } from '@/lib/utils/questionFocus';
  import Button from './Button.svelte';
  import ErrorList from './ErrorList.svelte';
  import CodeFrame from './CodeFrame.svelte';
  import SettingHelp from './SettingHelp.svelte';
  import SuggestionInput from './SuggestionInput.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import ConfirmDeleteButton from './ConfirmDeleteButton.svelte';

  // `initial` present = editing a previously saved quiz (see QuizEditPage.svelte); absent =
  // creating a brand-new one. Every field below is seeded from it once at mount (`untrack`, same
  // "read on mount, this form owns it from then on" convention already used for a question's own
  // form fields) rather than re-synced reactively — this component is the sole mutator of its own
  // state from here on.
  let { heading, initial }: { heading: string; initial?: Quiz } = $props();

  let title = $state(untrack(() => initial?.title ?? ''));
  let description = $state(untrack(() => initial?.description ?? ''));
  let category = $state(untrack(() => initial?.category ?? ''));
  let tags = $state<string[]>(untrack(() => [...(initial?.tags ?? [])]));
  // The editable form-mode representation (mirrors QuestionForm's own settingsList) — `quizSettings`
  // below is derived from this, the same "list is canonical, Record is a view of it" relationship
  // QuestionForm has between its settingsList and currentQuestion.settings.
  let settingsList = $state<{ key: string; value: string; _key: string }[]>(
    untrack(() =>
      Object.entries(initial?.settings ?? {}).map(([key, value]) => ({
        key,
        value: String(value),
        _key: crypto.randomUUID()
      }))
    )
  );
  const quizSettings = $derived(
    Object.fromEntries(
      settingsList
        .filter((s) => s.key.trim() !== '')
        .map((s) => [s.key, validateSettingValue(s.key, s.value, QUIZ_SETTING_RULES).value])
    )
  );
  let tagDraft = $state('');
  let errors = $state<string[]>([]);
  // No local "is this saved yet" state to track: `initial` alone answers it. Creating always
  // navigates to the real /local/edit?id=... URL on its first successful save (see save() below),
  // which remounts this component fresh with `initial` populated — so within a single component
  // instance, either `initial` was there from the start (editing) or this quiz doesn't exist in
  // the store yet at all (creating, not yet saved). There's no third state where a stale id needs
  // remembering across repeated saves.
  let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
  let saveFlashTimeout: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(saveFlashTimeout));

  const titleInvalid = $derived(errors.length > 0 && title.trim().length === 0);

  // Read on mount, not at module scope: the page is prerendered to static HTML, where the
  // localStorage half of the suggestions doesn't exist yet.
  let categoryPool = $state<string[]>([]);
  let tagPool = $state<string[]>([]);
  $effect(() => {
    categoryPool = categorySuggestions();
    tagPool = tagSuggestions();
  });

  // Suggestions render as our own dropdown rather than a native <datalist> popup: datalist
  // styling is entirely UA-controlled, and Safari in particular has a long-standing bug where
  // its popup ignores the page's `color-scheme` and just follows the OS appearance, which is
  // how you get unreadable light-on-light text with no way for us to override it from CSS.
  //
  // Suggestion buttons are all `tabindex="-1"` — Tab must skip straight to the next field, not
  // wander into the dropdown, and arrow keys drive a `*Highlight` index instead. This also
  // sidesteps a real bug: with the buttons left tabbable, Tab's target *was* the first
  // suggestion, but the `onblur` below closes (removes) the dropdown synchronously as part of
  // that same blur, so the browser loses its tab target mid-flight and gives up — landing on
  // <body>, or on whatever the previous field happened to be.
  let showCategoryDropdown = $state(false);
  let showTagDropdown = $state(false);
  let categoryHighlight = $state(-1);
  let tagHighlight = $state(-1);
  let categoryDropdownEl: HTMLDivElement | undefined;
  let tagDropdownEl: HTMLDivElement | undefined;

  const categoryDropdownOptions = $derived(
    categoryPool.filter((c) => c.includes(category.trim().toLowerCase()))
  );
  // A tag already on this quiz is not worth suggesting again — `addTag` would just no-op on it.
  const tagDropdownOptions = $derived(
    tagPool.filter((t) => !tags.includes(t) && t.includes(tagDraft.trim().toLowerCase()))
  );

  // Whenever the filtered list changes shape (typing, a selection, tags changing), whatever
  // index was highlighted may no longer make sense — drop back to "nothing highlighted".
  $effect(() => {
    void categoryDropdownOptions;
    categoryHighlight = -1;
  });
  $effect(() => {
    void tagDropdownOptions;
    tagHighlight = -1;
  });

  // Keeps the highlighted option in view once the list scrolls past `max-h-48`.
  $effect(() => {
    const idx = categoryHighlight;
    if (idx < 0) return;
    categoryDropdownEl?.querySelectorAll('button')[idx]?.scrollIntoView({ block: 'nearest' });
  });
  $effect(() => {
    const idx = tagHighlight;
    if (idx < 0) return;
    tagDropdownEl?.querySelectorAll('button')[idx]?.scrollIntoView({ block: 'nearest' });
  });

  /** Wraps an arrow-key move around the ends of a `length`-item list; -1 means "none highlighted". */
  function moveHighlight(current: number, length: number, delta: 1 | -1): number {
    if (length === 0) return -1;
    if (current === -1) return delta === 1 ? 0 : length - 1;
    return (current + delta + length) % length;
  }

  function selectCategory(value: string) {
    category = value;
    showCategoryDropdown = false;
  }

  function onCategoryKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      showCategoryDropdown = true;
      categoryHighlight = moveHighlight(
        categoryHighlight,
        categoryDropdownOptions.length,
        e.key === 'ArrowDown' ? 1 : -1
      );
    } else if (e.key === 'Enter' && categoryHighlight >= 0) {
      e.preventDefault();
      selectCategory(categoryDropdownOptions[categoryHighlight]);
    } else if (e.key === 'Escape') {
      showCategoryDropdown = false;
    }
  }

  function addTag(value?: string) {
    const t = (value ?? tagDraft).trim().toLowerCase();
    if (t && !tags.includes(t)) tags = [...tags, t];
    tagDraft = '';
  }

  function selectTagSuggestion(value: string) {
    addTag(value);
    showTagDropdown = false;
  }

  function onTagKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      showTagDropdown = true;
      tagHighlight = moveHighlight(
        tagHighlight,
        tagDropdownOptions.length,
        e.key === 'ArrowDown' ? 1 : -1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (tagHighlight >= 0) selectTagSuggestion(tagDropdownOptions[tagHighlight]);
      else addTag();
    } else if (e.key === 'Escape') {
      showTagDropdown = false;
    } else if (e.key === 'Backspace' && tagDraft === '' && tags.length) {
      removeTag(tags[tags.length - 1]);
    }
  }

  function removeTag(t: string) {
    tags = tags.filter((x) => x !== t);
  }

  function addSetting() {
    settingsList = [...settingsList, { _key: crypto.randomUUID(), key: '', value: '' }];
  }
  function removeSetting(key: string) {
    settingsList = settingsList.filter((s) => s._key !== key);
  }

  // --- Question editing: view / code / form -------------------------------------------------
  // At most one thing is ever in code or form mode — either the quiz metadata card (code mode
  // only; its "view" is just the fields above, always editable directly) or one question card
  // (code or form) — mirroring how everything else on the page renders read-only while that's
  // true.
  // Editing: start from the saved quiz's own questions. Creating: start empty — use "Add
  // question" or Import/"Load sample" to get started, rather than a fixed demo seed.
  let questions = $state<QuizQuestion[]>(untrack(() => initial?.questions ?? []));
  type ActiveEdit =
    { kind: 'meta' } | { kind: 'question'; questionId: string; mode: 'code' | 'form' };
  let activeEdit = $state<ActiveEdit | null>(null);
  // Only meaningful while activeEdit is meta or a question in code mode — lifted up here (rather
  // than living inside QuestionCard) because the keydown handler below needs to read and act on
  // it directly, and that handler must already live here to move `activeEdit` *across* cards for
  // Page nav.
  let activeDraft = $state('');
  let activeFocusTarget = $state<FocusTarget | null>(null);
  let metaTextareaEl: HTMLTextAreaElement | undefined = $state();
  const metaDraftErrors = $derived(
    activeEdit?.kind === 'meta' ? parseQuizScriptFrontmatter(activeDraft).errors : []
  );

  $effect(() => {
    if (activeEdit?.kind === 'meta') metaTextareaEl?.focus();
  });

  function currentFrontmatter(): QuizScriptFrontmatter {
    return { title, description, category, tags, settings: quizSettings };
  }

  /** Saves the current code draft if it parses cleanly; leaves it (and its errors) alone if
   * not. Every way of stepping away from an in-progress code edit — Page nav, clicking a
   * different card's code/view region, or Escape — funnels through this, so a valid edit is
   * never silently lost. Only a draft that's still genuinely broken when you try to leave gets
   * discarded (there's nothing sensible to save), and only Escape does that — every other exit
   * path just stays put and keeps showing the errors instead. */
  function commitActiveDraft(): boolean {
    if (!activeEdit) return true;
    if (activeEdit.kind === 'meta') {
      const { frontmatter, errors: draftErrors } = parseQuizScriptFrontmatter(activeDraft);
      if (draftErrors.length > 0) return false;
      title = frontmatter.title;
      description = frontmatter.description;
      category = frontmatter.category;
      tags = frontmatter.tags;
      settingsList = Object.entries(frontmatter.settings).map(([key, value]) => ({
        key,
        value: String(value),
        _key: crypto.randomUUID()
      }));
      return true;
    }
    if (activeEdit.mode !== 'code') return true;
    if (parseQuizScriptQuestion(activeDraft).errors.length > 0) return false;
    const id = activeEdit.questionId;
    questions = questions.map((q) => (q.id === id ? { ...q, code: activeDraft } : q));
    return true;
  }

  function enterMetaCode() {
    // Same close-toggle-on-reclick semantics as a question's <> button (see enterCode below).
    if (activeEdit?.kind === 'meta') {
      commitActiveDraft();
      activeEdit = null;
      return;
    }
    if (!commitActiveDraft()) return;
    activeEdit = { kind: 'meta' };
    activeDraft = serializeQuizScriptFrontmatter(currentFrontmatter());
  }

  function enterCode(questionId: string) {
    // The <> button doubles as a close toggle for the card it's already open on — same
    // save-if-valid/discard-if-not-but-always-exit semantics as Escape, not a silent no-op.
    if (
      activeEdit?.kind === 'question' &&
      activeEdit.questionId === questionId &&
      activeEdit.mode === 'code'
    ) {
      commitActiveDraft();
      activeEdit = null;
      return;
    }
    if (!commitActiveDraft()) return;
    activeEdit = { kind: 'question', questionId, mode: 'code' };
    activeDraft = questions.find((q) => q.id === questionId)?.code ?? '';
  }

  function enterForm(questionId: string, target: FocusTarget) {
    if (!commitActiveDraft()) return;
    activeEdit = { kind: 'question', questionId, mode: 'form' };
    activeFocusTarget = target;
  }

  // Form edits are always structurally valid by construction, so unlike code mode there's no
  // save gesture — every field change commits immediately.
  function commitForm(questionId: string, next: QuizScriptQuestion) {
    questions = questions.map((q) =>
      q.id === questionId ? { ...q, code: serializeQuizScriptQuestion(next) } : q
    );
  }

  // "choice: " (empty text) rather than a truly bare default: entering form mode right after
  // needs `question.variant` to already be "choice" so the variant <select> (which only ever
  // offers "choice" — see SELECTABLE_VARIANTS in QuestionForm) has something valid to show,
  // instead of landing on a value with no matching <option>.
  const BLANK_QUESTION_CODE = 'choice: \n{\n=\n~\n}';

  async function addQuestion() {
    if (!commitActiveDraft()) return;
    const blank: QuizQuestion = { id: crypto.randomUUID(), code: BLANK_QUESTION_CODE };
    questions = [...questions, blank];
    activeEdit = { kind: 'question', questionId: blank.id, mode: 'form' };
    activeFocusTarget = { field: 'text' };
    await tick();
    document
      .querySelector(`[data-question-id="${blank.id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function cloneQuestion(questionId: string) {
    const idx = questions.findIndex((q) => q.id === questionId);
    if (idx === -1) return;
    const clone: QuizQuestion = { id: crypto.randomUUID(), code: questions[idx].code };
    questions = [...questions.slice(0, idx + 1), clone, ...questions.slice(idx + 1)];
  }

  function deleteQuestion(questionId: string) {
    questions = questions.filter((q) => q.id !== questionId);
    if (activeEdit?.kind === 'question' && activeEdit.questionId === questionId) {
      activeEdit = null;
      activeDraft = '';
      activeFocusTarget = null;
    }
  }

  // Cards can change size when the active one moves (the wide code-mode layout leaves, another
  // one enters it), which would otherwise shift everything below the old card up or down on the
  // page. Recording where the old card sat on screen and re-scrolling by however much the new
  // one's position differs keeps it landing in that same spot. Works from either mode, staying
  // in whichever mode you're currently in — code mode's own textarea auto-focuses on entry (see
  // QuestionCard), and form mode lands on the question text field the same way.
  async function navigateQuestion(dir: 1 | -1) {
    if (!activeEdit) return;

    // Stepping PageUp off the first question moves into the quiz metadata card's own code mode
    // instead of silently doing nothing — metadata is a real "slot" before question 0, the same
    // way PageDown off the last question already just runs out of questions and stops. PageDown
    // the other way (off metadata, onto question 0) is the mirror of this.
    if (activeEdit.kind === 'meta') {
      if (dir !== 1) return;
      if (!commitActiveDraft()) return;
      const first = questions[0];
      if (!first) return;
      activeEdit = { kind: 'question', questionId: first.id, mode: 'code' };
      activeDraft = first.code;
      return;
    }
    if (activeEdit.mode === 'code' && !commitActiveDraft()) return;
    const idx = questions.findIndex((q) => q.id === activeEdit!.questionId);

    if (idx === 0 && dir === -1) {
      if (!commitActiveDraft()) return;
      activeEdit = { kind: 'meta' };
      activeDraft = serializeQuizScriptFrontmatter(currentFrontmatter());
      return;
    }

    const nextQuestion = questions[idx + dir];
    if (!nextQuestion) return;

    const beforeTop = document
      .querySelector(`[data-question-id="${activeEdit.questionId}"]`)
      ?.getBoundingClientRect().top;

    if (activeEdit.mode === 'code') {
      activeEdit = { kind: 'question', questionId: nextQuestion.id, mode: 'code' };
      activeDraft = nextQuestion.code;
    } else {
      activeEdit = { kind: 'question', questionId: nextQuestion.id, mode: 'form' };
      activeFocusTarget = { field: 'text' };
    }

    if (beforeTop === undefined) return;
    await tick();
    const afterTop = document
      .querySelector(`[data-question-id="${nextQuestion.id}"]`)
      ?.getBoundingClientRect().top;
    if (afterTop !== undefined) window.scrollBy(0, afterTop - beforeTop);
  }

  $effect(() => {
    function onKey(e: KeyboardEvent) {
      const inCodeMode =
        activeEdit?.kind === 'meta' ||
        (activeEdit?.kind === 'question' && activeEdit.mode === 'code');
      if (inCodeMode && (e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        commitActiveDraft();
        return;
      }
      if (activeEdit && e.key === 'PageDown') {
        e.preventDefault();
        navigateQuestion(1);
        return;
      }
      if (activeEdit && e.key === 'PageUp') {
        e.preventDefault();
        navigateQuestion(-1);
        return;
      }
      if (activeEdit && e.key === 'Escape') {
        commitActiveDraft(); // saves if valid; a no-op (true, mutates nothing) for form mode or an invalid draft
        activeEdit = null;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function validate(): string[] {
    const found: string[] = [];
    if (title.trim().length === 0) found.push('Title is required.');
    return found;
  }

  // Shared by Save and Play: commits whatever's still sitting in the tag input or an in-progress
  // metadata/question code or form edit (so nothing the author was still typing gets silently
  // dropped), validates, and writes to the store. Returns the saved quiz, or `null` if validation
  // failed — callers decide what to do next (Save flashes feedback or moves off /local/create;
  // Play needs a successful save before it can navigate at all, since playing anything other than
  // what's actually in the store would be showing stale content).
  function buildAndSaveQuiz(): Quiz | null {
    addTag();
    commitActiveDraft();

    errors = validate();
    if (errors.length > 0) return null;

    const now = new Date().toISOString();
    const quiz: Quiz = {
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      category: category.trim().toLowerCase(),
      tags,
      settings: quizSettings,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
      questions
    };

    if (!saveQuiz(quiz)) {
      errors = [
        "Couldn't save — your browser's storage might be full or unavailable (e.g. private browsing). Try removing a large image and saving again."
      ];
      return null;
    }
    return quiz;
  }

  function save() {
    const quiz = buildAndSaveQuiz();
    if (!quiz) return;

    // A brand-new quiz's first save is the moment it actually starts existing — /local/create is
    // no longer an accurate address for it, so move to the real edit URL (a fresh page load,
    // same as every other navigation in this app). Editing an existing quiz is already sitting on
    // that URL, so it just stays put and flashes the inline "Saved" feedback below instead.
    if (!initial) {
      window.location.href = `/local/edit?id=${quiz.id}`;
      return;
    }

    saveState = 'saved';
    clearTimeout(saveFlashTimeout);
    saveFlashTimeout = setTimeout(() => (saveState = 'idle'), 1500);
  }

  // Only reachable when `initial` is set (see the Play button below) — always saves first, so
  // playing reflects whatever's currently in the builder rather than whatever was last saved.
  function playNow() {
    if (!initial) return;
    const quiz = buildAndSaveQuiz();
    if (!quiz) return;
    window.location.href = `/local/play?id=${quiz.id}`;
  }

  // Downloads whatever's currently in the builder, valid or not — unlike Save, this never writes
  // to the quiz library, so there's nothing to protect by blocking on the title-required check.
  function downloadQwiz() {
    addTag();
    commitActiveDraft();
    const doc = serializeQuizScript(
      currentFrontmatter(),
      questions.map((q) => q.code)
    );
    downloadTextFile(`${slugify(title)}.qwiz`, doc);
  }

  // Only rendered when `initial` is set (see the footer markup) — Delete only ever appears on
  // the edit page, for a quiz that's confirmed to already exist in the store.
  function deleteThisQuiz() {
    if (!initial) return;
    if (!deleteQuiz(initial.id)) {
      errors = ["Couldn't delete — your browser's storage might be unavailable right now."];
      return;
    }
    window.location.href = '/';
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between gap-3">
    <h1 class="text-2xl font-bold text-slate-900">{heading}</h1>
    {#if initial}
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        onclick={playNow}
      >
        <Play size={15} /> Play
      </button>
    {/if}
  </div>

  <ErrorList {errors} />

  <div class="relative space-y-5 rounded-lg border border-slate-200 bg-white p-6">
    <button
      type="button"
      class="absolute right-full top-0 mr-2 rounded-md border border-slate-200 bg-white p-1.5 hover:bg-slate-50 {activeEdit?.kind ===
      'meta'
        ? 'bg-slate-100 text-slate-900'
        : 'text-slate-400'}"
      onclick={enterMetaCode}
      aria-label="Edit quiz code"
      title="Edit quiz code"
    >
      <Code size={15} />
    </button>

    {#if activeEdit?.kind === 'meta'}
      <div class="space-y-2">
        <textarea
          bind:this={metaTextareaEl}
          class="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          rows={Math.min(16, Math.max(6, activeDraft.split('\n').length))}
          value={activeDraft}
          oninput={(e) => (activeDraft = e.currentTarget.value)}></textarea>
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
          <span>Settings:</span>
          {#each QUIZ_SUGGESTED_SETTING_KEYS as key (key)}
            <span class="inline-flex items-center gap-0.5">
              {key}
              <SettingHelp {key} rules={QUIZ_SETTING_RULES} />
            </span>
          {/each}
        </div>
        {#each metaDraftErrors as error, index (index)}
          <CodeFrame {error} source={activeDraft} />
        {/each}
      </div>
    {:else}
      <div class="-mx-1 space-y-1">
        <input
          type="text"
          class="w-full rounded-md px-1 py-1 text-2xl font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 {titleInvalid
            ? 'border border-red-300 ring-1 ring-red-100'
            : 'border-0 bg-transparent'}"
          placeholder="Untitled quiz"
          aria-label="Title"
          bind:value={title}
        />
        <textarea
          class="w-full resize-none rounded-md border-0 bg-transparent px-1 py-1 text-sm text-slate-500 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
          rows="2"
          placeholder="Add a description…"
          aria-label="Description"
          bind:value={description}></textarea>
        <!-- Category and tags share the metadata row treatment: a muted leading icon (the only
           thing distinguishing them, since neither carries a visible label) and a borderless
           input that sits flush with the title/description above. -->
        <div class="flex items-center gap-1.5 px-1">
          <FolderOpen size={13} class="shrink-0 text-slate-400" />
          <!-- Free text with suggestions: they're a convenience, not a constraint, so authors can
             group quizzes under anything they like. -->
          <div class="relative min-w-[8rem] flex-1">
            <input
              id="category"
              type="text"
              class="w-full border-0 bg-transparent px-1 py-0.5 text-xs text-slate-600 placeholder:text-slate-300 focus:outline-none"
              placeholder="Add a category…"
              aria-label="Category"
              autocomplete="off"
              role="combobox"
              aria-expanded={showCategoryDropdown && categoryDropdownOptions.length > 0}
              bind:value={category}
              onfocus={() => (showCategoryDropdown = true)}
              onblur={() => (showCategoryDropdown = false)}
              onkeydown={onCategoryKeydown}
            />
            {#if showCategoryDropdown && categoryDropdownOptions.length > 0}
              <div
                bind:this={categoryDropdownEl}
                role="listbox"
                class="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-md"
              >
                {#each categoryDropdownOptions as option, i (option)}
                  <button
                    type="button"
                    tabindex="-1"
                    role="option"
                    aria-selected={i === categoryHighlight}
                    class="block w-full truncate px-3 py-1.5 text-left text-xs {i ===
                    categoryHighlight
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'}"
                    onmousedown={(e) => e.preventDefault()}
                    onclick={() => selectCategory(option)}
                  >
                    {option}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 px-1">
          <TagIcon size={13} class="shrink-0 text-slate-400" />
          {#each tags as tag (tag)}
            <span
              class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
            >
              {tag}
              <button
                type="button"
                onclick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                class="hover:text-slate-900"
              >
                <X size={12} />
              </button>
            </span>
          {/each}
          <div class="relative min-w-[8rem] flex-1">
            <input
              type="text"
              class="w-full border-0 bg-transparent px-1 py-0.5 text-xs text-slate-600 placeholder:text-slate-300 focus:outline-none"
              placeholder={tags.length ? 'Add tag…' : 'Add tags (press Enter)…'}
              aria-label="Add tag"
              autocomplete="off"
              role="combobox"
              aria-expanded={showTagDropdown && tagDropdownOptions.length > 0}
              bind:value={tagDraft}
              onfocus={() => (showTagDropdown = true)}
              onkeydown={onTagKeydown}
              onblur={() => {
                addTag();
                showTagDropdown = false;
              }}
            />
            {#if showTagDropdown && tagDropdownOptions.length > 0}
              <div
                bind:this={tagDropdownEl}
                role="listbox"
                class="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-md"
              >
                {#each tagDropdownOptions as option, i (option)}
                  <button
                    type="button"
                    tabindex="-1"
                    role="option"
                    aria-selected={i === tagHighlight}
                    class="block w-full truncate px-3 py-1.5 text-left text-xs {i === tagHighlight
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'}"
                    onmousedown={(e) => e.preventDefault()}
                    onclick={() => selectTagSuggestion(option)}
                  >
                    {option}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="space-y-1.5">
        <div
          class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-500"
        >
          <span>Settings</span>
          {#each QUIZ_SUGGESTED_SETTING_KEYS as key (key)}
            <span class="inline-flex items-center gap-0.5 font-normal text-slate-500">
              {key}
              <SettingHelp {key} rules={QUIZ_SETTING_RULES} />
            </span>
          {/each}
        </div>
        {#each settingsList as setting (setting._key)}
          {@const usedElsewhere = settingsList
            .filter((s) => s._key !== setting._key)
            .map((s) => s.key)}
          {@const valueSuggestions = settingValueSuggestions(setting.key, QUIZ_SETTING_RULES)}
          {@const validation = setting.key.trim()
            ? validateSettingValue(setting.key, setting.value, QUIZ_SETTING_RULES)
            : null}
          <div class="flex items-center gap-1.5">
            <select
              class="w-44 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              bind:value={setting.key}
              aria-label="Setting key"
            >
              <option value="">key</option>
              {#each QUIZ_SUGGESTED_SETTING_KEYS.filter((k) => !usedElsewhere.includes(k)) as k (k)}
                <option value={k}>{k}</option>
              {/each}
            </select>
            <SuggestionInput
              bind:value={setting.value}
              suggestions={valueSuggestions}
              placeholder="value"
              class="flex-1"
            />
            {#if setting.key.trim()}
              <SettingHelp key={setting.key} rules={QUIZ_SETTING_RULES} />
            {/if}
            <button
              type="button"
              class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100"
              onclick={() => removeSetting(setting._key)}
              aria-label="Remove setting"
            >
              <X size={13} />
            </button>
          </div>
          {#if validation?.error}
            <p class="pl-[11.5rem] text-xs text-red-600">{validation.error}</p>
          {/if}
        {/each}
        <button
          type="button"
          class="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          onclick={addSetting}
        >
          <Plus size={13} /> Add setting
        </button>
      </div>
    {/if}
  </div>

  <!-- Direct siblings of the metadata card in the page's own space-y-6, not a separately-spaced
       nested list — the metadata card and every question card are the same visual family (white
       rounded-lg bordered blocks), so they all get the same gap instead of the metadata-to-first-
       question gap (previously 24px, from space-y-6) differing from card-to-card (previously
       16px, from a nested space-y-4). -->
  {#each questions as question (question.id)}
    <QuestionCard
      {question}
      mode={activeEdit?.kind === 'question' && activeEdit.questionId === question.id
        ? activeEdit.mode
        : 'view'}
      draft={activeEdit?.kind === 'question' &&
      activeEdit.questionId === question.id &&
      activeEdit.mode === 'code'
        ? activeDraft
        : question.code}
      focusTarget={activeEdit?.kind === 'question' &&
      activeEdit.questionId === question.id &&
      activeEdit.mode === 'form'
        ? activeFocusTarget
        : null}
      onEnterCode={() => enterCode(question.id)}
      onEnterForm={(t) => enterForm(question.id, t)}
      onDraftChange={(v) => (activeDraft = v)}
      onCommitForm={(next) => commitForm(question.id, next)}
      onFocusHandled={() => (activeFocusTarget = null)}
      onClone={() => cloneQuestion(question.id)}
      onDelete={() => deleteQuestion(question.id)}
    />
  {/each}

  <button
    type="button"
    class="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
    onclick={addQuestion}
  >
    <Plus size={15} /> Add question
  </button>

  <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
    {#if saveState === 'saved'}
      <span
        transition:fade={{ duration: 200 }}
        class="flex items-center gap-1 text-sm font-medium text-green-600"
      >
        <Check size={15} /> Saved
      </span>
    {/if}
    {#if initial}
      <ConfirmDeleteButton variant="button" label="Delete quiz" onConfirm={deleteThisQuiz} />
    {/if}
    <Button onclick={downloadQwiz}>
      <Download size={15} /> Download .qwiz
    </Button>
    <Button variant="primary" onclick={save}>Save to this browser</Button>
  </div>
</div>
