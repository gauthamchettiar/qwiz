<script lang="ts">
  // Shared red validation-error box used by the builder and both import dialogs.
  let { errors, size = 'sm' }: { errors: string[]; size?: 'sm' | 'md' } = $props();
</script>

{#if errors.length > 0}
  <div class="rounded-md border border-red-200 bg-red-50 p-3 {size === 'sm' ? 'text-xs' : 'text-sm'} text-red-700">
    <ul class="list-inside list-disc space-y-1">
      {#each errors as err}
        <li>{err}</li>
      {/each}
    </ul>
  </div>
{/if}
