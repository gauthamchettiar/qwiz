<script lang="ts">
  import { onMount } from 'svelte';
  import { Play, Save } from '@lucide/svelte';
  import { decodeTrivia } from '../share';
  import { validateTriviaImport } from '../triviaSchema';
  import { saveTrivia } from '../store';
  import TriviaPlayer from './TriviaPlayer.svelte';
  import Button from './Button.svelte';
  import type { Trivia } from '../types';

  let state = $state<'loading' | 'error' | 'ready' | 'playing'>('loading');
  let trivia = $state<Trivia | null>(null);
  let errorMessage = $state('');

  onMount(async () => {
    // The payload rides in the fragment (#s=...) so it never hits a server and can be long.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const encoded = hash.get('s');
    if (!encoded) {
      errorMessage = 'This link has no trivia in it.';
      state = 'error';
      return;
    }
    try {
      const decoded = await decodeTrivia(encoded);
      const { valid, errors } = validateTriviaImport(decoded);
      if (!valid) {
        errorMessage = `The shared trivia failed validation: ${errors[0] ?? 'unknown error'}`;
        state = 'error';
        return;
      }
      trivia = decoded;
      state = 'ready';
    } catch {
      errorMessage = "This link is broken or wasn't a Qwiz share link.";
      state = 'error';
    }
  });

  function saveToBrowser() {
    if (!trivia) return;
    // A shared trivia becomes a fresh local copy — never overwrite an existing id.
    const now = new Date().toISOString();
    const copy: Trivia = { ...trivia, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    saveTrivia(copy);
    window.location.href = '/';
  }
</script>

{#if state === 'loading'}
  <p class="text-sm text-slate-400">Loading…</p>
{:else if state === 'error'}
  <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <p>{errorMessage}</p>
    <a href="/" class="mt-2 inline-block text-indigo-600 hover:underline">Go home</a>
  </div>
{:else if state === 'playing' && trivia}
  <TriviaPlayer {trivia} />
{:else if trivia}
  <div class="space-y-4">
    <div>
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-bold text-slate-900">{trivia.title}</h1>
        <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">shared</span>
      </div>
      {#if trivia.description}
        <p class="mt-1 text-slate-500">{trivia.description}</p>
      {/if}
      <p class="mt-1 text-xs text-slate-400">
        {trivia.questions.length} question{trivia.questions.length === 1 ? '' : 's'}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button variant="primary" onclick={() => (state = 'playing')}>
        <Play size={15} /> Play
      </Button>
      <Button onclick={saveToBrowser}>
        <Save size={15} /> Save to my browser
      </Button>
    </div>
  </div>
{/if}
