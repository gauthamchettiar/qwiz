<script lang="ts">
  import type { QuizScriptError } from '@/lib/utils/quizScript';

  let { error, source }: { error: QuizScriptError; source: string } = $props();

  const line = $derived(source.split(/\r\n|\r|\n/)[error.line - 1] ?? '');
</script>

<div class="overflow-hidden rounded-lg border border-red-200 bg-red-50 text-sm">
  <div
    class="flex items-start gap-3 border-b border-red-200 bg-red-100/60 px-3 py-1.5 font-mono text-xs text-red-800"
  >
    <span class="shrink-0 tabular-nums text-red-400">{error.line}</span>
    <span class="whitespace-pre-wrap">{line}</span>
  </div>
  <p class="px-3 py-2 text-red-700">{error.message}</p>
</div>
