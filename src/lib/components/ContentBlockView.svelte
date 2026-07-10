<script lang="ts">
  import type { ContentBlock } from '../types';

  let { block }: { block: ContentBlock } = $props();
</script>

{#if block.kind === 'text'}
  <p class="whitespace-pre-wrap">{block.text}</p>
{:else if block.kind === 'image'}
  <img src={block.url} alt={block.alt ?? ''} class="max-h-80 rounded-md border border-slate-200" />
{:else if block.kind === 'video'}
  <div class="aspect-video w-full max-w-lg overflow-hidden rounded-md border border-slate-200">
    <iframe
      class="h-full w-full"
      src={`https://www.youtube.com/embed/${block.videoId}`}
      title="Video"
      allowfullscreen
    ></iframe>
  </div>
{/if}
