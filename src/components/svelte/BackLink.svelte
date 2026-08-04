<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import { backTarget, canGoBack } from '@/lib/utils/backTarget';

  // The minimal header's Back link. An island rather than a plain `<a href="/">` because where
  // back means depends on the URL, which only exists at runtime — a group three folders deep goes
  // up one folder, a quiz opened out of a repository returns to the folder that listed it.
  //
  // `backTarget` decides; this only navigates. Rendered as a real anchor with a resolved `href`
  // wherever one is computable, so it can be middle-clicked, opened in a new tab and previewed on
  // hover like any other link — only the history fallback needs a click handler.
  // Resolved during component init rather than in `onMount`, so the FIRST client render already
  // carries the right href. With onMount the anchor briefly rendered `href="/"` and a fast click
  // went home instead of up a folder — a real defect, not just a flaky test.
  //
  // Guarded on `window` because Astro still renders this island at build time, where there is no
  // location to read. The static HTML therefore ships NO href at all — deliberately, so that the
  // one instant before the island's JS runs produces a dead click rather than a navigation to the
  // wrong place. A dead click is recoverable; being thrown back to the library loses where you
  // were, which is the whole bug this link exists to fix.
  const initial =
    typeof window === 'undefined'
      ? { href: undefined as string | undefined, useHistory: false }
      : (() => {
          const target = backTarget(window.location.pathname, window.location.search);
          if (target) return { href: target, useHistory: false };
          // Nothing better in the app: go back if we arrived from inside it, otherwise home.
          // Going back to another site is not what a Back link inside an app should do.
          return {
            href: '/',
            useHistory: canGoBack(document.referrer, window.location.origin)
          };
        })();

  const href: string | undefined = initial.href;
  const useHistory = initial.useHistory;

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
  {href}
  {onclick}
  class="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
>
  <ArrowLeft size={16} /> Back
</a>
