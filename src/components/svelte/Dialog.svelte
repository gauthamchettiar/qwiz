<script lang="ts">
  import { X } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  // Shared modal shell (crisp hairline: thin border, one soft shadow so it reads as floating) so
  // every dialog in the app stays visually identical instead of each rolling its own.
  let {
    title,
    titleExtra,
    size = 'md',
    class: extraClass = '',
    body,
    footer
  }: {
    title: string;
    /** Optional inline content beside the title (e.g. a schema-download link). */
    titleExtra?: Snippet;
    /** `lg` is for the theme editor, whose token list and live preview genuinely need the width —
     * a prop rather than a class on the caller so the two sizes stay a closed set. */
    size?: 'md' | 'lg';
    /** Extra classes on the <dialog>. Carries the `qwiz-*` hook for dialogs that appear during a
     * run (the leave confirmation), so a quiz's own styling reaches them too. */
    class?: string;
    body: Snippet;
    footer: Snippet;
  } = $props();

  const widths = { md: 'max-w-lg', lg: 'max-w-3xl' };

  let dialogEl: HTMLDialogElement;

  export function open() {
    dialogEl.showModal();
    // showModal() auto-focuses the first focusable child; focus the dialog itself instead so
    // nothing inside shows a focus ring on open.
    dialogEl.focus();
  }
  export function close() {
    dialogEl.close();
  }
</script>

<dialog
  bind:this={dialogEl}
  tabindex="-1"
  class="fixed inset-0 m-auto w-full {widths[
    size
  ]} {extraClass} rounded-lg border border-line p-0 shadow-md backdrop:bg-ink/30 focus:outline-none"
>
  <div class="flex items-center justify-between border-b border-line-faint px-5 py-4">
    <div class="flex items-center gap-3">
      <h2 class="text-base font-semibold text-ink">{title}</h2>
      {#if titleExtra}{@render titleExtra()}{/if}
    </div>
    <button
      type="button"
      class="rounded p-1 text-ink-faint hover:bg-surface-hover hover:text-ink-soft"
      onclick={close}
      aria-label="Close"
    >
      <X size={16} />
    </button>
  </div>

  <div class="space-y-4 px-5 py-4">
    {@render body()}
  </div>

  <div class="flex justify-end gap-2 border-t border-line-faint px-5 py-4">
    {@render footer()}
  </div>
</dialog>
