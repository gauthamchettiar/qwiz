<script lang="ts">
  import { Check, ChevronDown, Monitor, Moon, Sun } from '@lucide/svelte';
  import { clickOutside } from '@/lib/utils/clickOutside';
  import { applyTheme, readTheme, saveTheme, SYSTEM_THEME, THEMES } from '@/lib/stores/theme';

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
  <button
    type="button"
    class="flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-sm text-ink-soft hover:bg-surface-hover"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={menuId}
    aria-label={`Theme: ${currentLabel}`}
    onclick={() => (open = !open)}
  >
    <Sun size={15} class="shrink-0" />
    <ChevronDown size={12} class="shrink-0 text-ink-faint" />
  </button>

  {#if open}
    <div
      id={menuId}
      role="menu"
      class="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-md border border-line-subtle bg-surface-raised py-1 shadow-lg"
    >
      <!-- "System" first and on its own: it's not a look, it's a deferral to one, so grouping it
           among the concrete themes would misrepresent what picking it does. -->
      {@render item(SYSTEM_THEME, 'System', Monitor)}
      <div class="my-1 border-t border-line-faint"></div>
      {#each THEMES as theme (theme.id)}
        {@render item(theme.id, theme.label, theme.mode === 'dark' ? Moon : Sun)}
      {/each}
    </div>
  {/if}
</div>

{#snippet item(id: string, label: string, Icon: typeof Sun)}
  <button
    type="button"
    role="menuitemradio"
    aria-checked={current === id}
    class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm {current === id
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
