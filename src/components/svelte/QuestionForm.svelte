<script lang="ts">
  import { untrack } from 'svelte';
  import {
    Image,
    Plus,
    Type,
    Video as VideoIcon,
    Eye,
    X,
    ChevronDown,
    ChevronRight,
    GripVertical
  } from '@lucide/svelte';
  import { draggable, type DragState } from '@/lib/utils/dragDrop';
  import { sanitizeNumericInput } from '@/lib/utils/numericInput';
  import {
    parseQuizScriptQuestion,
    serializeQuizScriptQuestion,
    settingDefaultValue,
    settingValueSuggestions,
    suggestedSettingKeysForVariant,
    validateSettingValue,
    type QuizScriptOptionContent,
    type QuizScriptQuestion
  } from '@/lib/utils/quizScript';
  import { isGuessableChar } from '@/lib/utils/grading';
  import type { FocusTarget } from '@/lib/utils/questionFocus';
  import SuggestionInput from './SuggestionInput.svelte';
  import ErrorList from './ErrorList.svelte';
  import SettingsDocsLink from './SettingsDocsLink.svelte';
  import SettingsLegend from './SettingsLegend.svelte';
  import KindPicker from './KindPicker.svelte';

  // "question" isn't offered here — it's not a real variant, just what a question gets by not
  // declaring anything (see KNOWN_VARIANTS in quizScript.ts). More real variants can be added to
  // this list as they're actually built.
  const SELECTABLE_VARIANTS = [
    'pick_one',
    'pick_many',
    'type_answer',
    'type_pattern',
    'guess_letters',
    'order_items',
    'match_pairs',
    'group_items',
    'fill_blanks'
  ];

  // "Elements" is one unified list in form mode (image/video/reveal, switchable per row, same
  // idea as quizare's extras editor) even though the underlying data keeps them in two separate
  // arrays (`media`/`extras`) — see `currentQuestion` below for the split on the way back out.
  type ElementItem =
    | { _key: string; kind: 'image'; alt: string; url: string }
    | { _key: string; kind: 'video'; alt: string; url: string }
    | { _key: string; kind: 'reveal'; label: string; content: string; points: string };

  // The choices each KindPicker offers — see that component for why these are an icon dropdown
  // rather than a native <select> or a row of visible buttons.
  //
  // OPTION_KINDS drives both halves of an option row: its own content, and — on `match_pairs` —
  // the target it pairs with. Adding a row always makes a text one; the picker is how it becomes
  // a picture, which keeps that a reversible choice rather than one made before there's anything
  // to look at.
  const OPTION_KINDS = [
    { value: 'text', label: 'Text', icon: Type },
    { value: 'image', label: 'Image', icon: Image },
    { value: 'video', label: 'Video', icon: VideoIcon }
  ] as const;
  const ELEMENT_KINDS = [
    { value: 'image', label: 'Image', icon: Image },
    { value: 'video', label: 'Video', icon: VideoIcon },
    { value: 'reveal', label: 'Reveal', icon: Eye }
  ] as const;

  /** Every control in an option/element row shares this height, so the row reads as one band
   * instead of a stack of differently-sized boxes. Kept as one string rather than repeated per
   * control precisely because "they all match" is the entire point — a control that opts out is a
   * bug, and this makes that visible in the diff. */
  const ROW_CONTROL = 'h-9 shrink-0';
  /** The same height for a row's text FIELDS, but shrinkable — `shrink-0` on these is what would
   * push a nowrap row wider than its card. `min-w-0` because a flex item's default minimum is its
   * content width, which for an input is its `size` attribute, not zero. */
  const ROW_FIELD = 'h-9 min-w-0';
  const ROW_ICON_BUTTON = `${ROW_CONTROL} w-9 flex items-center justify-center rounded-md`;
  /** A checkbox/radio can't be stretched to the row height without distorting the control itself,
   * so it gets a same-height box to sit centred in instead — which also gives the 16px control a
   * 36px hit area. */
  const ROW_CHECK_SLOT = `${ROW_CONTROL} w-6 flex items-center justify-center`;

  /** A row's content fields. `grow basis-0 min-w-0` so they take whatever space the row's fixed
   * controls leave and give it all back when there isn't any. */
  const ROW_FIELDS = 'flex min-w-0 grow basis-0 items-center gap-1.5';
  /** The `pts` + remove pair every row ends with, pinned to the right. */
  const ROW_TRAILING = 'ml-auto flex shrink-0 items-center gap-1.5';

  /** Every row in a list — an option, an accepted answer, an element — is its own tinted card.
   * As bare controls on the page background they ran together: on a `match_pairs` row that's six
   * controls with nothing saying where one pair ends and the next begins.
   *
   * `flex-nowrap`: a row is ONE line at every width, and its fields shrink as far as they have to
   * — a narrow text box is better than a reflowed row. Both ways of wrapping were tried and both
   * looked worse than a cramped field: dropping the fields below left a first line holding a grip,
   * a checkbox and a stretch of whitespace, and dropping `pts`/`×` below left the same whitespace
   * on the second line instead. The fixed controls come to ~16rem on the widest row, so even a
   * phone leaves the fields something; they can't push the card wide either, since every one of
   * them is `min-w-0`. */
  const ROW_CARD = 'flex flex-nowrap items-center gap-1.5 rounded-md border p-1.5';
  const ROW_CARD_RESTING = 'border-slate-200 bg-slate-50/70';

  /** One option row's card colours as a SINGLE mutually-exclusive class string — see
   * QuestionPlayer's `choiceOptionTone` for why layering a base and an override silently resolves
   * whichever way Tailwind happened to order the two utilities. */
  function optionRowTone(index: number): string {
    if (optionDrag?.id === index) return 'border-indigo-300 bg-indigo-50/50 opacity-40';
    if (optionDrag?.overZone === index) return 'border-indigo-400 bg-indigo-50';
    return ROW_CARD_RESTING;
  }

  function blankElement(kind: 'image' | 'video' | 'reveal'): ElementItem {
    return kind === 'reveal'
      ? { _key: crypto.randomUUID(), kind: 'reveal', label: '', content: '', points: '0' }
      : { _key: crypto.randomUUID(), kind, alt: '', url: '' };
  }

  let {
    question,
    focusTarget,
    onChange,
    onFocusHandled
  }: {
    question: QuizScriptQuestion;
    focusTarget?: FocusTarget | null;
    onChange: (next: QuizScriptQuestion) => void;
    onFocusHandled: () => void;
  } = $props();

  // Mounted fresh every time a card enters form mode (see QuestionCard's {#if mode === 'form'}),
  // and this form is the sole mutator of `question` while mounted — so a one-time local copy,
  // kept in sync purely by our own `emit()`, is safe and avoids external-prop echo disrupting
  // in-progress typing (matching how QuizBuilder's own title/description fields work).
  let variant = $state(untrack(() => question.variant));
  // A typed question's options are accepted answers, not right/wrong choices — every one is
  // implicitly correct and plain text (see quizScript.ts's parseQuestionBlock), so the options
  // list below renders a simpler row for it: no correct checkbox, no image/video kind picker.
  const isTyped = $derived(variant === 'type_answer');
  // guess_letters's single accepted answer is exactly as plain-text-only as typed's — it just
  // additionally supports pre-revealing characters for free (`[X]` bracket markers in code mode —
  // see quizScript.ts's parsePrerevealedText/insertPrerevealMarkers). Form mode doesn't parse
  // brackets out of the live text field itself (that would mean re-deriving `prerevealed` on every
  // keystroke without ever going stale relative to text still mid-edit, risking a pre-reveal
  // position silently pointing at the wrong character) — instead it renders a separate row of
  // per-letter toggle buttons below the answer field, operating directly on the already-structured
  // `prerevealed` array (see `togglePrereveal`), so no bracket-parsing is needed either way.
  const isCharacterInput = $derived(variant === 'guess_letters');
  // Regex patterns, one per row. Plain text like an accepted answer (so no image/video picker), but
  // it KEEPS the correct checkbox: a `~` pattern is a deliberate "mark this response wrong", not a
  // distractor to ignore — see parseQuestionBlock's own type_pattern branch.
  const isPattern = $derived(variant === 'type_pattern');
  // Both variants get the same simplified "one plain-text row per accepted answer" treatment.
  const usesAnswerRows = $derived(isTyped || isCharacterInput);
  // A pick_one question's "correct" marker renders as a radio group instead of independent
  // checkboxes, so an author can't accidentally mark two options correct in form mode in the
  // first place — code mode still catches it via formErrors below either way, but this avoids the
  // mistake happening at all rather than just reporting it after the fact.
  const isSingleChoice = $derived(variant === 'pick_one');
  // order has no right/wrong item, only a right/wrong POSITION (every option is forced
  // `correct: true` at parse time — see quizScript.ts) — so its option rows keep the image/video
  // kind picker (ordering pictures is a real use case) but drop the correct checkbox/radio
  // entirely, and reuse the existing move-up/move-down buttons as the actual authoring mechanism
  // for the correct order: whatever sequence the author arranges them in IS the answer key.
  const isOrder = $derived(variant === 'order_items');
  // match/group_items share the same "item -> target" option shape (see quizScript.ts's
  // OPTION_TARGET) — every option is forced `correct: true` at parse time, same as order, so
  // their rows drop the correct checkbox too, but add a second plain-text input for the target
  // (the right-column label for match, the bucket name for group_items) alongside the item text.
  const isMatch = $derived(variant === 'match_pairs');
  const isCategorise = $derived(variant === 'group_items');
  const usesTargetRows = $derived(isMatch || isCategorise);
  // fill_blanks' `___` tokens in the question text are filled left-to-right by this question's
  // correct ("=") options in order; unlike order/match/group_items, the correct/incorrect marker
  // stays meaningful (an unchecked option becomes a distractor word in the bank instead) — so its
  // rows keep the correct checkbox but, like typed/guess_letters, drop the image/video kind
  // picker (a blank answer is always plain text).
  const isFillInBlanks = $derived(variant === 'fill_blanks');
  /** What one option row IS, for the labels on its own controls — "option" reads wrong on the two
   * variants whose rows are accepted answers rather than choices. */
  const rowNoun = $derived(usesAnswerRows ? 'accepted answer' : 'option');
  /** Whether an option here can BE a picture or clip rather than describe one — i.e. everything
   * except the variants whose options are compared as text (accepted answers, regex patterns).
   * Decides whether each row carries a kind picker, and whether adding one offers a choice. */
  const supportsMediaOptions = $derived(!usesAnswerRows && !isPattern);

  /** What this variant's option list IS, as a heading plus the rule that governs it. Split in two
   * so the long ones read as a label with an explanation rather than one runaway sentence in the
   * label position — `fill_blanks` in particular was a 60-character "label". */
  const optionsLabel = $derived.by((): { text: string; hint?: string } => {
    if (usesAnswerRows) {
      return {
        text: 'Accepted answers',
        hint: isCharacterInput ? 'the one word being guessed' : 'any of these count as correct'
      };
    }
    if (isOrder) return { text: 'Items', hint: 'in the correct order — drag to rearrange' };
    if (isMatch) return { text: 'Pairs', hint: 'each item and what it matches with' };
    if (isCategorise) return { text: 'Items', hint: 'and the bucket each belongs in' };
    if (isFillInBlanks) {
      return { text: 'Blank answers', hint: 'checked fills a blank, unchecked is a bank decoy' };
    }
    if (isPattern) {
      return { text: 'Patterns', hint: 'checked counts as correct, unchecked marks it wrong' };
    }
    return { text: 'Options', hint: isSingleChoice ? 'exactly one is correct' : undefined };
  });
  const suggestedKeys = $derived(suggestedSettingKeysForVariant(variant));
  let text = $state(untrack(() => question.text));
  let elements: ElementItem[] = $state(
    untrack(() => [
      ...question.media.map((m) => ({ ...m, _key: crypto.randomUUID() }) as ElementItem),
      ...question.extras.map(
        (e) =>
          ({
            kind: 'reveal' as const,
            label: e.label,
            content: e.content,
            points: e.points.toString(),
            _key: crypto.randomUUID()
          }) as ElementItem
      )
    ])
  );
  // `content` is cloned explicitly (not just shallow-spread with the rest of `o`) since it's a
  // nested object — leaving it shared with `question.options[i].content` would mean editing it
  // here mutates that cached snapshot in place, instead of only flowing back up through `emit()`.
  let options = $state(
    untrack(() =>
      question.options.map((o) => ({
        ...o,
        content: { ...o.content },
        points: o.points?.toString() ?? '',
        _key: crypto.randomUUID()
      }))
    )
  );
  let settingsList = $state(
    untrack(() =>
      Object.entries(question.settings).map(([key, value]) => ({
        key,
        value: String(value),
        _key: crypto.randomUUID()
      }))
    )
  );
  // Post-answer analysis (see quizScript.ts's `QuizScriptAnalysis`) is at most one per question,
  // unlike media/hints — a standalone label+content pair rather than another `elements` row kind.
  let analysisLabel = $state(untrack(() => question.analysis?.label ?? ''));
  let analysisContent = $state(untrack(() => question.analysis?.content ?? ''));

  let textRef: HTMLTextAreaElement | undefined = $state();
  let optionRefs: HTMLInputElement[] = $state([]);
  let elementRefs: HTMLInputElement[] = $state([]);
  let settingsRef: HTMLDivElement | undefined = $state();

  // Collapsed by default so the settings block is one line until an author actually wants it —
  // but never collapsed over settings that already exist, which would hide state the question
  // really has. Read once at mount, like every other field on this form.
  let settingsOpen = $state(untrack(() => settingsList.length > 0));
  const settingsPanelId = $props.id();

  // The whole option row is the drop target; the grip is what you grab (see the grip button's own
  // comment). `ghostFrom` is what makes the dragged thing LOOK like the row rather than the 16px
  // handle — see DraggableParams.
  const OPTION_DROP_GROUP = 'option-row';
  let optionRowEls: HTMLDivElement[] = $state([]);
  let optionDrag = $state<DragState | null>(null);

  $effect(() => {
    if (!focusTarget) return;
    if (focusTarget.field === 'text') textRef?.focus();
    else if (focusTarget.field === 'option') optionRefs[focusTarget.index]?.focus();
    else if (focusTarget.field === 'media') {
      const mediaItems = elements.filter((e) => e.kind !== 'reveal');
      elementRefs[elements.indexOf(mediaItems[focusTarget.index])]?.focus();
    } else if (focusTarget.field === 'extra') {
      const revealItems = elements.filter((e) => e.kind === 'reveal');
      elementRefs[elements.indexOf(revealItems[focusTarget.index])]?.focus();
    } else if (focusTarget.field === 'settings') {
      // Clicking the settings row in the preview asks to EDIT them, so a collapsed panel has to
      // open — focusing a disclosure whose contents are hidden lands the author nowhere.
      settingsOpen = true;
      settingsRef?.focus();
    }
    onFocusHandled();
  });

  // The single source of truth for "what this form currently represents" — used both to emit
  // and to validate, so the two can never disagree with each other.
  const currentQuestion = $derived<QuizScriptQuestion>({
    variant,
    text,
    media: elements
      .filter((e): e is Extract<ElementItem, { kind: 'image' | 'video' }> => e.kind !== 'reveal')
      .map(({ _key, ...m }) => m),
    options: options.map(({ _key, points, ...o }) => ({
      ...o,
      points: points.trim() === '' ? undefined : Number(points)
    })),
    extras: elements
      .filter((e): e is Extract<ElementItem, { kind: 'reveal' }> => e.kind === 'reveal')
      .map(({ _key, kind: _kind, points, ...e }) => ({ ...e, points: Number(points) || 0 })),
    analysis:
      analysisLabel.trim() !== '' || analysisContent.trim() !== ''
        ? { label: analysisLabel, content: analysisContent }
        : undefined,
    settings: Object.fromEntries(
      settingsList
        .filter((s) => s.key.trim() !== '')
        .map((s) => [s.key, validateSettingValue(s.key, s.value).value])
    )
  });

  // Round-tripping through the same serialize+parse code mode uses (rather than re-checking
  // "no options"/"missing text"/etc. by hand here) guarantees form mode can never quietly accept
  // something code mode would reject — one set of rules, one set of messages, either surface.
  // Setting-specific errors are filtered out here: they're already shown inline right under the
  // offending row below (same `validateSettingValue` call, same wording), so surfacing them again
  // up top would just be the same problem reported twice.
  const formErrors = $derived(
    parseQuizScriptQuestion(serializeQuizScriptQuestion(currentQuestion))
      .errors.map((e) => e.message)
      .filter((m) => !m.startsWith('Setting "'))
  );

  function emit() {
    onChange(currentQuestion);
  }

  // Switching into guess_letters can leave more than one option behind from whatever variant
  // was previously selected (e.g. the blank question template's own two starter options) —
  // guess_letters only ever allows exactly one accepted answer (see quizScript.ts's
  // parseQuestionBlock), so trim down to the first the moment that becomes the active variant,
  // same as addOption's own "Add accepted answer" button already staying hidden past one.
  function onVariantChange() {
    if (variant === 'guess_letters' && options.length > 1) {
      options = options.slice(0, 1);
    }
    // order/match/group_items force every option correct at PARSE time regardless (see
    // quizScript.ts), but code mode's live preview serializes `currentQuestion` as-is, before any
    // re-parse — so without this, an option left over from whatever variant was previously
    // selected (e.g. the blank template's own "one correct, one not" starter options) would show a
    // stray, meaningless `~` marker the author never typed. Normalizing here keeps code mode
    // honest immediately.
    if (variant === 'order_items' || variant === 'match_pairs' || variant === 'group_items') {
      options = options.map((o) => ({ ...o, correct: true }));
    }
    emit();
  }
  function addOption(kind: 'text' | 'image' | 'video' = 'text') {
    options = [
      ...options,
      {
        _key: crypto.randomUUID(),
        content: kind === 'text' ? { kind: 'text', text: '' } : { kind, alt: '', url: '' },
        correct: usesAnswerRows || isOrder || usesTargetRows || isPattern,
        target: usesTargetRows ? { kind: 'text' as const, text: '' } : undefined,
        points: ''
      }
    ];
    emit();
  }
  function removeOption(key: string) {
    options = options.filter((o) => o._key !== key);
    emit();
  }
  // Marks exactly one option correct and every other one incorrect — the radio-group behavior
  // isSingleChoice's rendering relies on, computed explicitly here rather than leaned on the
  // browser's native same-`name` radio exclusivity, since that would leave other options' own
  // bound `correct` fields stale (the browser unchecks their input, but nothing tells Svelte).
  function selectSingleCorrect(key: string) {
    options = options.map((o) => ({ ...o, correct: o._key === key }));
    emit();
  }
  // Swaps this option with its neighbor. Option order is authoring/reading convenience for most
  // variants (grading no longer cares about it now that typed matching is always any-order), but
  // for `order_items` the sequence IS the answer key — which is why reordering has to stay reachable
  // from the keyboard, not just by dragging the grip. Bound to Arrow Up/Down on that grip.
  function moveOption(key: string, direction: -1 | 1) {
    const index = options.findIndex((o) => o._key === key);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    options = next;
    emit();
  }
  /** The drag counterpart of `moveOption`: splice semantics rather than a swap, because dropping
   * the first item onto the fourth slot means "put it there and shift the rest up" — exchanging
   * the two would silently move a second item the author never touched. */
  function reorderOption(from: number, to: number) {
    if (from === to || from < 0 || from >= options.length) return;
    const next = [...options];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    options = next;
    emit();
  }
  function onGripKeydown(event: KeyboardEvent, key: string) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    // Otherwise the arrow scrolls the page out from under the row being moved.
    event.preventDefault();
    moveOption(key, event.key === 'ArrowUp' ? -1 : 1);
  }
  // Switching kind is a plain reset to that kind's blank default, same convention as switching a
  // whole question's variant — carrying old field values across kinds (e.g. text -> image's alt)
  // wouldn't mean anything.
  function setOptionKind(optionKey: string, kind: 'text' | 'image' | 'video') {
    options = options.map((o) =>
      o._key === optionKey && o.content.kind !== kind
        ? {
            ...o,
            content:
              kind === 'text' ? { kind: 'text' as const, text: '' } : { kind, alt: '', url: '' }
          }
        : o
    );
    emit();
  }
  /** The same, for the right-hand half of a `match_pairs` row. */
  function setTargetKind(optionKey: string, kind: 'text' | 'image' | 'video') {
    options = options.map((o) =>
      o._key === optionKey && o.target?.kind !== kind
        ? {
            ...o,
            target:
              kind === 'text' ? { kind: 'text' as const, text: '' } : { kind, alt: '', url: '' }
          }
        : o
    );
    emit();
  }
  // Every text-bearing option field goes through here, whatever the variant. Deliberately does NOT
  // sniff a pasted `![alt](url)` and convert the row to an image the way it used to: with the kind
  // picker gone from the item side, that conversion had no inverse — an option that silently became
  // a picture could only be turned back by deleting it. Code mode still parses that syntax, which
  // is where a pasted markdown line belongs.
  //
  // `prerevealed` (guess_letters only) is clamped to the new text's length so shortening the answer
  // can't leave a stale out-of-range pre-reveal index behind — see `togglePrereveal`.
  function setOptionText(optionKey: string, raw: string) {
    options = options.map((o) => {
      if (o._key !== optionKey) return o;
      const prerevealed = o.prerevealed?.filter((i) => i < raw.length);
      return {
        ...o,
        content: { kind: 'text' as const, text: raw },
        prerevealed: prerevealed && prerevealed.length > 0 ? prerevealed : undefined
      };
    });
    emit();
  }
  // match/group_items only: the right-hand entry an item is paired with — the form-mode counterpart
  // to code mode's "item -> target" syntax. Only the text case needs a handler; a media target's
  // alt/url fields bind straight through the `options` state proxy, same as a media option's do.
  function setOptionTarget(optionKey: string, raw: string) {
    options = options.map((o) =>
      o._key === optionKey ? { ...o, target: { kind: 'text' as const, text: raw } } : o
    );
    emit();
  }
  // guess_letters only: toggles whether the answer text's character at `index` is pre-revealed
  // for free from the start — the form-mode counterpart to code mode's `[X]` bracket syntax,
  // operating directly on `QuizScriptOption.prerevealed` rather than parsing brackets out of live
  // text (see the form's own doc comment on `isCharacterInput` for why that's deliberately
  // avoided). Always targets options[0] — guess_letters has exactly one accepted answer.
  function togglePrereveal(index: number) {
    options = options.map((o, i) => {
      if (i !== 0) return o;
      const current = o.prerevealed ?? [];
      const next = current.includes(index)
        ? current.filter((n) => n !== index)
        : [...current, index].sort((a, b) => a - b);
      return { ...o, prerevealed: next.length > 0 ? next : undefined };
    });
    emit();
  }
  /** Keeps a points field numeric as it's typed (see `sanitizeNumericInput` for why these aren't
   * `<input type="number">`). Writes the cleaned text back to the DOM as well as to state: when
   * cleaning produces what state already held — typing "x" into "12" — Svelte sees no change,
   * doesn't re-render, and the rejected character stays sitting in the field. */
  function setPointsField(target: { points: string }, input: HTMLInputElement) {
    const cleaned = sanitizeNumericInput(input.value);
    input.value = cleaned;
    target.points = cleaned;
    emit();
  }

  function addElement(kind: 'image' | 'video' | 'reveal') {
    elements = [...elements, blankElement(kind)];
    emit();
  }
  function removeElement(key: string) {
    elements = elements.filter((e) => e._key !== key);
    emit();
  }
  // Same reset-to-blank convention as switching an option's kind or the whole question's variant.
  function setElementKind(key: string, kind: 'image' | 'video' | 'reveal') {
    elements = elements.map((e) =>
      e._key === key && e.kind !== kind ? { ...blankElement(kind), _key: key } : e
    );
    emit();
  }
  function addSetting() {
    settingsList = [...settingsList, { _key: crypto.randomUUID(), key: '', value: '' }];
    emit();
  }
  function removeSetting(key: string) {
    settingsList = settingsList.filter((s) => s._key !== key);
    emit();
  }
  /** Fires when a setting row's key <select> changes — fills in that key's default value
   * (`settingDefaultValue`) so picking a key never leaves an author staring at an empty value
   * field for, say, a boolean setting that's really just "on or off". Only fills a genuinely
   * blank value: switching an already-filled row to a different key leaves whatever's there
   * (the author may be deliberately reusing a value, e.g. flipping between two enum settings). */
  function selectSettingKey(setting: { key: string; value: string }) {
    if (setting.value.trim() === '') setting.value = settingDefaultValue(setting.key);
    emit();
  }
