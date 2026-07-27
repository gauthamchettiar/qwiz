<script lang="ts">
  let { errors }: { errors: string[] } = $props();
</script>

{#if errors.length > 0}
  <ul class="space-y-1 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    {#each errors as error (error)}
      <li class="break-words">{error}</li>
    {/each}
  </ul>
{/if}
