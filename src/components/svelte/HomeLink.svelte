<script lang="ts">
  import { House } from '@lucide/svelte';
  import Button from './Button.svelte';
</script>

<!-- The minimal header's one-click way home. Back (see BackLink) deliberately climbs one folder
     at a time rather than always going home, so a group several folders deep has no other
     single-click way back to the library without this. -->
<Button href="/" variant="secondary" size="sm" ariaLabel="Home">
  <House size={15} />
</Button>
