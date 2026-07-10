<script lang="ts">
  import { Type, Image as ImageIcon, Video as VideoIcon, Trash2 } from '@lucide/svelte';
  import KindPicker from '../../components/KindPicker.svelte';
  import { extractYoutubeId } from '../../youtube';
  import { blankOption, type AnswerOption, type OptionKind } from './index';

  let {
    option,
    canRemove,
    onChange,
    onRemove
  }: {
    option: AnswerOption;
    canRemove: boolean;
    onChange: (option: AnswerOption) => void;
    onRemove: () => void;
  } = $props();

  let primaryFieldEl: HTMLInputElement | undefined = $state();
  export function focus() {
    primaryFieldEl?.focus();
  }

  const kinds: { kind: OptionKind; label: string; icon: typeof Type }[] = [
    { kind: 'text', label: 'Text', icon: Type },
    { kind: 'image', label: 'Image', icon: ImageIcon },
    { kind: 'video', label: 'Video', icon: VideoIcon }
  ];

  function setKind(kind: string) {
    onChange({ ...blankOption(kind as OptionKind, option.points), id: option.id });
  }

  function setImageField(field: 'url' | 'alt', v: string) {
    const content = option.content.kind === 'image' ? option.content : { kind: 'image' as const, url: '', alt: '' };
    onChange({ ...option, content: { ...content, [field]: v } });
  }

  function setVideoId(raw: string) {
    onChange({ ...option, content: { kind: 'video', videoId: extractYoutubeId(raw) ?? raw } });
  }
</script>

<div class="space-y-2 rounded-md border border-slate-200 p-2">
  <div class="flex items-start gap-2">
    <div class="flex shrink-0 flex-col items-center gap-1.5 pt-0.5">
      <KindPicker {kinds} current={option.kind} onSelect={setKind} />
      <input
        type="checkbox"
        checked={option.points > 0}
        disabled
        title="Correct"
        class="h-3.5 w-3.5 cursor-not-allowed accent-green-600"
      />
    </div>

    <div class="flex-1 space-y-2">
      {#if option.kind === 'text'}
        <input
          type="text"
          bind:this={primaryFieldEl}
          class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="Option text"
          value={option.content.kind === 'text' ? option.content.text : ''}
          oninput={(e) => onChange({ ...option, content: { kind: 'text', text: e.currentTarget.value } })}
        />
      {:else if option.kind === 'image'}
        <input
          type="text"
          bind:this={primaryFieldEl}
          class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="Image URL"
          value={option.content.kind === 'image' ? option.content.url : ''}
          oninput={(e) => setImageField('url', e.currentTarget.value)}
        />
        <input
          type="text"
          class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="Alt text (optional)"
          value={option.content.kind === 'image' ? (option.content.alt ?? '') : ''}
          oninput={(e) => setImageField('alt', e.currentTarget.value)}
        />
        {#if option.content.kind === 'image' && option.content.url}
          <img src={option.content.url} alt={option.content.alt ?? ''} class="max-h-28 rounded border border-slate-200" />
        {/if}
      {:else if option.kind === 'video'}
        <input
          type="text"
          bind:this={primaryFieldEl}
          class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="YouTube URL or video ID"
          value={option.content.kind === 'video' ? option.content.videoId : ''}
          oninput={(e) => setVideoId(e.currentTarget.value)}
        />
        {#if option.content.kind === 'video' && option.content.videoId}
          <div class="aspect-video max-w-xs overflow-hidden rounded border border-slate-200">
            <iframe
              class="h-full w-full"
              src={`https://www.youtube.com/embed/${option.content.videoId}`}
              title="Video preview"
              allowfullscreen
            ></iframe>
          </div>
        {/if}
      {/if}

      <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
        Points
        <input
          type="number"
          class="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={option.points}
          oninput={(e) => onChange({ ...option, points: Number(e.currentTarget.value) || 0 })}
        />
      </label>
    </div>

    <button
      type="button"
      class="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
      disabled={!canRemove}
      onclick={onRemove}
      aria-label="Remove option"
    >
      <Trash2 size={15} />
    </button>
  </div>
</div>
