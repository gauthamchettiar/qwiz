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
    icon,
    onSelect
  }: {
    kinds: readonly { value: T; label: string; icon: Component }[];
    /** The kind currently chosen, in `select` mode. Omit for `action` mode, where the menu performs
     * a one-off action (adding a row) rather than reporting a standing choice. */
    value?: T;
    /** Names what's being chosen, for the trigger's accessible name — "Option content type", or
     * "Add option" for an action menu. */
    label: string;
    /** Set to switch the trigger from "the current kind's icon" to a fixed one — which is what
     * makes this an ACTION menu: there's no current value to display, so the items become
     * `menuitem` (a thing to do) rather than `menuitemradio` (a thing that's selected). */
    icon?: Component;
    onSelect: (value: T) => void;
  } = $props();

  let open = $state(false);
  const isAction = $derived(icon !== undefined);
  const current = $derived(kinds.find((k) => k.value === value) ?? kinds[0]);
  const TriggerIcon = $derived(icon ?? current.icon);
  const menuId = $props.id();

  function choose(next: T) {
    open = false;
    onSelect(next);
  }
</script>

<div class="relative shrink-0" use:clickOutside={() => (open = false)}>
  <button
    type="button"
    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-raised text-ink-soft hover:bg-surface"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={menuId}
    aria-label={isAction ? label : `${label}: ${current.label}`}
    onclick={() => (open = !open)}
  >
    <TriggerIcon size={16} class="shrink-0" />
    <ChevronDown size={10} class="-mr-1 shrink-0 text-ink-faint" />
  </button>

  {#if open}
    <!-- Escape on the menu itself rather than a window listener: this sits inside a question card
         that already binds Escape to "leave code mode" (QuizBuilder's own keydown handler), and a
         window-level one here would close both at once. -->
    <div
      id={menuId}
      role="menu"
      class="absolute left-0 top-full z-20 mt-1 min-w-max rounded-md border border-line-subtle bg-surface-raised py-1 shadow-md"
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
          role={isAction ? 'menuitem' : 'menuitemradio'}
          aria-checked={isAction ? undefined : kind.value === value}
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm {!isAction &&
          kind.value === value
            ? 'bg-surface-hover font-medium text-ink'
            : 'text-ink-soft hover:bg-surface'}"
          onclick={() => choose(kind.value)}
        >
          <Icon size={15} class="shrink-0" />
          {kind.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
