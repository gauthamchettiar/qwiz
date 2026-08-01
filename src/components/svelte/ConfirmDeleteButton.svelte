<script lang="ts">
  import { Trash2, Check } from '@lucide/svelte';

  let {
    onConfirm,
    label = 'Delete',
    ariaLabel,
    variant = 'icon',
    revertMs = 3000
  }: {
    onConfirm: () => void;
    /** Shown next to the confirm icon for variant 'button'; used as the default aria-label/title otherwise. */
    label?: string;
    ariaLabel?: string;
    /** 'icon' = compact trash icon (card toolbars, list rows). 'button' = full labeled button (page-level actions). */
    variant?: 'icon' | 'button';
    revertMs?: number;
  } = $props();

  let confirming = $state(false);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // Clicking the trash icon/button doesn't delete immediately — it swaps to a filled "confirm"
  // button the user must actively click again, and silently reverts after a few seconds if they
  // don't (e.g. they clicked it by mistake).
  function startConfirm() {
    confirming = true;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => (confirming = false), revertMs);
  }

  function confirmDelete() {
    clearTimeout(timeoutId);
    confirming = false;
    onConfirm();
  }

  $effect(() => () => clearTimeout(timeoutId));
</script>

{#if confirming}
  {#if variant === 'icon'}
    <button
      type="button"
      class="flex items-center justify-center rounded-md bg-negative p-1.5 text-ink-inverse hover:bg-negative-hover"
      onclick={confirmDelete}
      aria-label="Click to confirm delete"
      title="Click to confirm delete"
    >
      <Check size={15} />
    </button>
  {:else}
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md bg-negative px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-negative-hover"
      onclick={confirmDelete}
    >
      <Check size={15} /> Confirm {label.toLowerCase()}?
    </button>
  {/if}
{:else if variant === 'icon'}
  <button
    type="button"
    class="rounded-md border border-line-subtle bg-surface-raised p-1.5 text-ink-faint hover:bg-negative-surface hover:text-negative-ink-soft"
    onclick={startConfirm}
    aria-label={ariaLabel ?? label}
    title={ariaLabel ?? label}
  >
    <Trash2 size={15} />
  </button>
{:else}
  <button
    type="button"
    class="inline-flex items-center gap-1.5 rounded-md border border-negative-line-faint px-4 py-2 text-sm font-medium text-negative-ink hover:bg-negative-surface"
    onclick={startConfirm}
  >
    <Trash2 size={15} />
    {label}
  </button>
{/if}
