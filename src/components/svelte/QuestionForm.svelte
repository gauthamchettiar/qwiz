<script lang="ts">
  import { untrack } from 'svelte';
  import { Image, Plus, Video as VideoIcon, Eye, X, ChevronUp, ChevronDown } from '@lucide/svelte';
  import {
    parseOptionContent,
    parseQuizScriptQuestion,
    serializeQuizScriptQuestion,
    settingValueSuggestions,
    suggestedSettingKeysForVariant,
    validateSettingValue,
    type QuizScriptQuestion
  } from '@/lib/utils/quizScript';
  import type { FocusTarget } from '@/lib/utils/questionFocus';
  import SuggestionInput from './SuggestionInput.svelte';
  import ErrorList from './ErrorList.svelte';
  import SettingHelp from './SettingHelp.svelte';

  // "question" isn't offered here — it's not a real variant, just what a question gets by not
  // declaring anything (see KNOWN_VARIANTS in quizScript.ts). More real variants can be added to
  // this list as they're actually built.
  const SELECTABLE_VARIANTS = ['choice', 'typed'];

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

  function addOption() {
    options = [
      ...options,
      {
        _key: crypto.randomUUID(),
        content: { kind: 'text', text: '' },
        correct: isTyped,
        points: ''
      }
    ];
    emit();
  }
  function removeOption(key: string) {
    options = options.filter((o) => o._key !== key);
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
  function setTypedAnswerText(optionKey: string, raw: string) {
    options = options.map((o) =>
      o._key === optionKey ? { ...o, content: { kind: 'text' as const, text: raw } } : o
    );
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
</script>

<div class="space-y-5">
  <ErrorList errors={formErrors} />

  <div class="space-y-1.5">
    <label for="variant" class="block text-xs font-medium text-slate-500">Variant</label>
    <select
      id="variant"
      class="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      bind:value={variant}
      onchange={emit}
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
        <div class="flex items-center gap-1.5">
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
              class="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
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
              class="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
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
    <p class="text-xs font-medium text-slate-500">{isTyped ? 'Accepted answers' : 'Options'}</p>
    {#each options as option, index (option._key)}
      <div class="flex items-center gap-1.5">
        {#if isTyped}
          <input
            bind:this={optionRefs[index]}
            class="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            placeholder="Accepted answer"
            value={option.content.kind === 'text' ? option.content.text : ''}
            oninput={(e) => setTypedAnswerText(option._key, e.currentTarget.value)}
          />
        {:else}
          <input
            type="checkbox"
            bind:checked={option.correct}
            onchange={emit}
            aria-label="Correct"
          />
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
              class="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
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
              class="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              placeholder="url"
              bind:value={option.content.url}
              oninput={emit}
            />
          {/if}
        {/if}
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
          aria-label={isTyped ? 'Remove accepted answer' : 'Remove option'}
        >
          <X size={13} />
        </button>
      </div>
    {/each}
    <button
      type="button"
      class="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
      onclick={addOption}
    >
      <Plus size={13} />
      {isTyped ? 'Add accepted answer' : 'Add option'}
    </button>
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
      <div class="flex items-center gap-1.5">
        <select
          class="w-28 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
          bind:value={setting.key}
          onchange={emit}
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
          class="flex-1"
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
        <p class="pl-[7.5rem] text-xs text-red-600">{validation.error}</p>
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