</script>

<!-- One heading treatment for every block of the form, so the eye can find the sections rather than
     reading a flat stack of controls. `hint` carries the per-variant explanation that used to be
     crammed into the label itself ("Blank answers (checked) and word-bank distractors
     (unchecked)"), which at that length stopped reading as a label at all. -->
{#snippet sectionLabel(text: string, hint?: string)}
  <!-- `{text}` and the hint on separate lines so the space between them survives: Svelte trims
       leading whitespace inside an element, so a `<span> — …` written inline renders as "Options—". -->
  <p class="text-xs font-medium text-slate-500">
    {text}
    {#if hint}<span class="font-normal text-slate-500">— {hint}</span>{/if}
  </p>
{/snippet}

<div class="space-y-5">
  <ErrorList errors={formErrors} />

  <div class="space-y-1.5">
    <label for="variant" class="block text-xs font-medium text-slate-500">Variant</label>
    <select
      id="variant"
      class="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      bind:value={variant}
      onchange={onVariantChange}
    >
      {#each SELECTABLE_VARIANTS as v (v)}
        <option value={v}>{v}</option>
      {/each}
    </select>
  </div>

  <div class="space-y-1">
    <div class="space-y-1.5">
      <label for="question-text" class="block text-xs font-medium text-slate-500">Question</label>
      <textarea
        id="question-text"
        bind:this={textRef}
        class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        rows="2"
        bind:value={text}
        oninput={emit}></textarea>
    </div>

    <div class="space-y-1.5">
      {#if elements.length > 0}
        {@render sectionLabel('Media & hints', 'shown with the question, before it is answered')}
      {/if}
      {#each elements as item, index (item._key)}
        <div class="{ROW_CARD} {ROW_CARD_RESTING}">
          <KindPicker
            kinds={ELEMENT_KINDS}
            value={item.kind}
            label="Element type"
            onSelect={(kind) => setElementKind(item._key, kind)}
          />
          {#if item.kind === 'reveal'}
            <div class={ROW_FIELDS}>
              <input
                bind:this={elementRefs[index]}
                class="{ROW_FIELD} grow basis-0 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder="button label"
                bind:value={item.label}
                oninput={emit}
              />
              <input
                class="{ROW_FIELD} grow-[2] basis-0 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder="hint text"
                bind:value={item.content}
                oninput={emit}
              />
            </div>
          {:else}
            <div class={ROW_FIELDS}>
              <input
                bind:this={elementRefs[index]}
                class="{ROW_FIELD} grow basis-0 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder="alt text"
                bind:value={item.alt}
                oninput={emit}
              />
              <input
                class="{ROW_FIELD} grow-[2] basis-0 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder="url"
                bind:value={item.url}
                oninput={emit}
              />
            </div>
          {/if}
          <div class={ROW_TRAILING}>
            {#if item.kind === 'reveal'}
              <input
                type="text"
                inputmode="decimal"
                class="{ROW_CONTROL} w-12 rounded-md border border-slate-300 px-1 text-center text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder="pts"
                aria-label="Points"
                title="Points (usually negative — the cost of revealing this hint)"
                value={item.points}
                oninput={(e) => setPointsField(item, e.currentTarget)}
              />
            {/if}
            <button
              type="button"
              class="{ROW_ICON_BUTTON} text-slate-500 hover:bg-slate-100"
              onclick={() => removeElement(item._key)}
              aria-label="Remove element"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      {/each}
      <div class="flex gap-1.5">
        <button
          type="button"
          class="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          onclick={() => addElement('image')}
        >
          <Image size={13} /> Add image
        </button>
        <button
          type="button"
          class="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          onclick={() => addElement('video')}
        >
          <VideoIcon size={13} /> Add video
        </button>
        <button
          type="button"
          class="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          onclick={() => addElement('reveal')}
        >
          <Eye size={13} /> Add reveal
        </button>
      </div>
    </div>
  </div>

  <!-- One option's content fields, shared by every variant's row: a kind picker, then either a
       single text box or the alt + url pair a picture or clip needs. `optionRefs[index]` lands on
       whichever field comes first, so clicking an option in the preview focuses this row wherever
       the kind moved it.
       The picker only appears where a picture would mean something — the variants whose options
       are compared as text (accepted answers, regex patterns) have `supportsMediaOptions` false,
       so those rows stay a bare field. -->
  {#snippet contentFields(
    content: QuizScriptOptionContent,
    index: number,
    placeholder: string,
    monospace = false
  )}
    {#if supportsMediaOptions}
      <KindPicker
        kinds={OPTION_KINDS}
        value={content.kind}
        label={`${rowNoun[0].toUpperCase()}${rowNoun.slice(1)} content type`}
        onSelect={(kind) => setOptionKind(options[index]._key, kind)}
      />
    {/if}
    {#if content.kind === 'text'}
      <input
        bind:this={optionRefs[index]}
        class="{ROW_FIELD} grow basis-0 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none {monospace
          ? 'font-mono'
          : ''}"
        {placeholder}
        value={content.text}
        oninput={(e) => setOptionText(options[index]._key, e.currentTarget.value)}
      />
    {:else}
      <input
        bind:this={optionRefs[index]}
        class="{ROW_FIELD} grow basis-0 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
        placeholder="alt text"
        bind:value={content.alt}
        oninput={emit}
      />
      <input
        class="{ROW_FIELD} grow-[2] basis-0 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
        placeholder="url"
        bind:value={content.url}
        oninput={emit}
      />
    {/if}
  {/snippet}

  <div class="space-y-1.5">
    {@render sectionLabel(optionsLabel.text, optionsLabel.hint)}
    {#each options as option, index (option._key)}
      <div
        bind:this={optionRowEls[index]}
        data-drop-group={OPTION_DROP_GROUP}
        data-drop-zone={index}
        class="{ROW_CARD} transition-colors {optionRowTone(index)}"
      >
        <!-- The reorder handle, ahead of everything else in the row so the drag affordance reads
             before the content it moves. It replaces the pair of up/down chevrons that used to sit
             at the far right: dragging is the direct way to say "put this one there", and for
             `order_items` (where the sequence is the answer key) it's the same gesture the player uses.
             Still a real <button> with Arrow Up/Down bound, because dragging is a pointer-only
             mechanic and this must not become the one authoring step a keyboard can't perform. -->
        <button
          type="button"
          use:draggable={{
            id: index,
            group: OPTION_DROP_GROUP,
            ghostFrom: optionRowEls[index],
            onDragChange: (state) => (optionDrag = state),
            onDrop: reorderOption
          }}
          class="{ROW_ICON_BUTTON} cursor-grab text-slate-500 hover:bg-slate-100"
          aria-label={`Reorder ${rowNoun} ${index + 1} of ${options.length} — press arrow up or arrow down, or drag`}
          onkeydown={(e) => onGripKeydown(e, option._key)}
        >
          <GripVertical size={16} />
        </button>
        {#if usesTargetRows}
          {@const target = option.target}
          <div class={ROW_FIELDS}>
            {@render contentFields(option.content, index, 'Item')}
            <span class="shrink-0 text-sm text-slate-500">→</span>
            <!-- Only match_pairs offers a kind here: a group_items target NAMES the bucket its
                 items share, and a picture names nothing (see quizScript.ts's own parse rule). -->
            {#if isMatch}
              <KindPicker
                kinds={OPTION_KINDS}
                value={target?.kind ?? 'text'}
                label="Match target type"
                onSelect={(kind) => setTargetKind(option._key, kind)}
              />
            {/if}
            {#if !target || target.kind === 'text'}
              <input
                class="{ROW_FIELD} grow basis-0 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder={isMatch ? 'Matches with' : 'Bucket'}
                value={target?.text ?? ''}
                oninput={(e) => setOptionTarget(option._key, e.currentTarget.value)}
              />
            {:else}
              <input
                class="{ROW_FIELD} grow basis-0 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder="alt text"
                bind:value={target.alt}
                oninput={emit}
              />
              <input
                class="{ROW_FIELD} grow-[2] basis-0 rounded-md border border-slate-300 px-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder="url"
                bind:value={target.url}
                oninput={emit}
              />
            {/if}
          </div>
        {:else if usesAnswerRows}
          <div class={ROW_FIELDS}>
            {@render contentFields(
              option.content,
              index,
              isCharacterInput ? 'Answer' : 'Accepted answer'
            )}
          </div>
        {:else if isPattern}
          <span class={ROW_CHECK_SLOT}>
            <input
              type="checkbox"
              class="h-4 w-4"
              bind:checked={option.correct}
              onchange={emit}
              aria-label="Correct"
            />
          </span>
          <div class={ROW_FIELDS}>
            {@render contentFields(
              option.content,
              index,
              option.correct ? 'Pattern that is correct' : 'Pattern to mark wrong',
              true
            )}
          </div>
        {:else if isFillInBlanks}
          <span class={ROW_CHECK_SLOT}>
            <input
              type="checkbox"
              class="h-4 w-4"
              bind:checked={option.correct}
              onchange={emit}
              aria-label="Correct"
            />
          </span>
          <div class={ROW_FIELDS}>
            {@render contentFields(
              option.content,
              index,
              option.correct ? 'Blank answer' : 'Distractor word'
            )}
          </div>
        {:else}
          {#if isOrder}
            <!-- No correct checkbox: every order item is correct by construction (see
                 quizScript.ts) — the reorder grip is the actual authoring mechanism for the
                 correct sequence. -->
          {:else if isSingleChoice}
            <span class={ROW_CHECK_SLOT}>
              <input
                type="radio"
                name="correct-option"
                class="h-4 w-4"
                checked={option.correct}
                onchange={() => selectSingleCorrect(option._key)}
                aria-label="Correct"
              />
            </span>
          {:else}
            <span class={ROW_CHECK_SLOT}>
              <input
                type="checkbox"
                class="h-4 w-4"
                bind:checked={option.correct}
                onchange={emit}
                aria-label="Correct"
              />
            </span>
          {/if}
          <div class={ROW_FIELDS}>
            {@render contentFields(option.content, index, 'Option text')}
          </div>
        {/if}
        <div class={ROW_TRAILING}>
          <input
            type="text"
            inputmode="decimal"
            class="{ROW_CONTROL} w-12 rounded-md border border-slate-300 px-1 text-center text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            placeholder="pts"
            aria-label="Points"
            value={option.points}
            oninput={(e) => setPointsField(option, e.currentTarget)}
          />
          <button
            type="button"
            class="{ROW_ICON_BUTTON} text-slate-500 hover:bg-slate-100"
            onclick={() => removeOption(option._key)}
            aria-label={usesAnswerRows ? 'Remove accepted answer' : 'Remove option'}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    {/each}
    {#if !isCharacterInput || options.length === 0}
      <!-- A plain button now that every row carries its own kind picker: choosing the kind up
           front as well would be the same decision offered twice, and a row added as the wrong
           kind is one click from the right one. -->
      <button
        type="button"
        class="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        onclick={() => addOption()}
      >
        <Plus size={13} />
        Add {rowNoun}
      </button>
    {/if}
    {#if isCharacterInput && options[0]?.content.kind === 'text' && options[0].content.text}
      {@const answerText = options[0].content.text}
      {@const prerevealedSet = new Set(options[0].prerevealed ?? [])}
      <div class="space-y-1">
        <p class="text-xs font-medium text-slate-500">
          Pre-revealed letters
          <span class="font-normal text-slate-400"
            >— click to reveal a letter for free from the start</span
          >
        </p>
        <div class="flex flex-wrap gap-1">
          {#each Array.from({ length: answerText.length }) as _, i (i)}
            {@const char = answerText[i]}
            {#if isGuessableChar(char)}
              <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold uppercase transition-colors {prerevealedSet.has(
                  i
                )
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                  : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'}"
                onclick={() => togglePrereveal(i)}
                aria-pressed={prerevealedSet.has(i)}
                aria-label={`${prerevealedSet.has(i) ? 'Unmark' : 'Mark'} letter "${char}" (position ${i + 1}) as pre-revealed`}
              >
                {char}
              </button>
            {:else}
              <span class="flex h-7 w-7 items-center justify-center text-xs text-slate-300"
                >{char}</span
              >
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="space-y-1.5">
    <label for="analysis-content" class="block text-xs font-medium text-slate-500">
      Post-answer analysis
      <span class="font-normal text-slate-500"
        >— shown after this question is answered, right or wrong</span
      >
    </label>
    <!-- Label above, explanation below, each on its own full-width row rather than sharing one.
         An analysis is prose — often a few sentences of "here's why" — and a single-line input
         sharing a row with the label field gave it a fraction of the card's width to show that in,
         so anything past a few words scrolled out of sight while being written. -->
    <input
      class="w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      placeholder="label (optional)"
      aria-label="Post-answer analysis label"
      bind:value={analysisLabel}
      oninput={emit}
    />
    <textarea
      id="analysis-content"
      class="w-full resize-y rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      rows="3"
      placeholder="explanation"
      bind:value={analysisContent}
      oninput={emit}></textarea>
  </div>

  <div class="space-y-1.5" bind:this={settingsRef} tabindex="-1">
    <!-- A disclosure over the settings block, with its key legend INSIDE. The legend used to sit
         above the disclosure and be visible at all times — the whole settings vocabulary spelled
         out on screen for a block most questions never use at all — which is what was worth
         collapsing, not the list. Behind the toggle it costs nothing when unwanted and answers
         "what can I even set here?" the moment it's opened, which neither the per-row "?" (one
         key, after you've already picked it) nor the docs link (a new tab) does. -->
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
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
          <span class="rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
            {settingsList.length}
          </span>
        {/if}
      </button>
      <SettingsDocsLink />
    </div>
    <div id={settingsPanelId} class="space-y-1.5" hidden={!settingsOpen}>
      <!-- Scoped to this variant, which is more than the old always-on legend managed. -->
      <SettingsLegend keys={suggestedKeys} />
      {#each settingsList as setting (setting._key)}
        {@const usedElsewhere = settingsList
          .filter((s) => s._key !== setting._key)
          .map((s) => s.key)}
        {@const valueSuggestions = settingValueSuggestions(setting.key)}
        {@const validation = setting.key.trim()
          ? validateSettingValue(setting.key, setting.value)
          : null}
        <!-- No per-row "?": every key is explained by the legend directly above, where the key
             name itself is the trigger. Two explanation affordances for one closed set of keys was
             one too many, and dropping it gives the value field back 2rem — which is most of what
             made these rows wrap on a phone. -->
        <div class="flex flex-wrap items-center gap-1.5">
          <select
            class="w-28 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
            bind:value={setting.key}
            onchange={() => selectSettingKey(setting)}
            aria-label="Setting key"
          >
            <option value="">key</option>
            {#each suggestedKeys.filter((k) => !usedElsewhere.includes(k)) as k (k)}
              <option value={k}>{k}</option>
            {/each}
          </select>
          <SuggestionInput
            bind:value={setting.value}
            suggestions={valueSuggestions}
            placeholder="value"
            class="min-w-[6rem] flex-1"
            oninput={emit}
          />
          <button
            type="button"
            class="shrink-0 rounded p-2 text-slate-500 hover:bg-slate-100"
            onclick={() => removeSetting(setting._key)}
            aria-label="Remove setting"
          >
            <X size={16} />
          </button>
        </div>
        {#if validation?.error}
          <!-- Indented to line up under the value field the message is about: the key select
               (7rem) plus its gap. -->
          <p class="break-words text-xs text-red-600 sm:pl-[7.375rem]">{validation.error}</p>
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
  </div>
</div>
