<script lang="ts">
  import MultipleAnswerSummary from '../multiple/AnswerSummary.svelte';
  import { toMultiple, type SingleData, type SingleResponse } from './index';

  let { data, response }: { data: SingleData; response: SingleResponse } = $props();
</script>

<MultipleAnswerSummary data={toMultiple(data)} {response} />
