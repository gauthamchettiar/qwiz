<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import {
    Check,
    ChevronDown,
    ChevronRight,
    Code,
    Download,
    Link2,
    Play,
    Plus,
    Trash2,
    X
  } from '@lucide/svelte';
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
  import CodeEditor from './CodeEditor.svelte';
  import MetadataFields from './MetadataFields.svelte';
  import ThemeFields from './ThemeFields.svelte';
  import QuestionView from './QuestionView.svelte';
  import LeaveGuard from './LeaveGuard.svelte';
  import SettingsDocsLink from './SettingsDocsLink.svelte';
  import SettingsLegend from './SettingsLegend.svelte';
  import SuggestionInput from './SuggestionInput.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import ShareQuizDialog from './ShareQuizDialog.svelte';

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

  // Title/description/category/tags, and the two comboboxes that drive the last two, all live in
  // MetadataFields — shared with the group builder, which authors the same four frontmatter fields.
  let metadata: MetadataFields | undefined = $state();
  // The quiz's own look, as CSS. Held here rather than in the theme editor so it survives the
  // panel being collapsed and reopened, and so it round-trips through the whole-document editor
  // like every other part of the quiz.
  let themePreset = $state<string | undefined>(untrack(() => initial?.themePreset));
  let themeCss = $state<string | undefined>(untrack(() => initial?.themeCss));
  // `$props.id()` may only appear as a top-level declaration initializer, hence the two lines.
  const instanceId = $props.id();
  const settingsPanelId = `${instanceId}-settings`;

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
    // Passed unconditionally; `serializeQuizScriptFrontmatter` omits whichever of the two is
    // empty, and a quiz's look always travels with it.
    return { title, description, category, tags, settings: quizSettings, themePreset, themeCss };
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
  let fileEditor: CodeEditor | undefined = $state();
  let previewEl: HTMLElement | undefined = $state();
  /** 1-based source line the caret sits on, reported by the editor. */
  let caretLine = $state(1);

  /** Which question the caret is currently inside, as an index into `questions` — what the split
   * preview highlights and scrolls to.
   *
   * Derived from the DRAFT's own line structure rather than from `questions`, because the two
   * disagree the moment anything is typed: the preview shows the last applied document, but the
   * caret is in the text being edited. Questions are blank-line-separated blocks after the
   * frontmatter fence (see parseQwizFile), so counting blocks up to the caret is the whole rule.
   * `null` while the caret is in the frontmatter, where there's no question to point at. */
  const caretQuestionIndex = $derived.by(() => {
    if (fileDraft === null) return null;
    const lines = fileDraft.split('\n').slice(0, caretLine);
    let fences = 0;
    let index = -1;
    let inBlock = false;
    for (const line of lines) {
      if (/^---\s*$/.test(line)) {
        fences++;
        continue;
      }
      if (fences === 1) continue; // still inside the frontmatter
      if (line.trim() === '') inBlock = false;
      else if (!inBlock) {
        inBlock = true;
        index++;
      }
    }
    return index < 0 ? null : index;
  });

  // Scrolls the preview to whichever question the caret moved into. `block: 'nearest'` so a caret
  // moving within one question doesn't jerk the pane around, and only when that pane is actually
  // on screen — below `xl:` it's `display: none`, where scrollIntoView would do nothing useful.
  $effect(() => {
    const index = caretQuestionIndex;
    if (index === null || !previewEl || previewEl.offsetParent === null) return;
    previewEl
      .querySelector(`[data-preview-question="${index}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

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
  const fileDraftErrors = $derived(fileDraft === null ? [] : parseQwizFile(fileDraft).errors);

  function enterFileCode() {
    // No toggle-to-close branch: this editor REPLACES the metadata card, taking its own "<>"
    // button off screen with it, so a re-click is unreachable. It closes through its own
    // Discard/Apply buttons instead — which is the right shape for an edit spanning the whole
    // quiz rather than one card.
    // A tag half-typed in the tag field, or a card still open in code mode, is state the document
    // has to include — otherwise it silently vanishes the moment the document is applied back.
    metadata?.commitTagDraft();
    if (!commitActiveDraft()) return;
    activeEdit = null;
    fileDraft = serializeQuizScript(
      currentFrontmatter(),
      questions.map((q) => q.code)
    );
    caretLine = 1;
    // A document is read from the top, so that's where the caret starts — the browser would
    // otherwise restore it to the end of the text.
    tick().then(() => fileEditor?.focusStart());
  }

  /** Parses the whole-document draft back into the builder's own state, leaving it open (with its
   * errors showing) if it doesn't parse — same save-if-valid contract as `commitActiveDraft`.
   *
   * Question ids are reused positionally rather than regenerated: an author who edits question 3
   * in the document hasn't replaced questions 1, 2 and 4, and handing those new ids on every apply
   * would churn identity for questions nothing touched. Ids are internal to this browser's storage
   * and absent from the `.qwiz` format itself, so position is the only correspondence there is. */
  /** `close` distinguishes the two ways of applying. The tick means "done": commit and go back to
   * the cards. Ctrl+S means "render what I've written": commit and stay put, so the live preview
   * catches up while the caret keeps its place — which is the whole point of having a preview
   * beside the source rather than behind a mode switch. */
  function applyFileDraft(close = true): boolean {
    if (fileDraft === null) return true;
    const { frontmatter, questionCodes, errors: draftErrors } = parseQwizFile(fileDraft);
    if (draftErrors.length > 0) return false;

    title = frontmatter.title;
    description = frontmatter.description;
    category = frontmatter.category;
    tags = frontmatter.tags;
    themePreset = frontmatter.themePreset;
    themeCss = frontmatter.themeCss;
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
    if (close) fileDraft = null;
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
          applyFileDraft(false);
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
      metadata?.focusTitle(behavior);
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
    metadata?.commitTagDraft();
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
      themePreset,
      themeCss,
      // A quiz you authored in this browser is trusted outright: it's your own CSS, and being
      // asked whether to run it would be the app second-guessing you about your own work. Only a
      // quiz that arrived from somewhere else gets the prompt (see QuizPlayer).
      themeTrust: 'full',
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

  // Whatever's currently in the builder as one `.qwiz` document, valid or not — unlike Save,
  // neither export path writes to the quiz library, so there's nothing to protect by blocking on
  // the title-required check. In whole-file mode the draft on screen already IS the document, so
  // it's used exactly as typed rather than re-serializing the pre-edit state behind it.
  let shareDialog: ShareQuizDialog | undefined = $state();

  function currentDocumentForExport(): string {
    if (fileDraft !== null) return fileDraft;
    metadata?.commitTagDraft();
    commitActiveDraft();
    return serializeQuizScript(
      currentFrontmatter(),
      questions.map((q) => q.code)
    );
  }

  function downloadQwiz() {
    downloadTextFile(`${slugify(title)}.qwiz`, currentDocumentForExport());
  }

  // The size verdict lives in the dialog, not on this menu item: a document's compressed length —
  // the thing that decides whether it fits in a URL at all — isn't knowable without compressing it,
  // which is async. See ShareQuizDialog.
  function shareQwiz() {
    void shareDialog?.open(currentDocumentForExport());
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
    <h1 class="min-w-0 text-2xl font-bold text-ink">{heading}</h1>
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
              shareQwiz();
              close();
            }}
          >
            <Link2 size={15} /> Share link
          </button>
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
         the same quiz, only one of which is being typed into.

         `xl:` splits it into source and live preview. Below that the two would be too narrow to be
         either — a preview that can't show a question card isn't worth the half of the screen it
         costs — so a narrow viewport gets the editor alone, exactly as before. -->
    <!-- Breaks out to 150% of its own width at `xl:`, exactly as a question card in code mode
         does — see QuestionCard for why it's scaled off its own width rather than the viewport,
         and why `xl:` rather than `lg:`. It matters more here: this card holds two columns. -->
    <div
      class="space-y-3 rounded-lg border border-line-subtle bg-surface-raised p-6 xl:-mx-[25%] xl:w-[150%]"
    >
      <p class="text-xs font-medium text-ink-subtle">
        The whole quiz as <span class="font-mono">.qwiz</span> source — the details block and every question.
        Same format as Download and Import.
      </p>

      <!-- ONE height for both panes at `xl:`, rather than each finding its own. The editor used to
           size itself by line count (12–40 rows) and the preview by `70vh`, two unrelated rules
           that agreed only by accident — a short quiz left the preview taller than the editor, a
           long one the reverse. Both now fill this row and scroll internally, so they always line
           up. Below `xl:` there's no second pane, so the editor goes back to being sized by its
           content and stays resizable. -->
      <div class="grid grid-cols-1 gap-4 xl:h-[70vh] xl:grid-cols-2">
        <div class="relative flex min-h-0 flex-col gap-3">
          <!-- Apply and Discard as a tick and a cross, matching every question card's own button
               strip (see QuestionCard) with the same `lg:`-gated absolute/in-flow switch. Anchored
               to the EDITOR COLUMN, not the card: against the card it sat a paragraph's height
               too low, and a hand-tuned offset would drift the moment that paragraph wrapped. -->
          <div
            class="mb-3 flex items-center gap-1 lg:absolute lg:right-full lg:top-0 lg:mb-0 lg:mr-2 lg:flex-col"
          >
            <button
              type="button"
              class="rounded-md border border-line-subtle bg-surface-raised p-1.5 text-positive-ink-soft hover:bg-positive-surface"
              onclick={() => applyFileDraft()}
              aria-label="Apply changes"
              title="Apply changes (Ctrl+S)"
            >
              <Check size={15} />
            </button>
            <button
              type="button"
              class="rounded-md border border-line-subtle bg-surface-raised p-1.5 text-negative-ink hover:bg-negative-surface"
              onclick={discardFileDraft}
              aria-label="Discard changes"
              title="Discard changes"
            >
              <X size={15} />
            </button>
          </div>

          <!-- `min-h-0` on the wrapper: a flex child's default minimum is its content size, so
               without it a long document would push the editor past the row's height instead of
               scrolling inside it. -->
          <div class="min-h-0 flex-1">
            <CodeEditor
              bind:this={fileEditor}
              value={fileDraft}
              ariaLabel="Quiz .qwiz source"
              rows={Math.min(40, Math.max(12, fileDraft.split('\n').length))}
              fill
              onInput={(next) => (fileDraft = next)}
              onCaretLine={(line) => (caretLine = line)}
            />
          </div>
          <!-- Gated rather than always rendered: ErrorList draws nothing when empty, but an empty
               flex child still earns the column's `gap-3`, which left the editor 12px shorter than
               the preview whenever the document parsed. -->
          {#if fileDraftErrors.length > 0}
            <div class="max-h-40 shrink-0 overflow-y-auto">
              <ErrorList errors={fileDraftErrors} />
            </div>
          {/if}
        </div>

        <!-- The preview renders the LAST APPLIED document, not the draft: re-rendering on every
             keystroke would flash a wall of parse errors through half of every edit. Ctrl+S (or
             the tick) applies, and that's what moves it. -->
        <div
          bind:this={previewEl}
          class="hidden min-h-0 space-y-4 overflow-y-auto rounded-md border border-line-subtle bg-surface p-4 xl:block"
        >
          {#each questions as question, index (question.id)}
            <div
              data-preview-question={index}
              class="rounded-lg border p-3 transition-colors {index === caretQuestionIndex
                ? 'border-accent-line-subtle bg-accent-surface/40'
                : 'border-line-subtle bg-surface-raised'}"
            >
              <QuestionView question={parseQuizScriptQuestion(question.code).question} />
            </div>
          {:else}
            <p class="text-sm text-ink-subtle">
              Nothing to preview yet — the document has no questions.
            </p>
          {/each}
        </div>
      </div>
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

      <MetadataFields
        bind:this={metadata}
        bind:title
        bind:description
        bind:category
        bind:tags
        bind:tagDraft
        titlePlaceholder="Untitled quiz"
        {titleInvalid}
      />

      <!-- Above Settings and shaped identically to it: both are occasional, quiz-wide things, and
           a modal for one beside an inline panel for the other would have made them read as
           different kinds of thing. -->
      <div class="mt-3 space-y-1.5 border-t border-line-faint pt-3">
        <ThemeFields bind:preset={themePreset} bind:css={themeCss} />
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

<ShareQuizDialog bind:this={shareDialog} />

<!-- Nothing here is persisted until Save, so leaving with edits outstanding loses them outright —
     the same class of loss a run in progress faces, and the same guard. -->
<LeaveGuard
  bind:this={leaveGuard}
  active={isDirty}
  title="Leave without saving?"
  message="This quiz has changes that haven't been saved to this browser yet. Leaving now discards them."
  confirmLabel="Discard changes"
/>
