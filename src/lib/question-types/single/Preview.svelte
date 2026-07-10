<script lang="ts">
  import MultiplePreview from '../multiple/Preview.svelte';
  import { toMultiple, type SingleData, type SingleFocusTarget } from './index';

  let { data, onFocus }: { data: SingleData; onFocus: (target: SingleFocusTarget) => void } = $props();
</script>

<MultiplePreview data={toMultiple(data)} {onFocus} />
