<script lang="ts">
  import { Type, Eye, Image as ImageIcon, Video as VideoIcon, Trash2 } from '@lucide/svelte';
  import ContentBlockEditor from '../../components/ContentBlockEditor.svelte';
  import { extractYoutubeId } from '../../youtube';
  import { blankExtra, type PromptExtra, type PromptExtraKind } from './index';

  let {
    extra,
    onChange,
    onRemove
  }: {
    extra: PromptExtra;
    onChange: (extra: PromptExtra) => void;
    onRemove: () => void;
  } = $props();

  const kinds: { kind: PromptExtraKind; label: string; icon: typeof Type }[] = [
    { kind: 'text', label: 'Text', icon: Type },
    { kind: 'reveal', label: 'Reveal', icon: Eye },
    { kind: 'image', label: 'Image', icon: ImageIcon },
    { kind: 'video', label: 'Video', icon: VideoIcon }
  ];

  function setKind(kind: PromptExtraKind) {
    if (kind === extra.kind) return;
    onChange({ ...blankExtra(kind), id: extra.id });
  }

  function setImageField(field: 'url' | 'alt', v: string) {
    const content = extra.content?.kind === 'image' ? extra.content : { kind: 'image' as const, url: '', alt: '' };
    onChange({ ...extra, content: { ...content, [field]: v } });
  }

  function setVideoId(raw: string) {
    onChange({ ...extra, content: { kind: 'video', videoId: extractYoutubeId(raw) ?? raw } });
  }
</script>

<div class="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
  <div class="flex items-center justify-between">
    <div class="inline-flex rounded-md border border-slate-300 bg-white text-xs">
      {#each kinds as k, i (k.kind)}
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-1 font-medium {extra.kind === k.kind
            ? 'bg-indigo-600 text-white'
            : 'text-slate-600 hover:bg-slate-100'} {i === 0 ? 'rounded-l-md' : ''} {i === kinds.length - 1
            ? 'rounded-r-md'
            : ''}"
          onclick={() => setKind(k.kind)}
        >
          <k.icon size={13} />
          {k.label}
        </button>
      {/each}
    </div>
    <button
      type="button"
      class="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
      onclick={onRemove}
      aria-label="Remove extra content"
    >
      <Trash2 size={15} />
    </button>
  </div>

  {#if extra.kind === 'text'}
    <input
      type="text"
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      placeholder="Extra text"
      value={extra.content?.kind === 'text' ? extra.content.text : ''}
      oninput={(e) => onChange({ ...extra, content: { kind: 'text', text: e.currentTarget.value } })}
    />
  {:else if extra.kind === 'image'}
    <input
      type="text"
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      placeholder="Image URL"
      value={extra.content?.kind === 'image' ? extra.content.url : ''}
      oninput={(e) => setImageField('url', e.currentTarget.value)}
    />
    {#if extra.content?.kind === 'image' && extra.content.url}
      <img src={extra.content.url} alt={extra.content.alt ?? ''} class="max-h-28 rounded border border-slate-200" />
    {/if}
  {:else if extra.kind === 'video'}
    <input
      type="text"
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      placeholder="YouTube URL or video ID"
      value={extra.content?.kind === 'video' ? extra.content.videoId : ''}
      oninput={(e) => setVideoId(e.currentTarget.value)}
    />
  {:else if extra.kind === 'reveal'}
    <input
      type="text"
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      placeholder="Reveal button label (optional)"
      value={extra.label ?? ''}
      oninput={(e) => onChange({ ...extra, label: e.currentTarget.value })}
    />
    <ContentBlockEditor
      value={extra.revealContent ?? { kind: 'text', text: '' }}
      onChange={(c) => onChange({ ...extra, revealContent: c })}
    />
  {/if}
</div>
