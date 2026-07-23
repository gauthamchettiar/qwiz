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
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();

  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50';

  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'border border-red-200 text-red-600 hover:bg-red-50'
  } as const;

  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm' } as const;

  const cls = $derived(`${base} ${variants[variant]} ${sizes[size]}`);
</script>

{#if href}
  <a {href} class={cls} aria-label={ariaLabel} {title}>
    {@render children()}
  </a>
{:else}
  <button {type} class={cls} {disabled} aria-label={ariaLabel} {title} {onclick}>
    {@render children()}
  </button>
{/if}
