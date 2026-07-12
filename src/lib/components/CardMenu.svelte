<script lang="ts">
  import { MoreVertical } from '@lucide/svelte';
  import { clickOutside } from '../clickOutside';
  import type { Snippet } from 'svelte';

  // A compact "⋮" overflow menu for card actions. The children snippet receives a `close`
  // callback so an item can dismiss the menu after acting (or keep it open, e.g. for a
  // two-step delete confirm). `onClose` fires whenever the menu closes, so consumers can reset
  // any transient state (like a pending confirm).
  let {
    children,
    ariaLabel = 'More actions',
    align = 'right',
    onClose
  }: {
    children: Snippet<[() => void]>;
    ariaLabel?: string;
    align?: 'left' | 'right';
    onClose?: () => void;
  } = $props();

  let open = $state(false);

  function set(next: boolean) {
    if (open === next) return;
    open = next;
    if (!next) onClose?.();
  }
</script>

<div class="relative" use:clickOutside={() => set(false)}>
  <button
    type="button"
    class="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
    aria-label={ariaLabel}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => set(!open)}
  >
    <MoreVertical size={18} />
  </button>
  {#if open}
    <div
      role="menu"
      class="absolute z-20 mt-1 min-w-44 rounded-md border border-slate-200 bg-white p-1 shadow-md {align === 'right'
        ? 'right-0'
        : 'left-0'}"
    >
      {@render children(() => set(false))}
    </div>
  {/if}
</div>
