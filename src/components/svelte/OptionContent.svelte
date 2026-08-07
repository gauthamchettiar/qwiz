<script lang="ts">
  import type { QuizScriptOptionContent } from '@/lib/utils/quizScript';
  import { extractYoutubeId } from '@/lib/utils/youtube';

  // Renders one option/item's content — text, image, or (YouTube) video — the same shape both a
  // question's own media and any option's content use (see QuizScriptOptionContent). Extracted
  // from QuestionPlayer.svelte's own `optionContent` snippet so order/match/group_items's answer
  // boards (which each render items the same way choice options already do) don't duplicate the
  // image/video rendering rules three more times.
  let { content }: { content: QuizScriptOptionContent } = $props();
</script>

{#if content.kind === 'text'}
  <!-- No `text-ink`: `body` already sets it (global.css), so declaring it again here was
       redundant AND load-bearing in the wrong direction — it broke colour inheritance, so a quiz
       theme colouring `.qwiz-option` left the option's own text at the app's default. Letting it
       inherit is what makes `color` on any ancestor work the way CSS says it should. -->
  <p class="text-sm">{content.text}</p>
{:else if content.kind === 'image'}
  <img
    src={content.url}
    alt={content.alt}
    class="max-h-56 rounded-md border border-line-subtle object-contain"
  />
{:else}
  {@const videoId = extractYoutubeId(content.url)}
  {#if videoId}
    <div class="aspect-video overflow-hidden rounded-md border border-line-subtle">
      <iframe
        class="h-full w-full"
        src={`https://www.youtube.com/embed/${videoId}`}
        title={content.alt || 'Video option'}
        allowfullscreen
      ></iframe>
    </div>
  {:else}
    <p class="text-sm text-ink-subtle">{content.alt || content.url}</p>
  {/if}
{/if}
