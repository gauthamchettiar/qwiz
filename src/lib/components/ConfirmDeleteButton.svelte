<script lang="ts">
  import { Trash2, Check } from '@lucide/svelte';

  let {
    onConfirm,
    disabled = false,
    label = 'Delete',
    ariaLabel,
    variant = 'icon',
    revertMs = 3000
  }: {
    onConfirm: () => void;
    disabled?: boolean;
    /** Shown next to the confirm icon for variant 'button'; used as the default aria-label/title otherwise. */
    label?: string;
    ariaLabel?: string;
    /** 'icon' = compact trash icon (question/option toolbars). 'button' = full labeled button (trivia detail page). */
    variant?: 'icon' | 'button';
    revertMs?: number;
  } = $props();

  let confirming = $state(false);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // Clicking the trash icon/button doesn't delete immediately — it swaps to a filled "confirm"
  // button the user must actively click again, and silently reverts after a few seconds if they
  // don't (e.g. they clicked it by mistake).
  function startConfirm() {
    if (disabled) return;
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
      class="flex items-center justify-center rounded bg-red-600 p-1.5 text-white hover:bg-red-700"
      onclick={confirmDelete}
      aria-label="Click to confirm delete"
      title="Click to confirm delete"
    >
      <Check size={15} />
    </button>
  {:else}
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      onclick={confirmDelete}
    >
      <Check size={15} /> Confirm {label.toLowerCase()}?
    </button>
  {/if}
{:else if variant === 'icon'}
  <button
    type="button"
    class="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
    {disabled}
    onclick={startConfirm}
    aria-label={ariaLabel ?? label}
    title={ariaLabel ?? label}
  >
    <Trash2 size={15} />
  </button>
{:else}
  <button
    type="button"
    class="flex items-center gap-1.5 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
    {disabled}
    onclick={startConfirm}
  >
    <Trash2 size={15} /> {label}
  </button>
{/if}
