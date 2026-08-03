<script lang="ts">
  import { Check, ChevronDown, Monitor, Moon, Sun, X } from '@lucide/svelte';
  import { clickOutside } from '@/lib/utils/clickOutside';
  import Button from './Button.svelte';
  import {
    applyTheme,
    readTheme,
    saveTheme,
    SYSTEM_THEME,
    THEMES,
    themesByMode
  } from '@/lib/stores/theme';

  // A writable `$derived`: reads the stored preference once the component exists in a browser,
  // then lets `choose` overwrite it locally (the same "read once, then let local interactions win"
  // pattern QuizList uses for its quizzes). It can't be read at module scope — this page is
  // prerendered to static HTML, where there's no localStorage and no `<html>` to write to. The
  // pre-paint script in Base.astro has already applied the same value by the time this hydrates;
  // this only needs to catch up its own label.
  let current = $derived(readTheme());
  let open = $state(false);
  const menuId = $props.id();

  // Following the OS means following it as it CHANGES, not just at load — someone on a schedule
  // that flips at sunset would otherwise stay on the theme they happened to load in.
  $effect(() => {
    if (current !== SYSTEM_THEME) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(SYSTEM_THEME);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  // Escape closes it. The anchored dropdown could lean on click-outside alone, since it never
  // covered anything; the sheet dims the whole page, so leaving the keyboard without a way out of
  // it would be a genuine trap.
  $effect(() => {
    if (!open) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });

  const currentLabel = $derived(
    current === SYSTEM_THEME ? 'System' : (THEMES.find((t) => t.id === current)?.label ?? 'System')
  );

  function choose(id: string) {
    current = id;
    applyTheme(id);
    saveTheme(id);
    open = false;
  }
</script>

<div class="relative" use:clickOutside={() => (open = false)}>
  <!-- The shared Button rather than its own markup, so it can't drift out of step with the two
       controls beside it in the header — which is exactly what had happened. -->
  <Button
    size="sm"
    ariaHasPopup="menu"
    ariaExpanded={open}
    ariaControls={menuId}
    ariaLabel={`Theme: ${currentLabel}`}
    onclick={() => (open = !open)}
  >
    <Sun size={15} class="shrink-0" />
    <ChevronDown size={12} class="shrink-0 text-ink-faint" />
  </Button>

  {#if open}
    <!-- Below `sm` the menu becomes a bottom sheet instead of a dropdown anchored under the
         button. Thirteen themes plus two headings are taller than the room left under a header
         control on a phone, so the anchored version opened mostly below the fold — and being
         `absolute` inside a `max-w-3xl` wrapper, the part that overflowed couldn't be scrolled to.
         A sheet is measured from the bottom edge instead, so its height is always room it has. -->
    <button
      type="button"
      aria-label="Close theme menu"
      class="fixed inset-0 z-40 bg-ink/30 sm:hidden"
      onclick={() => (open = false)}
    ></button>

    <div
      class="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl border-t border-line-subtle bg-surface-raised shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:z-30 sm:mt-1 sm:max-h-[70vh] sm:min-w-48 sm:rounded-md sm:border"
    >
      <!-- Phones only: a dropdown needs no title because it hangs off the control that opened it,
           but a sheet rising from the bottom edge has lost that visual tie to the button. -->
      <div class="flex items-center justify-between border-b border-line-faint px-4 py-3 sm:hidden">
        <h2 class="text-sm font-semibold text-ink">Theme</h2>
        <button
          type="button"
          class="rounded p-1 text-ink-faint hover:bg-surface-hover hover:text-ink-soft"
          onclick={() => (open = false)}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <!-- The scrolling list is the `menu` itself, so the sheet's chrome above stays outside a
           role that only permits menu items as children. `env(safe-area-inset-bottom)` keeps the
           last theme clear of the iOS home indicator, which a bottom-anchored sheet sits under. -->
      <div
        id={menuId}
        role="menu"
        class="overflow-y-auto py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] sm:pb-1"
      >
        <!-- "System" first and on its own: it's not a look, it's a deferral to one, so grouping it
             among the concrete themes would misrepresent what picking it does. -->
        {@render item(SYSTEM_THEME, 'System', Monitor)}
        <!-- Grouped by mode: "light or dark" is the first thing anyone is choosing between, and a
             flat run of thirteen made you read every label to find the half you wanted. -->
        {@render group('Light', 'light', Sun)}
        {@render group('Dark', 'dark', Moon)}
      </div>
    </div>
  {/if}
</div>

{#snippet group(heading: string, mode: 'light' | 'dark', Icon: typeof Sun)}
  <div
    class="mt-1 border-t border-line-faint px-4 pb-0.5 pt-1.5 text-xs font-medium text-ink-subtle sm:px-3"
  >
    {heading}
  </div>
  {#each themesByMode(mode) as theme (theme.id)}
    {@render item(theme.id, theme.label, Icon)}
  {/each}
{/snippet}

{#snippet item(id: string, label: string, Icon: typeof Sun)}
  <button
    type="button"
    role="menuitemradio"
    aria-checked={current === id}
    class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm sm:px-3 sm:py-1.5 {current ===
    id
      ? 'bg-surface-hover font-medium text-ink'
      : 'text-ink-soft hover:bg-surface'}"
    onclick={() => choose(id)}
  >
    <Icon size={14} class="shrink-0 text-ink-faint" />
    <span class="flex-1">{label}</span>
    {#if current === id}
      <Check size={14} class="shrink-0 text-accent-ink" />
    {/if}
  </button>
{/snippet}
