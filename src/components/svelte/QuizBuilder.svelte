<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import {
    Check,
    ChevronDown,
    ChevronRight,
    Code,
    Download,
    FolderOpen,
    Play,
    Plus,
    Tag as TagIcon,
    Trash2,
    X
  } from '@lucide/svelte';
  import { categorySuggestions, tagSuggestions } from '@/lib/utils/suggestions';
  import { deleteQuiz, saveQuiz } from '@/lib/stores/quizzes';
  import { downloadTextFile, slugify } from '@/lib/utils/download';
  import {
    QUIZ_FRONTMATTER_RULES,
    QUIZ_SUGGESTED_SETTING_KEYS,
    groupSettingKeys,
    parseQuizScriptQuestion,
    parseQwizFile,
    serializeQuizScript,
    serializeQuizScriptQuestion,
    settingDefaultValue,
    settingValueSuggestions,
    validateSettingValue,
    type QuizScriptFrontmatter,
    type QuizScriptQuestion
  } from '@/lib/utils/quizScript';
  import type { Quiz, QuizQuestion } from '@/lib/schemas/quiz';
  import type { FocusTarget } from '@/lib/utils/questionFocus';
  import Button from './Button.svelte';
  import ErrorList from './ErrorList.svelte';
  import CardMenu from './CardMenu.svelte';
  import LeaveGuard from './LeaveGuard.svelte';
  import SettingsDocsLink from './SettingsDocsLink.svelte';
  import SettingsLegend from './SettingsLegend.svelte';
  import SuggestionInput from './SuggestionInput.svelte';
  import QuestionCard from './QuestionCard.svelte';

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
  // Same disclosure as QuestionForm's — collapsed until asked for, but never over settings the
  // quiz already has. Matters more here: the quiz card offers sixteen keys to a question's eight.
  let settingsOpen = $state(untrack(() => settingsList.length > 0));
  const quizSettings = $derived(
    Object.fromEntries(
      settingsList
        .filter((s) => s.key.trim() !== '')
        .map((s) => [s.key, validateSettingValue(s.key, s.value, QUIZ_FRONTMATTER_RULES).value])
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
  // Which state the header menu's Delete item is in — reset by CardMenu's onClose, so it can
  // never linger armed on a menu that was dismissed.
  let confirmingDelete = $state(false);
  let leaveGuard: LeaveGuard | undefined = $state();
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
  let categoryDropdownEl: HTMLDivElement | undefined = $state();
  let tagDropdownEl: HTMLDivElement | undefined = $state();
  // One stable id per mount for each aria-controls relationship below. `$props.id()` may only be
  // called ONCE per component, so every id this component needs is suffixed off this single call
  // rather than each one asking for its own.
  const instanceId = $props.id();
  const categoryListboxId = `${instanceId}-category-listbox`;
  const tagListboxId = `${instanceId}-tag-listbox`;
  const settingsPanelId = `${instanceId}-settings`;

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

  /** Same as a question's (see QuestionForm's own `addSetting`): the first still-free key, with
   * its default value, rather than a blank row and a placeholder option pretending to be one. */
  function addSetting() {
    const used = settingsList.map((s) => s.key);
    const key = QUIZ_SUGGESTED_SETTING_KEYS.find((k) => !used.includes(k)) ?? '';
    settingsList = [
      ...settingsList,
      {
        _key: crypto.randomUUID(),
        key,
        value: settingDefaultValue(key, QUIZ_FRONTMATTER_RULES)
      }
    ];
  }
  function removeSetting(key: string) {
    settingsList = settingsList.filter((s) => s._key !== key);
  }
  /** Same reasoning as QuestionForm's own `selectSettingKey` — fills in the picked key's default
   * value, but only when the row's value is genuinely still blank. */
  /** Fires when a setting row's key <select> changes. Replaces the value with the new key's
   * default whenever the one already there wouldn't be valid for it — the normal case now that a
   * row starts pre-filled with a real key and its default rather than blank.
   *
   * A value that IS valid for the new key survives: switching between `reveal_answers` and
   * `reveal_scores` keeps `at_end`, which is nearly always what was meant. */
  function selectSettingKey(setting: { key: string; value: string }) {
    if (validateSettingValue(setting.key, setting.value, QUIZ_FRONTMATTER_RULES).error) {
      setting.value = settingDefaultValue(setting.key, QUIZ_FRONTMATTER_RULES);
    }
  }

  // --- Question editing: view / code / form -------------------------------------------------
  // At most one thing is ever in code or form mode — either the quiz metadata card (code mode
  // only; its "view" is just the fields above, always editable directly) or one question card
  // (code or form) — mirroring how everything else on the page renders read-only while that's
  // true.
  // Editing: start from the saved quiz's own questions. Creating: start empty — use "Add
  // question" or Import/"Load sample" to get started, rather than a fixed demo seed.
  let questions = $state<QuizQuestion[]>(untrack(() => initial?.questions ?? []));
  // No `meta` kind: the metadata card's <> button opens the WHOLE document now (see
  // `enterFileCode`), so there's no longer a mode that edits just the frontmatter. One "edit this
  // as source" affordance instead of two that looked identical and did different amounts.
  type ActiveEdit = { kind: 'question'; questionId: string; mode: 'code' | 'form' };
  let activeEdit = $state<ActiveEdit | null>(null);
  // Only meaningful while a question is in code mode — lifted up here (rather
  // than living inside QuestionCard) because the keydown handler below needs to read and act on
  // it directly, and that handler must already live here to move `activeEdit` *across* cards for
  // Page nav.
  let activeDraft = $state('');
  let activeFocusTarget = $state<FocusTarget | null>(null);
  function currentFrontmatter(): QuizScriptFrontmatter {
    return { title, description, category, tags, settings: quizSettings };
  }

  /** Everything the builder currently holds, as one `.qwiz` document — the same serialization
   * Download produces. Comparing two of these is how "are there unsaved changes" is answered:
   * field-by-field dirty flags would need one per field and would miss a question's code entirely,
   * whereas the document is by definition the whole of what a save persists.
   *
   * While the whole-document editor is open, its textarea IS the document, so that's what counts —
   * otherwise typing into it would read as no change at all. */
  function currentDocument(): string {
    if (fileDraft !== null) return fileDraft;
    return serializeQuizScript(
      currentFrontmatter(),
      questions.map((q) => q.code)
    );
  }

  /** Saves the current code draft if it parses cleanly; leaves it (and its errors) alone if
   * not. Every way of stepping away from an in-progress code edit — Page nav, clicking a
   * different card's code/view region, or Escape — funnels through this, so a valid edit is
   * never silently lost. Only a draft that's still genuinely broken when you try to leave gets
   * discarded (there's nothing sensible to save), and only Escape does that — every other exit
   * path just stays put and keeps showing the errors instead. */
  function commitActiveDraft(): boolean {
    if (!activeEdit) return true;
    if (activeEdit.mode !== 'code') return true;
    if (parseQuizScriptQuestion(activeDraft).errors.length > 0) return false;
    const id = activeEdit.questionId;
    questions = questions.map((q) => (q.id === id ? { ...q, code: activeDraft } : q));
    return true;
  }

  // --- Whole-file code mode -----------------------------------------------------------------
  // Deliberately NOT another `ActiveEdit` kind: that state machine is about which ONE card on the
  // page is open, and everything reading it (Page nav between cards, per-card view/code/form
  // rendering, the blocking-question error scroll) assumes the rest of the page is still there to
  // move around. This mode replaces the entire page body with one document, so it's a separate
  // flag that the card machinery simply never sees.
  //
  // `null` = not in whole-file mode. The draft is the same `.qwiz` text Download writes and
  // Import reads, so this is the third surface on the exact same format rather than a fourth
  // representation of a quiz.
  let fileDraft = $state<string | null>(null);

  // Declared after `fileDraft` on purpose: `currentDocument()` reads it, so seeding the snapshot
  // any earlier is a temporal-dead-zone error — one that only surfaces during Astro's SSR build,
  // where this component is executed for real rather than merely hydrated.
  //
  // Captured at mount (so an existing quiz starts clean, and a blank /local/create does too) and
  // reset after every successful save. `untrack` for the same reason every other seed here uses:
  // this is a starting value, not a subscription.
  let savedSnapshot = $state(untrack(() => currentDocument()));
  // An in-progress tag counts as unsaved: it's typed text a save would discard, and the tag input
  // is easy to leave without pressing Enter.
  const isDirty = $derived(currentDocument() !== savedSnapshot || tagDraft.trim() !== '');
  let fileTextareaEl: HTMLTextAreaElement | undefined = $state();
  const fileDraftErrors = $derived(fileDraft === null ? [] : parseQwizFile(fileDraft).errors);

  $effect(() => {
    if (fileDraft !== null) fileTextareaEl?.focus();
  });

  function enterFileCode() {
    // No toggle-to-close branch: this editor REPLACES the metadata card, taking its own "<>"
    // button off screen with it, so a re-click is unreachable. It closes through its own
    // Discard/Apply buttons instead — which is the right shape for an edit spanning the whole
    // quiz rather than one card.
    // A tag half-typed in the tag field, or a card still open in code mode, is state the document
    // has to include — otherwise it silently vanishes the moment the document is applied back.
    addTag();
    if (!commitActiveDraft()) return;
    activeEdit = null;
    fileDraft = serializeQuizScript(
      currentFrontmatter(),
      questions.map((q) => q.code)
    );
  }

  /** Parses the whole-document draft back into the builder's own state, leaving it open (with its
   * errors showing) if it doesn't parse — same save-if-valid contract as `commitActiveDraft`.
   *
   * Question ids are reused positionally rather than regenerated: an author who edits question 3
   * in the document hasn't replaced questions 1, 2 and 4, and handing those new ids on every apply
   * would churn identity for questions nothing touched. Ids are internal to this browser's storage
   * and absent from the `.qwiz` format itself, so position is the only correspondence there is. */
  function applyFileDraft(): boolean {
    if (fileDraft === null) return true;
    const { frontmatter, questionCodes, errors: draftErrors } = parseQwizFile(fileDraft);
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
    settingsOpen = settingsList.length > 0;
    questions = questionCodes.map((code, i) => ({
      id: questions[i]?.id ?? crypto.randomUUID(),
      code
    }));
    fileDraft = null;
    return true;
  }

  /** Leaves whole-file mode without applying anything — the escape hatch for a document edited
   * into a state that can't parse (or that the author simply changed their mind about). */
  function discardFileDraft() {
    fileDraft = null;
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

  // "pick_one: " (empty text) rather than a truly bare default: entering form mode right
  // after needs `question.variant` to already be one of SELECTABLE_VARIANTS in QuestionForm, or
  // the variant <select> lands on a value with no matching <option>. pick_one is the default
  // since most authored questions have exactly one correct option.
  const BLANK_QUESTION_CODE = 'pick_one: \n{\n=\n~\n}';

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

    // Page nav runs over the questions only. It used to treat the metadata card as a slot before
    // question 0, which no longer exists as a code mode of its own.
    if (activeEdit.mode === 'code' && !commitActiveDraft()) return;
    const idx = questions.findIndex((q) => q.id === activeEdit!.questionId);

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
      // Whole-file mode owns the whole page while it's open, so it answers these first — and only
      // the two that mean anything to it: there are no cards to Page between, and Escape leaving
      // silently would discard a document rather than one card's draft.
      if (fileDraft !== null) {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          applyFileDraft();
        }
        return;
      }
      const inCodeMode = activeEdit?.mode === 'code';
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

  let titleEl: HTMLInputElement | undefined = $state();
  let errorListEl: HTMLElement | undefined = $state();
  /** Which question card (if any) blocked the last save, so `focusFirstError` can scroll to it. */
  let blockingQuestionId = $state<string | null>(null);

  function validate(): string[] {
    const found: string[] = [];
    if (title.trim().length === 0) found.push('Title is required.');
    return found;
  }

  /** Puts the reason a save failed on screen and, where there's a field to fix, in the cursor.
   *
   * The Save button lives at the bottom of a page that's as long as the quiz, and the error list
   * is at the top — so before this, a save blocked by an empty title looked exactly like a save
   * that did nothing at all: no movement, no message in view, no indication the click registered. */
  function focusFirstError() {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduceMotion ? ('auto' as const) : ('smooth' as const);

    if (title.trim().length === 0) {
      titleEl?.scrollIntoView({ behavior, block: 'center' });
      titleEl?.focus();
      return;
    }
    if (blockingQuestionId) {
      document
        .querySelector(`[data-question-id="${blockingQuestionId}"]`)
        ?.scrollIntoView({ behavior, block: 'center' });
      return;
    }
    // No specific field to blame (a storage failure, say) — show the message itself instead.
    errorListEl?.scrollIntoView({ behavior, block: 'center' });
  }

  // Shared by Save and Play: commits whatever's still sitting in the tag input or an in-progress
  // metadata/question code or form edit (so nothing the author was still typing gets silently
  // dropped), validates, and writes to the store. Returns the saved quiz, or `null` if validation
  // failed — callers decide what to do next (Save flashes feedback or moves off /local/create;
  // Play needs a successful save before it can navigate at all, since playing anything other than
  // what's actually in the store would be showing stale content).
  function buildAndSaveQuiz(): Quiz | null {
    addTag();
    blockingQuestionId = null;

    // Same contract as the per-card drafts below, one level up: saving while the whole document is
    // open has to save the document, and must refuse rather than write the pre-edit quiz behind
    // the author's back if it doesn't parse.
    if (!applyFileDraft()) {
      errors = [
        "The .qwiz document has an error, so it wasn't saved. Fix it, or discard the edit to go back."
      ];
      focusFirstError();
      return null;
    }

    // A code draft that doesn't parse used to be silently left uncommitted while the save went
    // ahead — so the edit on screen simply wasn't in the saved quiz, with nothing said about it.
    if (!commitActiveDraft()) {
      blockingQuestionId = activeEdit?.questionId ?? null;
      errors = [
        "A question's code has an error, so it wasn't saved. Fix it or press Escape to discard the edit."
      ];
      focusFirstError();
      return null;
    }

    errors = validate();
    if (errors.length > 0) {
      focusFirstError();
      return null;
    }

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
      focusFirstError();
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
    savedSnapshot = currentDocument();
    if (!initial) {
      // Navigating away from a just-saved quiz — nothing left to warn about.
      leaveGuard?.release();
      window.location.href = `/local/edit?id=${quiz.id}`;
      return;
    }

    saveState = 'saved';
    clearTimeout(saveFlashTimeout);
    saveFlashTimeout = setTimeout(() => (saveState = 'idle'), 1500);
  }

  // Always saves first, so playing reflects whatever's currently in the builder rather than
  // whatever was last saved. On /local/create that save is also what MINTS the quiz — there's no
  // id to play until something exists in the store — so Play there creates the quiz as a side
  // effect, exactly as Save already does before it redirects to /local/edit.
  function playNow() {
    const quiz = buildAndSaveQuiz();
    if (!quiz) return;
    savedSnapshot = currentDocument();
    leaveGuard?.release();
    window.location.href = `/local/play?id=${quiz.id}`;
  }

  // Downloads whatever's currently in the builder, valid or not — unlike Save, this never writes
  // to the quiz library, so there's nothing to protect by blocking on the title-required check.
  function downloadQwiz() {
    // In whole-file mode the draft on screen already IS the document — download exactly that,
    // valid or not, rather than re-serializing the pre-edit state behind it.
    if (fileDraft !== null) {
      downloadTextFile(`${slugify(title)}.qwiz`, fileDraft);
      return;
    }
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
    // Deliberately leaving a quiz that no longer exists — warning about its unsaved edits would
    // be asking whether to keep changes to something just deleted.
    leaveGuard?.release();
    window.location.href = '/';
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between gap-3">
    <h1 class="text-2xl font-bold text-ink">{heading}</h1>
    <div class="flex shrink-0 items-center gap-2">
      <!-- Play is the one action worth a permanent button beside the menu: it's how you check
           what you just wrote, and it saves first (see `playNow`) so it never shows stale
           content. The whole-document Code button that used to sit here is gone — the same editor
           is reached from the <> beside the title, where it's next to the fields it replaces. -->
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-ink-inverse hover:bg-accent-hover"
        onclick={playNow}
      >
        <Play size={15} /> Play
      </button>
      <!-- Download and Delete: occasional, and neither reached often enough to earn a permanent
           button. Save is NOT here either — it stays at the end of the document, where you land
           after writing the thing you're saving, and one Save is less ambiguous than two. -->
      <CardMenu ariaLabel="More quiz actions" onClose={() => (confirmingDelete = false)}>
        {#snippet children(close)}
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-ink-muted hover:bg-surface"
            onclick={() => {
              downloadQwiz();
              close();
            }}
          >
            <Download size={15} /> Download .qwiz
          </button>
          {#if initial}
            <div class="my-1 border-t border-line-faint"></div>
            <!-- Same two-step confirm the quiz list uses, rather than a window.confirm: deleting
                 is the one item here with nothing to undo it. -->
            {#if confirmingDelete}
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded bg-negative px-2.5 py-1.5 text-left text-sm font-medium text-ink-inverse hover:bg-negative-hover"
                onclick={() => {
                  deleteThisQuiz();
                  close();
                }}
              >
                <Trash2 size={15} /> Confirm delete?
              </button>
            {:else}
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-negative-ink hover:bg-negative-surface"
                onclick={() => (confirmingDelete = true)}
              >
                <Trash2 size={15} /> Delete quiz
              </button>
            {/if}
          {/if}
        {/snippet}
      </CardMenu>
    </div>
  </div>

  <div bind:this={errorListEl}>
    <ErrorList {errors} />
  </div>

  {#if fileDraft !== null}
    <!-- Replaces the metadata card, every question card and Add question for as long as it's open:
         the document IS all of those, and leaving them on screen would mean two editable copies of
         the same quiz, only one of which is being typed into. -->
    <div class="space-y-3 rounded-lg border border-line-subtle bg-surface-raised p-6">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-medium text-ink-subtle">
          The whole quiz as <span class="font-mono">.qwiz</span> source — the details block and every
          question. Same format as Download and Import.
        </p>
        <div class="flex shrink-0 items-center gap-2">
          <Button onclick={discardFileDraft}>Discard</Button>
          <Button variant="primary" onclick={applyFileDraft}>Apply</Button>
        </div>
      </div>
      <textarea
        bind:this={fileTextareaEl}
        class="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-muted focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-subtle"
        rows={Math.min(40, Math.max(12, fileDraft.split('\n').length))}
        value={fileDraft}
        aria-label="Quiz .qwiz source"
        oninput={(e) => (fileDraft = e.currentTarget.value)}></textarea>
      <ErrorList errors={fileDraftErrors} />
    </div>
  {:else}
    <div class="relative space-y-5 rounded-lg border border-line-subtle bg-surface-raised p-6">
      <!-- Same `lg:`-gated absolute/in-flow switch as QuestionCard.svelte's button strip — see its
         comment for why: Base.astro's page container leaves no margin outside this card below
         `lg:` (1024px), so the button would otherwise be pushed off-screen on mobile. -->
      <!-- Opens the WHOLE .qwiz document, not just this card's frontmatter. There used to be two
           source editors that looked alike — this one, and a "Code" button in the page header —
           and the difference between "the details block" and "the entire quiz" was invisible
           until you were already in one. One editor, reached from the card whose fields it
           subsumes. -->
      <button
        type="button"
        class="mb-3 rounded-md border border-line-subtle bg-surface-raised p-1.5 text-ink-faint hover:bg-surface lg:absolute lg:right-full lg:top-0 lg:mb-0 lg:mr-2"
        onclick={enterFileCode}
        aria-label="Edit quiz code"
        title="Edit the whole quiz as .qwiz source"
      >
        <Code size={15} />
      </button>

      <div class="-mx-1 space-y-1">
        <input
          bind:this={titleEl}
          type="text"
          class="w-full rounded-md px-1 py-1 text-2xl font-bold text-ink placeholder:text-ink-ghost focus:outline-none focus:ring-2 focus:ring-line-subtle {titleInvalid
            ? 'border border-negative-line-subtle ring-1 ring-negative-surface-strong'
            : 'border-0 bg-transparent'}"
          placeholder="Untitled quiz"
          aria-label="Title"
          bind:value={title}
        />
        <textarea
          class="w-full resize-none rounded-md border-0 bg-transparent px-1 py-1 text-sm text-ink-subtle placeholder:text-ink-ghost focus:outline-none focus:ring-2 focus:ring-line-subtle"
          rows="2"
          placeholder="Add a description…"
          aria-label="Description"
          bind:value={description}></textarea>
        <!-- Category and tags share the metadata row treatment: a muted leading icon (the only
         thing distinguishing them, since neither carries a visible label) and a borderless
         input that sits flush with the title/description above. -->
        <div class="flex items-center gap-1.5 px-1">
          <FolderOpen size={13} class="shrink-0 text-ink-faint" />
          <!-- Free text with suggestions: they're a convenience, not a constraint, so authors can
           group quizzes under anything they like. -->
          <div class="relative min-w-[8rem] flex-1">
            <input
              id="category"
              type="text"
              class="w-full border-0 bg-transparent px-1 py-0.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none"
              placeholder="Add a category…"
              aria-label="Category"
              autocomplete="off"
              role="combobox"
              aria-expanded={showCategoryDropdown && categoryDropdownOptions.length > 0}
              aria-controls={categoryListboxId}
              bind:value={category}
              onfocus={() => (showCategoryDropdown = true)}
              onblur={() => (showCategoryDropdown = false)}
              onkeydown={onCategoryKeydown}
            />
            {#if showCategoryDropdown && categoryDropdownOptions.length > 0}
              <div
                bind:this={categoryDropdownEl}
                id={categoryListboxId}
                role="listbox"
                class="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-line-subtle bg-surface-raised py-1 shadow-md"
              >
                {#each categoryDropdownOptions as option, i (option)}
                  <button
                    type="button"
                    tabindex="-1"
                    role="option"
                    aria-selected={i === categoryHighlight}
                    class="block w-full truncate px-3 py-1.5 text-left text-xs {i ===
                    categoryHighlight
                      ? 'bg-surface-hover text-ink'
                      : 'text-ink-soft hover:bg-surface'}"
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
          <TagIcon size={13} class="shrink-0 text-ink-faint" />
          {#each tags as tag (tag)}
            <span
              class="inline-flex items-center gap-1 rounded-md bg-surface-hover px-2 py-0.5 text-xs font-medium text-ink-soft"
            >
              {tag}
              <button
                type="button"
                onclick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                class="hover:text-ink"
              >
                <X size={12} />
              </button>
            </span>
          {/each}
          <div class="relative min-w-[8rem] flex-1">
            <input
              type="text"
              class="w-full border-0 bg-transparent px-1 py-0.5 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none"
              placeholder={tags.length ? 'Add tag…' : 'Add tags (press Enter)…'}
              aria-label="Add tag"
              autocomplete="off"
              role="combobox"
              aria-expanded={showTagDropdown && tagDropdownOptions.length > 0}
              aria-controls={tagListboxId}
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
                id={tagListboxId}
                role="listbox"
                class="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-line-subtle bg-surface-raised py-1 shadow-md"
              >
                {#each tagDropdownOptions as option, i (option)}
                  <button
                    type="button"
                    tabindex="-1"
                    role="option"
                    aria-selected={i === tagHighlight}
                    class="block w-full truncate px-3 py-1.5 text-left text-xs {i === tagHighlight
                      ? 'bg-surface-hover text-ink'
                      : 'text-ink-soft hover:bg-surface'}"
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
        <!-- See QuestionForm's own comment on this disclosure for why the every-key legend is
           gone. -->
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="flex items-center gap-1 text-xs font-medium text-ink-subtle hover:text-ink-muted"
            aria-expanded={settingsOpen}
            aria-controls={settingsPanelId}
            onclick={() => (settingsOpen = !settingsOpen)}
          >
            {#if settingsOpen}
              <ChevronDown size={14} class="shrink-0" />
            {:else}
              <ChevronRight size={14} class="shrink-0" />
            {/if}
            Settings
            {#if settingsList.length > 0}
              <span class="rounded-full bg-surface-hover px-1.5 py-0.5 font-semibold text-ink-soft">
                {settingsList.length}
              </span>
            {/if}
          </button>
          <SettingsDocsLink />
        </div>
        <div id={settingsPanelId} class="space-y-1.5" hidden={!settingsOpen}>
          <SettingsLegend keys={QUIZ_SUGGESTED_SETTING_KEYS} rules={QUIZ_FRONTMATTER_RULES} />
          {#each settingsList as setting (setting._key)}
            {@const usedElsewhere = settingsList
              .filter((s) => s._key !== setting._key)
              .map((s) => s.key)}
            {@const valueSuggestions = settingValueSuggestions(setting.key, QUIZ_FRONTMATTER_RULES)}
            {@const validation = setting.key.trim()
              ? validateSettingValue(setting.key, setting.value, QUIZ_FRONTMATTER_RULES)
              : null}
            <!-- Same shape as a question's settings row (see QuestionForm): no per-row "?", and
                 the same 7rem key select. The wider `w-44` this used to have was enough on its
                 own to push the value field onto a second line on a phone, stranding the remove
                 "×" beside an otherwise empty row — quiz-wide keys are longer, but not so much
                 longer that the row should be laid out differently from the question's. -->
            <div class="flex flex-wrap items-center gap-1.5">
              <select
                class="w-28 max-w-full shrink-0 rounded-md border border-line px-2 py-1 text-xs text-ink focus:border-line-strong focus:outline-none"
                bind:value={setting.key}
                onchange={() => selectSettingKey(setting)}
                aria-label="Setting key"
              >
                <!-- Grouped, same as a question's — and it matters more here, since the quiz
                     block offers every key both tables have. -->
                {#each groupSettingKeys( QUIZ_SUGGESTED_SETTING_KEYS.filter((k) => !usedElsewhere.includes(k)), QUIZ_FRONTMATTER_RULES ) as group (group.label)}
                  <optgroup label={group.label}>
                    {#each group.keys as k (k)}
                      <option value={k}>{k}</option>
                    {/each}
                  </optgroup>
                {/each}
              </select>
              <SuggestionInput
                bind:value={setting.value}
                suggestions={valueSuggestions}
                placeholder="value"
                class="min-w-[6rem] flex-1"
              />
              <button
                type="button"
                class="shrink-0 rounded p-2 text-ink-subtle hover:bg-surface-hover"
                onclick={() => removeSetting(setting._key)}
                aria-label="Remove setting"
              >
                <X size={16} />
              </button>
            </div>
            {#if validation?.error}
              <!-- Lines up under the value field: the key select (7rem) plus its gap. -->
              <p class="break-words text-xs text-negative-ink sm:pl-[7.375rem]">
                {validation.error}
              </p>
            {/if}
          {/each}
          <button
            type="button"
            class="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:bg-surface"
            onclick={addSetting}
          >
            <Plus size={13} /> Add setting
          </button>
        </div>
      </div>
    </div>

    <!-- Direct siblings of the metadata card in the page's own space-y-6, not a separately-spaced
       nested list — the metadata card and every question card are the same visual family (white
       rounded-lg bordered blocks), so they all get the same gap instead of the metadata-to-first-
       question gap (previously 24px, from space-y-6) differing from card-to-card (previously
       16px, from a nested space-y-4). -->
    {#each questions as question (question.id)}
      <QuestionCard
        {question}
        {quizSettings}
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
      class="flex items-center gap-1 rounded-lg border border-dashed border-line px-4 py-3 text-sm font-medium text-ink-subtle hover:border-line-strong hover:text-ink-muted"
      onclick={addQuestion}
    >
      <Plus size={15} /> Add question
    </button>
  {/if}

  <!-- Only the save confirmation and one Save button now: Delete and Download moved up into the
       header's overflow menu, and a second Save at the bottom of a long page was the same action
       twice. Kept so a save made after scrolling doesn't mean scrolling back. -->
  <div class="flex items-center justify-end gap-3 border-t border-line-subtle pt-4">
    {#if saveState === 'saved'}
      <span
        transition:fade={{ duration: 200 }}
        class="flex items-center gap-1 text-sm font-medium text-positive-ink-soft"
      >
        <Check size={15} /> Saved
      </span>
    {/if}
    <Button variant="primary" onclick={save}>Save to this browser</Button>
  </div>
</div>

<!-- Nothing here is persisted until Save, so leaving with edits outstanding loses them outright —
     the same class of loss a run in progress faces, and the same guard. -->
<LeaveGuard
  bind:this={leaveGuard}
  active={isDirty}
  title="Leave without saving?"
  message="This quiz has changes that haven't been saved to this browser yet. Leaving now discards them."
  confirmLabel="Discard changes"
/>
