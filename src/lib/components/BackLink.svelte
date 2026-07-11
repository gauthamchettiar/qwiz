<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';

  // Returns to wherever the player came from (the trivia/detail page that linked to Play) —
  // falls back to home when there's no history to go back to, e.g. Play was opened directly.
  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  }
</script>

<button
  type="button"
  class="inline-flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-600"
  onclick={goBack}
>
  <ArrowLeft size={14} /> Back
</button>
