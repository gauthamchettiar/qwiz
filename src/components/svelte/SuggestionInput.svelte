<script lang="ts">
  // Same interaction pattern as the category/tag fields in QuizBuilder.svelte (focus opens a
  // filtered, keyboard-navigable dropdown; arrow keys move a highlight; Enter/click selects),
  // extracted here because settings rows need one independent instance per row rather than the
  // single one-off instance those fields each needed.
  let {
    value = $bindable(''),
    suggestions,
    placeholder = '',
    class: className = '',
    oninput
  }: {
    value: string;
    suggestions: string[];
    placeholder?: string;
    class?: string;
    oninput?: () => void;
  } = $props();

  let show = $state(false);
  let highlight = $state(-1);
  let dropdownEl: HTMLDivElement | undefined = $state();
  // One stable id per component instance (there's one of these per settings row) for the
  // combobox/listbox aria-controls relationship below — `$props.id()` is unique per mount and
  // stable for its lifetime, so a fresh one per instance is exactly what's needed here.
  const instanceId = $props.id();
  const listboxId = `${instanceId}-listbox`;

  const options = $derived(suggestions.filter((s) => s.includes(value.trim().toLowerCase())));

  $effect(() => {
    void options;
    highlight = -1;
  });

  $effect(() => {
    if (highlight < 0) return;
    dropdownEl?.querySelectorAll('button')[highlight]?.scrollIntoView({ block: 'nearest' });
  });

  function moveHighlight(current: number, length: number, delta: 1 | -1): number {
    if (length === 0) return -1;
    if (current === -1) return delta === 1 ? 0 : length - 1;
    return (current + delta + length) % length;
  }

  function select(option: string) {
    value = option;
    show = false;
    oninput?.();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      show = true;
      highlight = moveHighlight(highlight, options.length, e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      select(options[highlight]);
    } else if (e.key === 'Escape') {
      show = false;
    }
  }
</script>

<div class="relative {className}">
  <input
    type="text"
    class="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
    {placeholder}
    autocomplete="off"
    role="combobox"
    aria-expanded={show && options.length > 0}
    aria-controls={listboxId}
    bind:value
    oninput={() => oninput?.()}
    onfocus={() => (show = true)}
    onblur={() => (show = false)}
    onkeydown={onKeydown}
  />
  {#if show && options.length > 0}
    <div
      bind:this={dropdownEl}
      id={listboxId}
      role="listbox"
      class="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-md"
    >
      {#each options as option, i (option)}
        <button
          type="button"
          tabindex="-1"
          role="option"
          aria-selected={i === highlight}
          class="block w-full truncate px-3 py-1.5 text-left text-xs {i === highlight
            ? 'bg-slate-100 text-slate-900'
            : 'text-slate-600 hover:bg-slate-50'}"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => select(option)}
        >
          {option}
        </button>
      {/each}
    </div>
  {/if}
</div>
