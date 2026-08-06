<script lang="ts">
  import Button from './Button.svelte';
  import Dialog from './Dialog.svelte';

  // "You're about to lose something" — shared by the two screens that can hold state worth
  // keeping: a run in progress (QuizPlayer) and unsaved edits (QuizBuilder). Extracted rather than
  // copied because it's all logic, and the subtle parts below are exactly the sort that rot in a
  // second copy.
  //
  // Two mechanisms, because no single one covers every way of leaving:
  //
  // - A capture-phase click listener catches in-page links (the header logo, "+ New", the
  //   play screen's "Back"), which is the common case and the only one where a real dialog with
  //   real wording is possible.
  // - `beforeunload` is the fallback for everything a click listener can't see coming: browser
  //   back/forward, a typed URL, tab close, refresh. It only ever produces the browser's own
  //   generic prompt — by design, so a page can't fake a more alarming one — so it's a safety net
  //   under the dialog, not a substitute for it.
  let {
    active,
    title,
    message,
    confirmLabel = 'Leave'
  }: {
    /** Whether there's anything worth warning about right now. Both listeners attach and detach
     * with this, so a clean screen has no interception at all. */
    active: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
  } = $props();

  let dialog: Dialog;
  let pendingHref = $state<string | null>(null);
  // Held here rather than only inside the effect's closure so `release` can remove it
  // synchronously the instant it's needed — setting a flag and waiting for Svelte's next effect
  // flush would be racing the browser's own navigation.
  let beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

  /** Stands the guard down immediately, for a navigation the host itself is about to perform (a
   * save that redirects, a delete). Without it, the host's own `window.location.href` would trip
   * the browser prompt on the way out. */
  export function release() {
    if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadHandler = null;
  }

  function cancelLeave() {
    pendingHref = null;
    dialog.close();
  }

  function confirmLeave() {
    // Without this, confirming here would still trigger the native beforeunload prompt a moment
    // later when `pendingHref`'s navigation actually starts — a second, redundant "are you sure"
    // right after the one just answered.
    release();
    dialog.close();
    if (pendingHref) window.location.href = pendingHref;
  }

  // Skips anything that isn't "leaving in this tab right now": modifier and middle clicks and a
  // non-`_self` target open elsewhere without unloading this page, and a link resolving to the
  // current URL isn't going anywhere.
  $effect(() => {
    if (!active) return;
    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor || !anchor.href) return;
      if (anchor.target && anchor.target !== '_self') return;
      // A download anchor doesn't unload anything — it saves a file and leaves the page exactly
      // where it is. Intercepting it swallowed the click outright, so "Download .qwiz" and
      // "Download .zip" silently did nothing (and popped a leave prompt) whenever there were
      // unsaved edits, which is precisely when someone reaches for them. `downloadBlobFile`
      // (download.ts) builds one of these, attaches it and clicks it.
      if (anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.href === window.location.href) return;
      e.preventDefault();
      pendingHref = anchor.href;
      dialog.open();
    }
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  });

  // Re-runs whenever `active` changes: cleanup removes the listener before the body re-executes,
  // so it's only ever attached while there's genuinely something to lose.
  $effect(() => {
    if (!active) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    beforeUnloadHandler = handleBeforeUnload;
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      beforeUnloadHandler = null;
    };
  });
</script>

<Dialog bind:this={dialog} {title}>
  {#snippet body()}
    <p class="text-sm text-ink-subtle">{message}</p>
  {/snippet}
  {#snippet footer()}
    <Button size="sm" onclick={cancelLeave}>Stay</Button>
    <Button size="sm" variant="danger" onclick={confirmLeave}>{confirmLabel}</Button>
  {/snippet}
</Dialog>
