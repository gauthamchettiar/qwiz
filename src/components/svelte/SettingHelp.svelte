<script lang="ts">
  import { CircleQuestionMark, X } from '@lucide/svelte';
  import { clickOutside } from '@/lib/utils/clickOutside';
  import { SETTING_RULES, type SettingRule } from '@/lib/utils/quizScript';

  // `rules` defaults to the per-question table; pass `QUIZ_SETTING_RULES` for a quiz-wide key.
  //
  // `label` switches the trigger from a bare "?" to the key's own name followed by a small "?".
  // A settings ROW already says which key it holds (in its <select>), so there the icon alone is
  // the whole control; a legend of keys does not, and pairing each name with a separate 32px icon
  // button made every wrapped line of that legend more than twice as tall as its text. Naming the
  // trigger collapses the two into one control, and a wide chip is a comfortable target even at
  // 24px tall.
  let {
    key,
    label,
    rules = SETTING_RULES
  }: { key: string; label?: string; rules?: Record<string, SettingRule> } = $props();

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
  const TRIGGER_GAP = 6;
  /** Below this, an anchored bubble has nowhere useful to go — a full-width sheet at the bottom of
   * the screen is both readable and unambiguously dismissible. */
  const SHEET_MAX_WIDTH = 480;
  /** Room needed below the trigger to open downwards. A deliberate over-estimate of the tallest
   * description in SETTING_RULES, which is what lets this place the panel WITHOUT measuring it —
   * see `place`. */
  const ASSUMED_PANEL_HEIGHT = 200;

  let triggerEl: HTMLButtonElement | undefined = $state();
  let isSheet = $state(false);
  let panelStyle = $state('');

  /** Positions the panel from the trigger's viewport rect alone — deliberately without measuring
   * the panel itself, so this can run BEFORE the panel is rendered and the very first frame is
   * already in the right place. Measuring would mean rendering it once to get a height, placing it,
   * then re-rendering: two passes, a visible jump unless the first is hidden, and a window in which
   * the panel exists but isn't shown yet.
   *
   * Not needing the real height costs only the choice of direction, which `ASSUMED_PANEL_HEIGHT`
   * covers: downwards whenever there's room for the tallest description, upwards otherwise, pinned
   * to the trigger's own edge either way via a `translateY` the browser resolves against the
   * panel's actual height. */
  function place() {
    if (!triggerEl) return;
    const viewportWidth = window.innerWidth;

    if (viewportWidth <= SHEET_MAX_WIDTH) {
      isSheet = true;
      panelStyle = '';
      return;
    }

    isSheet = false;
    const rect = triggerEl.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);

    const centered = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(centered, viewportWidth - VIEWPORT_MARGIN - width)
    );

    const roomBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const below = roomBelow >= ASSUMED_PANEL_HEIGHT;
    const top = below ? rect.bottom + TRIGGER_GAP : rect.top - TRIGGER_GAP;
    const shift = below ? '0' : '-100%';

    panelStyle = `left:${left}px;top:${top}px;width:${width}px;transform:translateY(${shift});`;
  }

  $effect(() => {
    if (!open) return;
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
    if (open) {
      open = false;
      return;
    }
    // Placed before the panel renders, not after — see `place`.
    place();
    open = true;
  }

  function close() {
    open = false;
  }
</script>

<span class="inline-flex" use:clickOutside={close}>
  <button
    bind:this={triggerEl}
    type="button"
    class={label
      ? 'flex cursor-help items-center gap-1 rounded px-1.5 py-1 font-mono text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      : 'cursor-help rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700'}
    aria-label={label ? undefined : 'What does this setting do?'}
    aria-expanded={open}
    aria-controls={panelId}
    onclick={toggle}
  >
    <!-- Icon-only form: 16px in a p-2 box, a 32px target. The old 12px bare icon was a ~12px one,
         well under any usable touch size, sitting immediately beside the row's remove "×" — two
         adjacent tiny targets where one is destructive. The labelled form gets its target size
         from the key name's own width instead, so the icon can shrink to match the text. -->
    {#if label}
      {label}<CircleQuestionMark size={12} class="shrink-0" />
    {:else}
      <CircleQuestionMark size={16} />
    {/if}
  </button>
  {#if open}
    <div
      id={panelId}
      role="note"
      class="z-30 border border-slate-200 bg-white text-xs font-normal normal-case leading-relaxed text-slate-600 shadow-lg {isSheet
        ? 'fixed inset-x-0 bottom-0 max-h-[60vh] overflow-y-auto rounded-t-xl border-b-0 p-4 pb-6'
        : 'fixed rounded-md p-2.5'}"
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
