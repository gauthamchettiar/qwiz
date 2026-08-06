<script lang="ts">
  let { errors }: { errors: string[] } = $props();
</script>

{#if errors.length > 0}
  <!-- role="alert" so the failure is announced even when it scrolls into view rather than being
       read in passing — this list is often far from the button that produced it.
       It sits on a WRAPPER rather than on the <ul> itself: an explicit role replaces the implicit
       one, so `role="alert"` on the list left every <li> with no list parent, which axe reports as
       a serious violation. Two elements, both roles intact. -->
  <div
    role="alert"
    class="rounded-lg border border-negative-line-faint bg-negative-surface p-4 text-sm text-negative-ink-strong"
  >
    <ul class="space-y-1">
      {#each errors as error (error)}
        <li class="break-words">{error}</li>
      {/each}
    </ul>
  </div>
{/if}
