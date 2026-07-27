<script lang="ts">
  import { untrack } from 'svelte';
  import { Image, Plus, Video as VideoIcon, Eye, X, ChevronUp, ChevronDown } from '@lucide/svelte';
  import {
    parseOptionContent,
    parseQuizScriptQuestion,
    serializeQuizScriptQuestion,
    settingDefaultValue,
    settingValueSuggestions,
    suggestedSettingKeysForVariant,
    validateSettingValue,
    type QuizScriptQuestion
  } from '@/lib/utils/quizScript';
  import { isGuessableChar } from '@/lib/utils/grading';
  import type { FocusTarget } from '@/lib/utils/questionFocus';
  import SuggestionInput from './SuggestionInput.svelte';
  import ErrorList from './ErrorList.svelte';
  import SettingHelp from './SettingHelp.svelte';

  // "question" isn't offered here — it's not a real variant, just what a question gets by not
  // declaring anything (see KNOWN_VARIANTS in quizScript.ts). More real variants can be added to
  // this list as they're actually built.
  const SELECTABLE_VARIANTS = [
    'single_choice',
    'multiple_choice',
    'typed',
    'character_input',
    'order',
    'match',
    'categorise',
    'fill_in_blanks'
  ];

  // "Elements" is one unified list in form mode (image/video/reveal, switchable per row, same
  // idea as quizare's extras editor) even though the underlying data keeps them in two separate
  // arrays (`media`/`extras`) — see `currentQuestion` below for the split on the way back out.
  type ElementItem =
    | { _key: string; kind: 'image'; alt: string; url: string }
    | { _key: string; kind: 'video'; alt: string; url: string }
    | { _key: string; kind: 'reveal'; label: string; content: string; points: string };

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
  const isTyped = $derived(variant === 'typed');
  // character_input's single accepted answer is exactly as plain-text-only as typed's — it just
  // additionally supports pre-revealing characters for free (`[X]` bracket markers in code mode —
  // see quizScript.ts's parsePrerevealedText/insertPrerevealMarkers). Form mode doesn't parse
  // brackets out of the live text field itself (that would mean re-deriving `prerevealed` on every
  // keystroke without ever going stale relative to text still mid-edit, risking a pre-reveal
  // position silently pointing at the wrong character) — instead it renders a separate row of
  // per-letter toggle buttons below the answer field, operating directly on the already-structured
  // `prerevealed` array (see `togglePrereveal`), so no bracket-parsing is needed either way.
  const isCharacterInput = $derived(variant === 'character_input');
  // Both variants get the same simplified "one plain-text row per accepted answer" treatment.
  const usesAnswerRows = $derived(isTyped || isCharacterInput);
  // A single_choice question's "correct" marker renders as a radio group instead of independent
  // checkboxes, so an author can't accidentally mark two options correct in form mode in the
  // first place — code mode still catches it via formErrors below either way, but this avoids the
  // mistake happening at all rather than just reporting it after the fact.
  const isSingleChoice = $derived(variant === 'single_choice');
  // order has no right/wrong item, only a right/wrong POSITION (every option is forced
  // `correct: true` at parse time — see quizScript.ts) — so its option rows keep the image/video
  // kind picker (ordering pictures is a real use case) but drop the correct checkbox/radio
  // entirely, and reuse the existing move-up/move-down buttons as the actual authoring mechanism
  // for the correct order: whatever sequence the author arranges them in IS the answer key.
  const isOrder = $derived(variant === 'order');
  // match/categorise share the same "item -> target" option shape (see quizScript.ts's
  // OPTION_TARGET) — every option is forced `correct: true` at parse time, same as order, so
  // their rows drop the correct checkbox too, but add a second plain-text input for the target
  // (the right-column label for match, the bucket name for categorise) alongside the item text.
  const isMatch = $derived(variant === 'match');
  const isCategorise = $derived(variant === 'categorise');
  const usesTargetRows = $derived(isMatch || isCategorise);
  // fill_in_blanks' `___` tokens in the question text are filled left-to-right by this question's
  // correct ("=") options in order; unlike order/match/categorise, the correct/incorrect marker
  // stays meaningful (an unchecked option becomes a distractor word in the bank instead) — so its
  // rows keep the correct checkbox but, like typed/character_input, drop the image/video kind
  // picker (a blank answer is always plain text).
  const isFillInBlanks = $derived(variant === 'fill_in_blanks');
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
    } else if (focusTarget.field === 'settings') settingsRef?.focus();
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

  // Switching into character_input can leave more than one option behind from whatever variant
  // was previously selected (e.g. the blank question template's own two starter options) —
  // character_input only ever allows exactly one accepted answer (see quizScript.ts's
  // parseQuestionBlock), so trim down to the first the moment that becomes the active variant,
  // same as addOption's own "Add accepted answer" button already staying hidden past one.
  function onVariantChange() {
    if (variant === 'character_input' && options.length > 1) {
      options = options.slice(0, 1);
    }
    // order/match/categorise force every option correct at PARSE time regardless (see
    // quizScript.ts), but code mode's live preview serializes `currentQuestion` as-is, before any
    // re-parse — so without this, an option left over from whatever variant was previously
    // selected (e.g. the blank template's own "one correct, one not" starter options) would show a
    // stray, meaningless `~` marker the author never typed. Normalizing here keeps code mode
    // honest immediately.
    if (variant === 'order' || variant === 'match' || variant === 'categorise') {
      options = options.map((o) => ({ ...o, correct: true }));
    }
    emit();
  }
  function addOption() {
    options = [
      ...options,
      {
        _key: crypto.randomUUID(),
        content: { kind: 'text', text: '' },
        correct: usesAnswerRows || isOrder || usesTargetRows,
        target: usesTargetRows ? '' : undefined,
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
  // Swaps this option with its neighbor — the only thing option order actually affects is
  // authoring/reading convenience (grading no longer cares about it now that typed matching is
  // always any-order), but that's still worth being able to control directly instead of only via
  // remove-and-re-add.
  function moveOption(key: string, direction: -1 | 1) {
    const index = options.findIndex((o) => o._key === key);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    options = next;
    emit();
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
  // Same `![alt](url)` / `~[alt](url)` shape code mode recognizes for an option's content —
  // pasting or finishing typing one here switches this option to image/video kind live, instead
  // of requiring the kind dropdown first. Anything that doesn't match that exact shape (including
  // a still-in-progress paste) just stays as plain text.
  function setOptionText(optionKey: string, raw: string) {
    const parsed = parseOptionContent(raw.trim());
    const content = parsed.kind === 'text' ? { kind: 'text' as const, text: raw } : parsed;
    options = options.map((o) => (o._key === optionKey ? { ...o, content } : o));
    emit();
  }
  // A typed accepted answer is always plain text — unlike setOptionText, deliberately skips the
  // paste-an-image/video-link auto-detection, since that would never make sense here.
  // `prerevealed` (character_input only) is clamped to the new text's length so shortening the
  // answer can't leave a stale out-of-range pre-reveal index behind — see `togglePrereveal`.
  function setTypedAnswerText(optionKey: string, raw: string) {
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
  // match/categorise only: the right-hand label an item's own text (setOptionText/setTypedAnswerText
  // aren't used for these two — see usesTargetRows) is paired with — the form-mode counterpart to
  // code mode's "item -> target" syntax.
  function setOptionTarget(optionKey: string, raw: string) {
    options = options.map((o) => (o._key === optionKey ? { ...o, target: raw } : o));
    emit();
  }
  // character_input only: toggles whether the answer text's character at `index` is pre-revealed
  // for free from the start — the form-mode counterpart to code mode's `[X]` bracket syntax,
  // operating directly on `QuizScriptOption.prerevealed` rather than parsing brackets out of live
  // text (see the form's own doc comment on `isCharacterInput` for why that's deliberately
  // avoided). Always targets options[0] — character_input has exactly one accepted answer.
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
      {#each elements as item, index (item._key)}
        <div class="flex flex-wrap items-center gap-1.5">
          <select
            class="shrink-0 rounded-md border border-slate-300 px-1 py-1 text-xs text-slate-600 focus:border-slate-400 focus:outline-none"
            value={item.kind}
            onchange={(e) =>
              setElementKind(item._key, e.currentTarget.value as 'image' | 'video' | 'reveal')}
            aria-label="Element type"
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="reveal">Reveal</option>
          </select>
          {#if item.kind === 'reveal'}
            <input
              bind:this={elementRefs[index]}
              class="w-28 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="button label"
              bind:value={item.label}
              oninput={emit}
            />
            <input
              class="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="hint text"
              bind:value={item.content}
              oninput={emit}
            />
            <input
              type="number"
              class="w-16 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="pts"
              title="Points (usually negative — the cost of revealing this hint)"
              bind:value={item.points}
              oninput={emit}
            />
          {:else}
            <input
              bind:this={elementRefs[index]}
              class="w-24 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="alt text"
              bind:value={item.alt}
              oninput={emit}
            />
            <input
              class="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="url"
              bind:value={item.url}
              oninput={emit}
            />
          {/if}
          <button
            type="button"
            class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100"
            onclick={() => removeElement(item._key)}
            aria-label="Remove element"
          >
            <X size={13} />
          </button>
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

  <div class="space-y-1.5">
    <p class="text-xs font-medium text-slate-500">
      {usesAnswerRows
        ? 'Accepted answers'
        : isOrder
          ? 'Items, in the correct order (use ↑/↓ to arrange)'
          : isMatch
            ? 'Pairs'
            : isCategorise
              ? 'Items and their bucket'
              : isFillInBlanks
                ? 'Blank answers (checked) and word-bank distractors (unchecked)'
                : 'Options'}
    </p>
    {#each options as option, index (option._key)}
      <div class="flex flex-wrap items-center gap-1.5">
        {#if usesTargetRows}
          <input
            bind:this={optionRefs[index]}
            class="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            placeholder="Item"
            value={option.content.kind === 'text' ? option.content.text : ''}
            oninput={(e) => setTypedAnswerText(option._key, e.currentTarget.value)}
          />
          <span class="shrink-0 text-sm text-slate-500">→</span>
          <input
            class="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            placeholder={isMatch ? 'Matches with' : 'Bucket'}
            value={option.target ?? ''}
            oninput={(e) => setOptionTarget(option._key, e.currentTarget.value)}
          />
        {:else if usesAnswerRows}
          <input
            bind:this={optionRefs[index]}
            class="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            placeholder={isCharacterInput ? 'Answer' : 'Accepted answer'}
            value={option.content.kind === 'text' ? option.content.text : ''}
            oninput={(e) => setTypedAnswerText(option._key, e.currentTarget.value)}
          />
        {:else if isFillInBlanks}
          <input
            type="checkbox"
            bind:checked={option.correct}
            onchange={emit}
            aria-label="Correct"
          />
          <input
            bind:this={optionRefs[index]}
            class="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            placeholder={option.correct ? 'Blank answer' : 'Distractor word'}
            value={option.content.kind === 'text' ? option.content.text : ''}
            oninput={(e) => setTypedAnswerText(option._key, e.currentTarget.value)}
          />
        {:else}
          {#if isOrder}
            <!-- No correct checkbox: every order item is correct by construction (see
                 quizScript.ts) — the move up/down buttons below are the actual authoring
                 mechanism for the correct sequence. -->
          {:else if isSingleChoice}
            <input
              type="radio"
              name="correct-option"
              checked={option.correct}
              onchange={() => selectSingleCorrect(option._key)}
              aria-label="Correct"
            />
          {:else}
            <input
              type="checkbox"
              bind:checked={option.correct}
              onchange={emit}
              aria-label="Correct"
            />
          {/if}
          <select
            class="shrink-0 rounded-md border border-slate-300 px-1 py-1 text-xs text-slate-600 focus:border-slate-400 focus:outline-none"
            value={option.content.kind}
            onchange={(e) =>
              setOptionKind(option._key, e.currentTarget.value as 'text' | 'image' | 'video')}
            aria-label="Option content type"
          >
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
          {#if option.content.kind === 'text'}
            <input
              bind:this={optionRefs[index]}
              class="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="Option text (or paste ![alt](image url) / ~[alt](video url))"
              value={option.content.text}
              oninput={(e) => setOptionText(option._key, e.currentTarget.value)}
            />
          {:else}
            <input
              bind:this={optionRefs[index]}
              class="w-24 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="alt text"
              bind:value={option.content.alt}
              oninput={emit}
            />
            <input
              class="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="url"
              bind:value={option.content.url}
              oninput={emit}
            />
          {/if}
        {/if}
        <div class="ml-auto flex shrink-0 items-center gap-1.5">
          <input
            type="number"
            class="w-16 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
            placeholder="pts"
            bind:value={option.points}
            oninput={emit}
          />
          <button
            type="button"
            class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            onclick={() => moveOption(option._key, -1)}
            disabled={index === 0}
            aria-label="Move up"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            onclick={() => moveOption(option._key, 1)}
            disabled={index === options.length - 1}
            aria-label="Move down"
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100"
            onclick={() => removeOption(option._key)}
            aria-label={usesAnswerRows ? 'Remove accepted answer' : 'Remove option'}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    {/each}
    {#if !isCharacterInput || options.length === 0}
      <button
        type="button"
        class="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        onclick={addOption}
      >
        <Plus size={13} />
        {usesAnswerRows ? 'Add accepted answer' : 'Add option'}
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
      <span class="font-normal text-slate-400"
        >— shown after this question is answered, right or wrong</span
      >
    </label>
    <div class="flex flex-wrap items-center gap-1.5">
      <input
        class="w-40 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        placeholder="label (optional)"
        bind:value={analysisLabel}
        oninput={emit}
      />
      <input
        id="analysis-content"
        class="min-w-[10rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        placeholder="explanation"
        bind:value={analysisContent}
        oninput={emit}
      />
    </div>
  </div>

  <div class="space-y-1.5" bind:this={settingsRef} tabindex="-1">
    <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-500">
      <span>Settings</span>
      {#each suggestedKeys as key (key)}
        <span class="inline-flex items-center gap-0.5 font-normal text-slate-500">
          {key}
          <SettingHelp {key} />
        </span>
      {/each}
    </div>
    {#each settingsList as setting (setting._key)}
      {@const usedElsewhere = settingsList.filter((s) => s._key !== setting._key).map((s) => s.key)}
      {@const valueSuggestions = settingValueSuggestions(setting.key)}
      {@const validation = setting.key.trim()
        ? validateSettingValue(setting.key, setting.value)
        : null}
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
        {#if setting.key.trim()}
          <SettingHelp key={setting.key} />
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
        <p class="break-words text-xs text-red-600 sm:pl-[7.5rem]">{validation.error}</p>
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
