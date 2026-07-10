<script lang="ts">
  import { Type, Image as ImageIcon, Video as VideoIcon } from '@lucide/svelte';
  import type { ContentBlock } from '../types';
  import { extractYoutubeId } from '../youtube';
  import KindPicker from './KindPicker.svelte';

  let { value, onChange }: { value: ContentBlock; onChange: (v: ContentBlock) => void } = $props();

  // Always the first input for whichever kind is active (text/image URL/video URL) — the
  // natural "primary field" to focus when this block is targeted by the click-to-edit flow.
  let primaryInputEl: HTMLInputElement | undefined = $state();
  export function focus() {
    primaryInputEl?.focus();
  }

  const kinds: { kind: ContentBlock['kind']; label: string; icon: typeof Type }[] = [
    { kind: 'text', label: 'Text', icon: Type },
    { kind: 'image', label: 'Image', icon: ImageIcon },
    { kind: 'video', label: 'Video', icon: VideoIcon }
  ];

  function setKind(kind: string) {
    if (kind === value.kind) return;
    if (kind === 'text') onChange({ kind: 'text', text: '' });
    else if (kind === 'image') onChange({ kind: 'image', url: '', alt: '' });
    else onChange({ kind: 'video', videoId: '' });
  }

  function onVideoInput(raw: string) {
    onChange({ kind: 'video', videoId: extractYoutubeId(raw) ?? raw });
  }
</script>

<div class="flex items-start gap-2">
  <KindPicker {kinds} current={value.kind} onSelect={setKind} />

  <div class="flex-1 space-y-2">
    {#if value.kind === 'text'}
      <input
        type="text"
        bind:this={primaryInputEl}
        class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        placeholder="Text"
        value={value.text}
        oninput={(e) => onChange({ kind: 'text', text: e.currentTarget.value })}
      />
    {:else if value.kind === 'image'}
      <input
        type="text"
        bind:this={primaryInputEl}
        class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        placeholder="Image URL"
        value={value.url}
        oninput={(e) => onChange({ ...value, url: e.currentTarget.value })}
      />
      <input
        type="text"
        class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        placeholder="Alt text (optional)"
        value={value.alt ?? ''}
        oninput={(e) => onChange({ ...value, alt: e.currentTarget.value })}
      />
      {#if value.url}
        <img src={value.url} alt={value.alt ?? ''} class="max-h-32 rounded border border-slate-200" />
      {/if}
    {:else if value.kind === 'video'}
      <input
        type="text"
        bind:this={primaryInputEl}
        class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        placeholder="YouTube URL or video ID"
        value={value.videoId}
        oninput={(e) => onVideoInput(e.currentTarget.value)}
      />
      {#if value.videoId}
        <div class="aspect-video max-w-xs overflow-hidden rounded border border-slate-200">
          <iframe
            class="h-full w-full"
            src={`https://www.youtube.com/embed/${value.videoId}`}
            title="Video preview"
            allowfullscreen
          ></iframe>
        </div>
      {/if}
    {/if}
  </div>
</div>
