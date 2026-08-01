<script lang="ts">
  import type { Snippet } from 'svelte';

  // Shared action button, so every button in the app draws from one set of variants instead of
  // re-declaring class strings. Neutral-forward: only `primary` carries the indigo accent;
  // everything else stays on the slate scale. Renders an <a> when `href` is set, else a <button>.
  let {
    variant = 'secondary',
    size = 'md',
    href,
    type = 'button',
    disabled = false,
    ariaLabel,
    title,
    ariaHasPopup,
    ariaExpanded,
    ariaControls,
    onclick,
    children
  }: {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    href?: string;
    type?: 'button' | 'submit';
    disabled?: boolean;
    ariaLabel?: string;
    title?: string;
    /** Menu-trigger wiring, for the buttons that open one. Here rather than left to callers to
     * hand-roll their own <button>, which is how the header ended up with three differently-sized
     * controls — see `sizes` below. */
    ariaHasPopup?: 'menu' | 'dialog' | 'listbox';
    ariaExpanded?: boolean;
    ariaControls?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();

  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line disabled:cursor-not-allowed disabled:opacity-50';

  const variants = {
    primary: 'bg-accent text-ink-inverse hover:bg-accent-hover',
    secondary: 'border border-line bg-surface-raised text-ink-muted hover:bg-surface',
    ghost: 'text-ink-soft hover:bg-surface-hover',
    danger: 'border border-negative-line-faint text-negative-ink hover:bg-negative-surface'
  } as const;

  /** An explicit HEIGHT, not vertical padding. Padding alone makes a button's height depend on two
   * things that vary between buttons sitting side by side: whether the variant has a border
   * (`secondary` does, `primary` doesn't — a 2px difference at identical padding), and whether the
   * content is text or an icon (a 20px line-box versus a 15px glyph). The header had one of each
   * and came out 29px, 29px and 32px. A fixed height with `items-center` makes all four variants
   * and any content agree, and 36px/40px are better touch targets than the 32–34px this produced. */
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-10 px-4 text-sm' } as const;

  const cls = $derived(`${base} ${variants[variant]} ${sizes[size]}`);
</script>

{#if href}
  <a {href} class={cls} aria-label={ariaLabel} {title}>
    {@render children()}
  </a>
{:else}
  <button
    {type}
    class={cls}
    {disabled}
    aria-label={ariaLabel}
    {title}
    aria-haspopup={ariaHasPopup}
    aria-expanded={ariaExpanded}
    aria-controls={ariaControls}
    {onclick}
  >
    {@render children()}
  </button>
{/if}
