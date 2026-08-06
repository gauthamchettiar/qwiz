<script lang="ts">
  import { ChevronDown, FolderTree, Plus, FileText } from '@lucide/svelte';
  import { clickOutside } from '@/lib/utils/clickOutside';
  import Button from './Button.svelte';

  // Replaces the old single "+ New" link now that there are two things to create. Small enough
  // (two items) to stay an anchored dropdown at every width, unlike ThemePicker's bottom sheet.
  let open = $state(false);
  const menuId = $props.id();
</script>

<div class="relative" use:clickOutside={() => (open = false)}>
  <Button
    variant="primary"
    size="sm"
    ariaHasPopup="menu"
    ariaExpanded={open}
    ariaControls={menuId}
    onclick={() => (open = !open)}
  >
    <Plus size={15} class="shrink-0" /> New
    <ChevronDown size={12} class="shrink-0" />
  </Button>

  {#if open}
    <div
      id={menuId}
      role="menu"
      class="absolute right-0 z-30 mt-1 min-w-40 rounded-md border border-line-subtle bg-surface-raised p-1 shadow-md"
    >
      <a
        href="/local/create"
        role="menuitem"
        class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-ink-muted hover:bg-surface"
      >
        <FileText size={15} /> New quiz
      </a>
      <a
        href="/local/group"
        role="menuitem"
        class="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-ink-muted hover:bg-surface"
      >
        <FolderTree size={15} /> New group
      </a>
    </div>
  {/if}
</div>
