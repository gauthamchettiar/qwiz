<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';

  // The minimal header's Back link. Always a real anchor to `/`, so it can be middle-clicked,
  // opened in a new tab and previewed on hover like any other link — but if the visitor arrived
  // from elsewhere in this app, a click instead replays the browser's own history, which is a
  // truer "back" than always landing on the library.
  //
  // `useHistory` is resolved during component init rather than in `onMount`, so the FIRST client
  // render already carries the right behaviour — an `onMount` version briefly rendered as a dead
  // click before hydration caught up. Guarded on `window` because Astro still renders this island
  // at build time, where there is no referrer to read; the static HTML therefore always falls back
  // to a plain link to `/` until the island's JS runs.
  const useHistory =
    typeof window !== 'undefined' && canGoBack(document.referrer, window.location.origin);

  /** Whether `referrer` is somewhere in this app, and so worth going back to. A referrer from
   * elsewhere (or none at all — a pasted link, a new tab) means history would take the visitor off
   * the site entirely, which is not what a Back link inside an app should do. */
  function canGoBack(referrer: string, origin: string): boolean {
    if (!referrer) return false;
    try {
      return new URL(referrer).origin === origin;
    } catch {
      return false;
    }
  }

  function onclick(event: MouseEvent) {
    if (!useHistory) return;
    // Leave modified clicks alone — ctrl/cmd/middle click means "open in a new tab", and the href
    // is still a sensible destination for that.
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    history.back();
  }
</script>

<a
  href="/"
  {onclick}
  class="qwiz-back inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
>
  <ArrowLeft size={16} /> Back
</a>
