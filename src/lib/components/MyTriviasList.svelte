<script lang="ts">
  import { onMount } from 'svelte';
  import { listTrivias } from '../store';
  import type { TriviaSummary } from '../types';

  let trivias = $state<TriviaSummary[]>([]);
  let loaded = $state(false);

  onMount(() => {
    trivias = listTrivias();
    loaded = true;
  });
</script>

{#if loaded}
  {#if trivias.length === 0}
    <p class="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
      No trivias yet. <a href="/create" class="text-indigo-600 hover:underline">Create your first one</a>.
    </p>
  {:else}
    <ul class="space-y-3">
      {#each trivias as t (t.id)}
        <li>
          <a
            href={`/trivia?id=${t.id}`}
            class="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow"
          >
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-slate-900">{t.title}</h2>
              <span class="text-xs text-slate-400">
                {t.questionCount} question{t.questionCount === 1 ? '' : 's'}
              </span>
            </div>
            {#if t.description}
              <p class="mt-1 text-sm text-slate-500">{t.description}</p>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
{/if}
