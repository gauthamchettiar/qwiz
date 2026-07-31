<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import {
    ArrowRight,
    CircleCheck,
    CircleDot,
    CircleX,
    Eye,
    LayoutGrid,
    ListOrdered,
    RectangleEllipsis,
    SquareCheck,
    Regex,
    Type,
    Video,
    WholeWord
  } from '@lucide/svelte';
  import {
    optionLabelText,
    optionTargetText,
    type QuizScriptOption,
    type QuizScriptOptionContent,
    type QuizScriptQuestion
  } from '@/lib/utils/quizScript';
  import type { FocusTarget } from '@/lib/utils/questionFocus';
  import {
    categoriseBuckets,
    characterInputAnswerText,
    characterInputPrerevealedPositions,
    choiceOptionsLayoutClass,
    isGuessableChar
  } from '@/lib/utils/grading';

  // The author-side preview of one saved question. Every quizScript question shares one
  // {text, media, options, settings} data shape regardless of `variant`, so there's a single view
  // component here rather than a per-type registry — but the ANSWER of each variant has a genuinely
  // different shape, and this renders that shape rather than one generic option list.
  //
  // The point is scanning: a builder page is a stack of these, and previously every variant rendered
  // as the same flat list of options with a green tick beside each "correct" one. On `order_items` that was
  // actively misleading (every item is correct — the SEQUENCE is the answer), and on
  // `match_pairs`/`group_items` it hid the pairing entirely. Each preview below now mirrors the structure
  // the player will actually see, so the variant is legible from the shape alone, without reading the
  // label. Nothing here is decorative: numbering appears only where order carries meaning, arrows
  // only where something maps to something else.
  let {
    question,
    onFocus
  }: { question: QuizScriptQuestion; onFocus?: (target: FocusTarget) => void } = $props();

  const interactive = $derived(!!onFocus);
  const settingsEntries = $derived(Object.entries(question.settings));
  const optionsContainerClass = $derived(choiceOptionsLayoutClass(question));

  /** Plain-language name plus an icon whose form echoes the answer's shape — a numbered list for
   * `order_items`, a grid for `group_items`, and so on. Named for what the author does, not for the
   * variant keyword, which is already visible in code mode. */
  const VARIANT_LABELS: Record<string, { label: string; icon: Component }> = {
    pick_one: { label: 'Pick one', icon: CircleDot },
    pick_many: { label: 'Pick several', icon: SquareCheck },
    type_answer: { label: 'Type the answer', icon: Type },
    type_pattern: { label: 'Match a pattern', icon: Regex },
    guess_letters: { label: 'Guess the letters', icon: WholeWord },
    order_items: { label: 'Put in order', icon: ListOrdered },
    match_pairs: { label: 'Match pairs', icon: ArrowRight },
    group_items: { label: 'Sort into buckets', icon: LayoutGrid },
    // Not `Type` again: `type_answer` already uses it, and two variants sharing an icon defeats the point
    // of having one. A gap in a line of text is what this variant actually looks like.
    fill_blanks: { label: 'Fill the blanks', icon: RectangleEllipsis }
  };
  const variantMeta = $derived(VARIANT_LABELS[question.variant]);

  /** Option indices paired with their options, so a preview can regroup or reorder them (group_items
   * groups by bucket, fill_blanks splits answers from distractors) and still ask the form editor
   * to focus the right ORIGINAL option. */
  const indexedOptions = $derived(question.options.map((option, index) => ({ option, index })));
  const buckets = $derived(question.variant === 'group_items' ? categoriseBuckets(question) : []);
  const blankAnswers = $derived(indexedOptions.filter(({ option }) => option.correct));
  const blankDistractors = $derived(indexedOptions.filter(({ option }) => !option.correct));

  const answerText = $derived(
    question.variant === 'guess_letters' ? characterInputAnswerText(question) : ''
  );
  // `letters_shown_at_start`'s random extras are resolved per play session, not here, so this shows only
  // the author's explicit `[X]` brackets — the part that's actually a property of the question.
  const prerevealed = $derived(
    question.variant === 'guess_letters'
      ? characterInputPrerevealedPositions(question, new Set())
      : new Set<number>()
  );

  function pointsLabel(option: QuizScriptOption): string {
    if (option.points === undefined) return option.correct ? 'Correct' : 'Incorrect';
    return `${option.points >= 0 ? '+' : ''}${option.points} pts`;
  }
</script>

