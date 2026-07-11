<script lang="ts">
  import { X } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  // Shared modal shell (crisp hairline: thin border, one soft shadow so it reads as floating,
  // no rounded-xl). Used by Import JSON and Edit-question-JSON so both dialogs stay identical.
  let {
    title,
    titleExtra,
    body,
    footer
  }: {
    title: string;
    /** Optional inline content beside the title (e.g. a schema-download link). */
    titleExtra?: Snippet;
    body: Snippet;
    footer: Snippet;
  } = $props();

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
  class="fixed inset-0 m-auto w-full max-w-lg rounded-lg border border-slate-300 p-0 shadow-md backdrop:bg-slate-900/30 focus:outline-none"
>
  <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
    <div class="flex items-center gap-3">
      <h2 class="text-base font-semibold text-slate-900">{title}</h2>
      {#if titleExtra}{@render titleExtra()}{/if}
    </div>
    <button
      type="button"
      class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      onclick={close}
      aria-label="Close"
    >
      <X size={16} />
    </button>
  </div>

  <div class="space-y-4 px-5 py-4">
    {@render body()}
  </div>

  <div class="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
    {@render footer()}
  </div>
</dialog>
