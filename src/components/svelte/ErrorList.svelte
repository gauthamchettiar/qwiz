<script lang="ts">
  let { errors }: { errors: string[] } = $props();
</script>

{#if errors.length > 0}
  <!-- role="alert" so the failure is announced even when it scrolls into view rather than being
       read in passing — this list is often far from the button that produced it. -->
  <ul
    role="alert"
    class="space-y-1 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
  >
    {#each errors as error (error)}
      <li class="break-words">{error}</li>
    {/each}
  </ul>
{/if}