<!-- Shared wrapper for every focusable preview row below — two fully separate static branches
     (rather than one div with a conditional role/tabindex) so Svelte's a11y check can actually
     see that a nonnegative tabindex only ever appears together with role="button", instead of
     conservatively flagging a div whose role and tabindex are each independently conditional on
     the same `interactive` flag but written as two separate ternaries. -->
{#snippet focusableRow(extraClass: string, onActivate: () => void, children: Snippet)}
  {#if interactive}
    <div
      class="{extraClass} cursor-pointer hover:ring-2 hover:ring-slate-300"
      role="button"
      tabindex="0"
      onclick={onActivate}
      onkeydown={(e) => e.key === 'Enter' && onActivate()}
    >
      {@render children()}
    </div>
  {:else}
    <div class={extraClass}>
      {@render children()}
    </div>
  {/if}
{/snippet}

{#snippet mediaBlock(
  media: { kind: 'image' | 'video'; alt: string; url: string },
  size: 'question' | 'option'
)}
  {#if media.kind === 'image'}
    <img
      src={media.url}
      alt={media.alt}
      class="rounded-md border border-slate-200 object-contain {size === 'question'
        ? 'max-h-80'
        : 'max-h-40'}"
    />
  {:else}
    <div
      class="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
    >
      <Video size={15} class="shrink-0 text-slate-400" />
      <span class="truncate">{media.alt || media.url}</span>
    </div>
  {/if}
{/snippet}

<!-- One piece of option content, for the previews that just need "what does this item say". Takes
     the content rather than the whole option so a `match_pairs` target — same shape, opposite side
     of the row — renders through it too. -->
{#snippet contentBody(content: QuizScriptOptionContent)}
  {#if content.kind === 'text'}
    <p class="text-sm text-slate-900">{content.text}</p>
  {:else}
    {@render mediaBlock(content, 'option')}
  {/if}
{/snippet}

{#snippet weightBadge(option: QuizScriptOption)}
  {#if option.points !== undefined}
    <span class="shrink-0 text-xs font-semibold text-slate-500">
      {option.points >= 0 ? '+' : ''}{option.points} pts
    </span>
  {/if}
{/snippet}

<!-- A caption naming what the rows beneath it are, since "the answer" means something different per
     variant — an authored sequence, a set of pairs, a partition. Without it, `order_items`'s numbered list
     is indistinguishable from a list that merely happens to be numbered. -->
{#snippet answerKeyLabel(text: string)}
  <p class="text-xs font-medium uppercase tracking-wide text-slate-500">{text}</p>
{/snippet}

<div class="space-y-3">
  {#if variantMeta}
    {@const Icon = variantMeta.icon}
    <span
      class="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
    >
      <Icon size={13} class="shrink-0 text-indigo-500" />
      {variantMeta.label}
    </span>
  {/if}

  <!-- fill_blanks renders its own text (with the answers inlined), so the plain text row would
       be a duplicate of it. -->
  {#if question.variant !== 'fill_blanks' && (question.text || question.media.length === 0)}
    {#snippet textRow()}
      <p class="whitespace-pre-wrap text-slate-900">{question.text || 'Untitled question'}</p>
    {/snippet}
    {@render focusableRow('rounded-md p-2', () => onFocus?.({ field: 'text' }), textRow)}
  {/if}

  {#each question.media as media, index (index)}
    {#snippet mediaRow()}
      {@render mediaBlock(media, 'question')}
    {/snippet}
    {@render focusableRow('rounded-md p-2', () => onFocus?.({ field: 'media', index }), mediaRow)}
  {/each}

  {#each question.extras as extra, index (index)}
    {#snippet extraRow()}
      <p class="flex items-center gap-1 text-xs font-medium text-slate-500">
        <Eye size={12} />
        {extra.label || 'Hint'}
      </p>
      <p class="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{extra.content}</p>
      {#if extra.points !== 0}
        <span
          class="mt-1 inline-block text-xs font-semibold {extra.points > 0
            ? 'text-green-700'
            : 'text-red-600'}"
        >
          {extra.points >= 0 ? '+' : ''}{extra.points} pts
        </span>
      {/if}
    {/snippet}
    {@render focusableRow(
      'rounded-md border border-dashed border-slate-300 bg-slate-50 p-2',
      () => onFocus?.({ field: 'extra', index }),
      extraRow
    )}
  {/each}

  {#if question.variant === 'order_items'}
    <!-- Numbered because the number IS the answer: this is the authored sequence a player has to
         reproduce, not a list that happens to be enumerated. -->
    <div class="space-y-1.5">
      {@render answerKeyLabel('Correct order')}
      {#each indexedOptions as { option, index } (index)}
        {#snippet orderRow()}
          <div class="flex items-center gap-2">
            <span
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-600 text-xs font-semibold text-white"
            >
              {index + 1}
            </span>
            <div class="min-w-0 flex-1">{@render contentBody(option.content)}</div>
            {@render weightBadge(option)}
          </div>
        {/snippet}
        {@render focusableRow(
          'rounded-md border border-slate-200 p-2.5',
          () => onFocus?.({ field: 'option', index }),
          orderRow
        )}
      {/each}
    </div>
  {:else if question.variant === 'match_pairs'}
    <div class="space-y-1.5">
      {@render answerKeyLabel('Correct pairs')}
      {#each indexedOptions as { option, index } (index)}
        {#snippet matchRow()}
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1">{@render contentBody(option.content)}</div>
            <ArrowRight size={14} class="shrink-0 text-indigo-500" />
            <div class="min-w-0 flex-1">
              {#if option.target}{@render contentBody(option.target)}{/if}
            </div>
            {@render weightBadge(option)}
          </div>
        {/snippet}
        {@render focusableRow(
          'rounded-md border border-slate-200 p-2.5',
          () => onFocus?.({ field: 'option', index }),
          matchRow
        )}
      {/each}
    </div>
  {:else if question.variant === 'group_items'}
    <!-- Grouped by bucket rather than listed flat, because the grouping is the answer — and it shows
         at a glance when a bucket has only one item, which usually means a typo in a target. -->
    <div class="space-y-2">
      {@render answerKeyLabel('Correct grouping')}
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {#each buckets as bucket (bucket)}
          <!-- `role="group"` named for the bucket, matching how CategoriseBoard labels its trays —
               a grouped list of items genuinely is a group, and it gives the bucket one handle
               rather than requiring anything to reach it through the DOM around its heading. -->
          <div
            role="group"
            aria-label={bucket}
            class="rounded-lg border border-slate-200 bg-slate-50/50 p-2"
          >
            <p class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {bucket}
            </p>
            <div class="space-y-1">
              {#each indexedOptions.filter(({ option }) => optionTargetText(option) === bucket) as { option, index } (index)}
                {#snippet categoriseItem()}
                  <div class="flex items-center gap-2">
                    <div class="min-w-0 flex-1">{@render contentBody(option.content)}</div>
                    {@render weightBadge(option)}
                  </div>
                {/snippet}
                {@render focusableRow(
                  'rounded-md border border-slate-200 bg-white p-1.5',
                  () => onFocus?.({ field: 'option', index }),
                  categoriseItem
                )}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if question.variant === 'fill_blanks'}
    <!-- The sentence with its answers filled in, which is the only way to see whether they read
         correctly in place — an author checking a cloze question is checking the whole sentence, not
         a detached list of words. -->
    {@const segments = question.text.split('___')}
    <div class="space-y-2">
      {#snippet blanksText()}
        <!-- Written without line breaks between the segment and the filled-in answer, and with no
             horizontal padding or margin on the answer itself: this is running text, so anything
             that separates the answer from the characters around it shows up as a stray space
             before the sentence's own punctuation ("...of the cell ."). An underline alone marks
             the answer without taking it out of the line. The segments already carry whatever
             spacing the author wrote. -->
        <!-- prettier-ignore -->
        <p class="whitespace-pre-wrap text-slate-900">{#each segments as segment, i (i)}{segment}{#if i < segments.length - 1}{@const answer = blankAnswers[i]}<span class="border-b-2 border-green-500 font-semibold text-green-800">{answer ? optionLabelText(answer.option) : '___'}</span>{/if}{/each}</p>
      {/snippet}
      {@render focusableRow('rounded-md p-2', () => onFocus?.({ field: 'text' }), blanksText)}

      {#if blankDistractors.length > 0}
        <div class="space-y-1.5">
          {@render answerKeyLabel('Decoy words')}
          <div class="flex flex-wrap gap-1.5">
            {#each blankDistractors as { option, index } (index)}
              {#snippet distractorChip()}
                <span class="text-xs font-medium text-slate-600">{optionLabelText(option)}</span>
              {/snippet}
              {@render focusableRow(
                'rounded-md border border-slate-300 bg-white px-2 py-1',
                () => onFocus?.({ field: 'option', index }),
                distractorChip
              )}
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else if question.variant === 'guess_letters'}
    <!-- One box per character, the way the player sees it, with the author's `[X]` pre-reveals
         already shown as revealed — that's the difference between "guess a 5-letter word" and
         "guess a 5-letter word starting with P", and it's not visible any other way outside code
         mode. -->
    <div class="space-y-1.5">
      {@render answerKeyLabel('Answer')}
      {#snippet characterRow()}
        <div class="flex flex-wrap items-center gap-1">
          {#each answerText.split('') as char, i (i)}
            {#if !isGuessableChar(char)}
              <span class="flex h-8 w-3 items-center justify-center text-sm text-slate-500"
                >{char}</span
              >
            {:else}
              <span
                class="flex h-8 w-7 items-center justify-center rounded border text-sm font-semibold {prerevealed.has(
                  i
                )
                  ? 'border-green-400 bg-green-50 text-green-800'
                  : 'border-slate-300 bg-white text-slate-900'}"
              >
                {char}
              </span>
            {/if}
          {/each}
        </div>
        <p class="mt-1.5 text-xs text-slate-500">
          Green letters are revealed before the player starts.
        </p>
      {/snippet}
      {@render focusableRow(
        'rounded-md border border-slate-200 p-2.5',
        () => onFocus?.({ field: 'option', index: 0 }),
        characterRow
      )}
    </div>
  {:else if question.variant === 'type_pattern'}
    <!-- The patterns themselves ARE the answer key, and unlike every other variant both markers
         carry meaning — a `~` pattern is an authored "this response is wrong", not a distractor.
         Rendered monospace, since a regex read in a proportional face is genuinely harder to
         check. -->
    <div class="space-y-1.5">
      {@render answerKeyLabel('Patterns')}
      {#each indexedOptions as { option, index } (index)}
        {#snippet patternRow()}
          <div class="flex items-start gap-2">
            {#if option.correct}
              <CircleCheck size={14} class="mt-0.5 shrink-0 text-green-600" />
            {:else}
              <CircleX size={14} class="mt-0.5 shrink-0 text-red-500" />
            {/if}
            <code class="min-w-0 flex-1 break-all font-mono text-sm text-slate-900"
              >{optionLabelText(option)}</code
            >
            {@render weightBadge(option)}
          </div>
        {/snippet}
        {@render focusableRow(
          `rounded-md border p-2.5 ${option.correct ? 'border-green-300' : 'border-red-300'}`,
          () => onFocus?.({ field: 'option', index }),
          patternRow
        )}
      {/each}
    </div>
  {:else if question.variant === 'type_answer'}
    <div class="space-y-1.5">
      {@render answerKeyLabel(
        question.options.length === 1 ? 'Accepted answer' : 'Accepted answers'
      )}
      <div class="flex flex-wrap gap-1.5">
        {#each indexedOptions as { option, index } (index)}
          {#snippet acceptedChip()}
            <div class="flex items-center gap-1.5">
              {#if option.content.kind === 'text'}
                <span class="text-sm font-medium text-green-800">{option.content.text}</span>
              {:else}
                {@render mediaBlock(option.content, 'option')}
              {/if}
              {@render weightBadge(option)}
            </div>
          {/snippet}
          {@render focusableRow(
            'rounded-md border border-green-300 bg-green-50 px-2 py-1',
            () => onFocus?.({ field: 'option', index }),
            acceptedChip
          )}
        {/each}
      </div>
    </div>
  {:else}
    <!-- pick_one / pick_many / the bare default: the one case where the player really does
         see a flat list, so the preview is one too. The leading glyph mirrors the control they'll
         get — a radio for pick-one, a checkbox for pick-several. -->
    <div class={optionsContainerClass}>
      {#each indexedOptions as { option, index } (index)}
        {#snippet choiceOptionRow()}
          <div class="flex items-start gap-2">
            <!-- Says which control the player gets, and nothing else — correctness is already
                 carried by the dashed green border and the verdict line below, so tinting this
                 green as well would be the same fact stated three times. -->
            {#if question.variant === 'pick_one'}
              <CircleDot size={15} class="mt-0.5 shrink-0 text-slate-400" />
            {:else}
              <SquareCheck size={15} class="mt-0.5 shrink-0 text-slate-400" />
            {/if}
            <div class="min-w-0 flex-1">
              {@render contentBody(option.content)}
              {#if option.correct}
                <span
                  class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green-700"
                >
                  <CircleCheck size={13} />
                  {pointsLabel(option)}
                </span>
              {:else}
                <span
                  class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600"
                >
                  <CircleX size={13} />
                  {pointsLabel(option)}
                </span>
              {/if}
            </div>
          </div>
        {/snippet}
        {@render focusableRow(
          `rounded-md border p-3 ${option.correct ? 'border-green-400 border-dashed' : 'border-slate-200'}`,
          () => onFocus?.({ field: 'option', index }),
          choiceOptionRow
        )}
      {/each}
    </div>
  {/if}

  {#if settingsEntries.length > 0}
    {#snippet settingsRow()}
      {#each settingsEntries as [key, value] (key)}
        <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
          >{key}: {String(value)}</span
        >
      {/each}
    {/snippet}
    {@render focusableRow(
      'flex flex-wrap items-center gap-1.5 rounded-md p-2',
      () => onFocus?.({ field: 'settings' }),
      settingsRow
    )}
  {/if}
</div>
