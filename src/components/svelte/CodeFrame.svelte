<script lang="ts">
  import type { QuizScriptError } from '@/lib/utils/quizScript';

  let { error, source }: { error: QuizScriptError; source: string } = $props();

  const line = $derived(source.split(/\r\n|\r|\n/)[error.line - 1] ?? '');
</script>

<div
  class="overflow-hidden rounded-lg border border-negative-line-faint bg-negative-surface text-sm"
>
  <div
    class="flex items-start gap-3 border-b border-negative-line-faint bg-negative-surface-strong/60 px-3 py-1.5 font-mono text-xs text-negative-ink-deep"
  >
    <span class="shrink-0 tabular-nums text-negative-ink-faint">{error.line}</span>
    <span class="min-w-0 whitespace-pre-wrap break-all">{line}</span>
  </div>
  <p class="break-words px-3 py-2 text-negative-ink-strong">{error.message}</p>
</div>
