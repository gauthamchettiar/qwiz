<script lang="ts" generics="T extends string">
  import type { Component } from 'svelte';
  import { ChevronDown } from '@lucide/svelte';
  import { clickOutside } from '@/lib/utils/clickOutside';

  // The "what kind of thing is this row" control, for an option's content (text/image/video) and
  // for a question element (image/video/reveal).
  //
  // A dropdown of icons rather than a native <select> or a row of always-visible buttons. The
  // <select> rendered at its own font-derived height, which is what made these rows look ragged
  // beside their inputs, and showed the current kind as a WORD where every other row control is an
  // icon. A visible button per kind fixed the height but spent ~116px of every row on three
  // choices, in a row whose most important control — the option text — is the one that should get
  // that space. Collapsed to a single 36px trigger, the text field gains roughly 80px.
  //
  // Generic over the value so each caller keeps its own union (`'text' | 'image' | 'video'`, say)
  // end to end, with no cast back from `string` at the call site.
  let {
    kinds,
    value,
    label,
    onSelect
  }: {
    kinds: readonly { value: T; label: string; icon: Component }[];
    value: T;
    /** Names what's being chosen, for the trigger's accessible name — "Option content type". */
    label: string;
    onSelect: (value: T) => void;
  } = $props();

  let open = $state(false);
  const current = $derived(kinds.find((k) => k.value === value) ?? kinds[0]);
  const menuId = $props.id();

  function choose(next: T) {
    open = false;
    onSelect(next);
  }
</script>

<div class="relative shrink-0" use:clickOutside={() => (open = false)}>
  <button
    type="button"
    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={menuId}
    aria-label={`${label}: ${current.label}`}
    onclick={() => (open = !open)}
  >
    {#if current.icon}
      {@const Icon = current.icon}
      <Icon size={16} class="shrink-0" />
    {/if}
    <ChevronDown size={10} class="-mr-1 shrink-0 text-slate-400" />
  </button>

  {#if open}
    <!-- Escape on the menu itself rather than a window listener: this sits inside a question card
         that already binds Escape to "leave code mode" (QuizBuilder's own keydown handler), and a
         window-level one here would close both at once. -->
    <div
      id={menuId}
      role="menu"
      class="absolute left-0 top-full z-20 mt-1 min-w-max rounded-md border border-slate-200 bg-white py-1 shadow-md"
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          open = false;
        }
      }}
    >
      {#each kinds as kind (kind.value)}
        {@const Icon = kind.icon}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={kind.value === value}
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm {kind.value === value
            ? 'bg-slate-100 font-medium text-slate-900'
            : 'text-slate-600 hover:bg-slate-50'}"
          onclick={() => choose(kind.value)}
        >
          <Icon size={15} class="shrink-0" />
          {kind.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
