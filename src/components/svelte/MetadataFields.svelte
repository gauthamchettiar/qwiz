<script lang="ts">
  import { FolderOpen, Tag as TagIcon, X } from '@lucide/svelte';
  import { categorySuggestions, tagSuggestions } from '@/lib/utils/suggestions';

  // Title, description, category and tags — the block that opens both the quiz builder and the
  // group builder, since a `.qwiz` document and a `.qwizgroup` manifest carry the same four fields
  // in the same frontmatter shape.
  //
  // Extracted rather than copied because the interesting part isn't the markup: it's the two
  // comboboxes, whose arrow-key/highlight/blur handling is subtle enough to have produced a real
  // bug (see the `tabindex="-1"` comment below) and would have had to be fixed twice.
  let {
    title = $bindable(),
    description = $bindable(),
    category = $bindable(),
    tags = $bindable(),
    tagDraft = $bindable(),
    titlePlaceholder,
    descriptionPlaceholder = 'Add a description…',
    titleInvalid = false
  }: {
    title: string;
    description: string;
    category: string;
    tags: string[];
    /** Bound out so the parent can count a half-typed tag as unsaved work — it's typed text a save
     * would discard, and the field is easy to leave without pressing Enter. */
    tagDraft: string;
    titlePlaceholder: string;
    descriptionPlaceholder?: string;
    titleInvalid?: boolean;
  } = $props();

  let titleEl: HTMLInputElement | undefined = $state();

  /** Focus (and scroll to) the title, for a parent reporting that it's the missing field. */
  export function focusTitle(behavior: 'auto' | 'smooth' = 'smooth') {
    titleEl?.scrollIntoView({ behavior, block: 'center' });
    titleEl?.focus();
  }

  /** Commit whatever is half-typed in the tag field. A parent calls this before serializing to
   * source, where an uncommitted tag would otherwise vanish the moment the document is applied. */
  export function commitTagDraft() {
    addTag();
  }

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
</script>

<div class="-mx-1 space-y-1">
  <input
    bind:this={titleEl}
    type="text"
    class="w-full rounded-md px-1 py-1 text-2xl font-bold text-ink placeholder:text-ink-ghost focus:outline-none focus:ring-2 focus:ring-line-subtle {titleInvalid
      ? 'border border-negative-line-subtle ring-1 ring-negative-surface-strong'
      : 'border-0 bg-transparent'}"
    placeholder={titlePlaceholder}
    aria-label="Title"
    bind:value={title}
  />
  <textarea
    class="w-full resize-none rounded-md border-0 bg-transparent px-1 py-1 text-sm text-ink-subtle placeholder:text-ink-ghost focus:outline-none focus:ring-2 focus:ring-line-subtle"
    rows="2"
    placeholder={descriptionPlaceholder}
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
              class="block w-full truncate px-3 py-1.5 text-left text-xs {i === categoryHighlight
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
