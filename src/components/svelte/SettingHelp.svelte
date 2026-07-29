<script lang="ts">
  import { CircleQuestionMark, X } from '@lucide/svelte';
  import { clickOutside } from '@/lib/utils/clickOutside';
  import { SETTING_RULES, type SettingRule } from '@/lib/utils/quizScript';

  // `rules` defaults to the per-question table; pass `QUIZ_SETTING_RULES` for a quiz-wide key.
  let { key, rules = SETTING_RULES }: { key: string; rules?: Record<string, SettingRule> } =
    $props();

  // Settings are a closed set (see SETTING_RULES / QUIZ_SETTING_RULES) — every key this is ever
  // called with is known.
  const description = $derived(rules[key]?.description ?? '');
  // Rendered one line per array entry (see below) rather than relying on CSS to turn embedded "\n"
  // characters back into line breaks — a blank entry (from a "\n\n" paragraph break in the source
  // string) becomes a spacer between blocks instead of an empty paragraph.
  const lines = $derived(description.split('\n'));

  // A real open/closed toggle rather than CSS `:hover` — hover has no equivalent on a touch
  // screen, so a hover-only tooltip is simply unreachable there. Tap to open, tap the trigger
  // again/tap elsewhere/Escape to close; still works with a mouse via a plain click.
  let open = $state(false);

  // One stable id per instance for the trigger/panel aria-controls relationship — same
  // `$props.id()` usage as SuggestionInput's listbox, which must be a top-level declaration.
  const instanceId = $props.id();
  const panelId = `${instanceId}-help`;

  // The panel is `position: fixed` and placed from the trigger's own viewport rect rather than
  // `absolute`-positioned inside the settings row. As an absolutely-positioned, trigger-centred
  // `w-64` box it could extend past the right edge of the document — which widens the scrollable
  // area, and on mobile that means the browser zooms the whole page out to fit and leaves a strip
  // of dead space to the right until the panel closes. A fixed box clamped to the viewport
  // physically cannot do that, whatever it's anchored to.
  const PANEL_WIDTH = 256;
  const VIEWPORT_MARGIN = 12;
  /** Below this, an anchored bubble has nowhere useful to go — a full-width sheet at the bottom of
   * the screen is both readable and unambiguously dismissible. */
  const SHEET_MAX_WIDTH = 480;

  let triggerEl: HTMLButtonElement | undefined = $state();
  let panelEl: HTMLElement | undefined = $state();
  let isSheet = $state(false);
  let panelStyle = $state('');
  // Suppresses the first frame, where the panel has been rendered (so it can be measured) but not
  // yet placed — without this it flashes at the top-left corner before jumping into position.
  let placed = $state(false);

  function place() {
    if (!triggerEl || !panelEl) return;
    const viewportWidth = window.innerWidth;

    if (viewportWidth <= SHEET_MAX_WIDTH) {
      isSheet = true;
      panelStyle = '';
      placed = true;
      return;
    }

    isSheet = false;
    const rect = triggerEl.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
    const height = panelEl.offsetHeight;

    const centered = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(centered, viewportWidth - VIEWPORT_MARGIN - width)
    );
    // Above the trigger by preference (the settings rows it annotates are usually near the bottom
    // of their card), flipping below only when there genuinely isn't room.
    const above = rect.top - VIEWPORT_MARGIN - height;
    const top = above >= VIEWPORT_MARGIN ? above : rect.bottom + VIEWPORT_MARGIN;

    panelStyle = `left:${left}px;top:${top}px;width:${width}px;`;
    placed = true;
  }

  $effect(() => {
    if (!open || !panelEl) return;
    place();
    // A fixed panel doesn't travel with its trigger, so anything that moves the trigger has to
    // re-place it. Capture phase catches scrolling inside any container, not just the page.
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  });

  function toggle() {
    open = !open;
    if (!open) placed = false;
  }

  function close() {
    open = false;
    placed = false;
  }
</script>

<span class="inline-flex" use:clickOutside={close}>
  <button
    bind:this={triggerEl}
    type="button"
    class="cursor-help text-slate-400 hover:text-slate-600"
    aria-label="What does this setting do?"
    aria-expanded={open}
    aria-controls={panelId}
    onclick={toggle}
  >
    <CircleQuestionMark size={12} />
  </button>
  {#if open}
    <div
      bind:this={panelEl}
      id={panelId}
      role="note"
      class="z-30 border border-slate-200 bg-white text-xs font-normal normal-case leading-relaxed text-slate-600 shadow-lg {isSheet
        ? 'fixed inset-x-0 bottom-0 max-h-[60vh] overflow-y-auto rounded-t-xl border-b-0 p-4 pb-6'
        : 'fixed rounded-md p-2.5'} {placed ? '' : 'invisible'}"
      style={panelStyle}
    >
      {#if isSheet}
        <div class="mb-2 flex items-start justify-between gap-3">
          <p class="font-mono text-xs font-semibold text-slate-900">{key}</p>
          <button
            type="button"
            class="-mr-1 -mt-1 rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close description"
            onclick={close}
          >
            <X size={16} />
          </button>
        </div>
      {/if}
      {#each lines as line, i (i)}
        {#if line === ''}
          <div class="h-2"></div>
        {:else if line.startsWith('Accepted values:') || line.startsWith('Default:')}
          {@const [label, ...rest] = line.split(':')}
          <p><span class="font-semibold text-slate-700">{label}:</span>{rest.join(':')}</p>
        {:else}
          <p>{line}</p>
        {/if}
      {/each}
    </div>
  {/if}
</span>
