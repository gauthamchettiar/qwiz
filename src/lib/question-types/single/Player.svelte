<script lang="ts">
  import MultiplePlayer from '../multiple/Player.svelte';
  import { toMultiple, type SingleData, type SingleResponse } from './index';

  let {
    data,
    response,
    onChange
  }: {
    data: SingleData;
    response: SingleResponse;
    onChange: (r: SingleResponse) => void;
  } = $props();
</script>

<MultiplePlayer data={toMultiple(data)} {response} {onChange} single />
