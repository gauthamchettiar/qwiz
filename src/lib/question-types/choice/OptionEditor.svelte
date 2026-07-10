<script lang="ts">
  import { Type, TextCursorInput, Eye, Image as ImageIcon, Video as VideoIcon, Trash2 } from '@lucide/svelte';
  import ContentBlockEditor from '../../components/ContentBlockEditor.svelte';
  import { extractYoutubeId } from '../../youtube';
  import { blankOption, type ChoiceOption, type ChoiceVariant, type OptionKind } from './index';

  let {
    option,
    variant,
    radioGroupName,
    canRemove,
    linked,
    onChange,
    onRemove,
    onSetCorrect
  }: {
    option: ChoiceOption;
    variant: ChoiceVariant;
    radioGroupName: string;
    canRemove: boolean;
    linked: boolean;
    onChange: (option: ChoiceOption) => void;
    onRemove: () => void;
    onSetCorrect: () => void;
  } = $props();

  // text/image/video/input kinds focus their own primary field directly; reveal kind delegates
  // to its nested ContentBlockEditor (the substantive "what gets revealed" content).
  let primaryFieldEl: HTMLInputElement | HTMLTextAreaElement | undefined = $state();
  let revealContentRef: { focus: () => void } | undefined = $state();
  export function focus() {
    if (option.kind === 'reveal') revealContentRef?.focus();
    else primaryFieldEl?.focus();
  }

  const kinds: { kind: OptionKind; label: string; icon: typeof Type }[] = [
    { kind: 'text', label: 'Text', icon: Type },
    { kind: 'input', label: 'Input', icon: TextCursorInput },
    { kind: 'reveal', label: 'Reveal', icon: Eye },
    { kind: 'image', label: 'Image', icon: ImageIcon },
    { kind: 'video', label: 'Video', icon: VideoIcon }
  ];

  function setKind(kind: OptionKind) {
    if (kind === option.kind) return;
    onChange({ ...blankOption(kind, option.points), id: option.id, correct: option.correct });
  }

  function setImageField(field: 'url' | 'alt', v: string) {
    const content = option.content?.kind === 'image' ? option.content : { kind: 'image' as const, url: '', alt: '' };
    onChange({ ...option, content: { ...content, [field]: v } });
  }

  function setVideoId(raw: string) {
    onChange({ ...option, content: { kind: 'video', videoId: extractYoutubeId(raw) ?? raw } });
  }
</script>

<div class="space-y-2 rounded-md border border-slate-200 p-2">
  <div class="flex items-center justify-between">
    <div class="inline-flex rounded-md border border-slate-300 bg-white text-xs">
      {#each kinds as k, i (k.kind)}
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-1 font-medium {option.kind === k.kind
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
      class="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
      disabled={!canRemove}
      onclick={onRemove}
      aria-label="Remove option"
    >
      <Trash2 size={15} />
    </button>
  </div>

  {#if option.kind === 'text'}
    <input
      type="text"
      bind:this={primaryFieldEl}
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      placeholder="Option text"
      value={option.content?.kind === 'text' ? option.content.text : ''}
      oninput={(e) => onChange({ ...option, content: { kind: 'text', text: e.currentTarget.value } })}
    />
  {:else if option.kind === 'image'}
    <input
      type="text"
      bind:this={primaryFieldEl}
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      placeholder="Image URL"
      value={option.content?.kind === 'image' ? option.content.url : ''}
      oninput={(e) => setImageField('url', e.currentTarget.value)}
    />
    <input
      type="text"
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      placeholder="Alt text (optional)"
      value={option.content?.kind === 'image' ? (option.content.alt ?? '') : ''}
      oninput={(e) => setImageField('alt', e.currentTarget.value)}
    />
    {#if option.content?.kind === 'image' && option.content.url}
      <img src={option.content.url} alt={option.content.alt ?? ''} class="max-h-28 rounded border border-slate-200" />
    {/if}
  {:else if option.kind === 'video'}
    <input
      type="text"
      bind:this={primaryFieldEl}
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      placeholder="YouTube URL or video ID"
      value={option.content?.kind === 'video' ? option.content.videoId : ''}
      oninput={(e) => setVideoId(e.currentTarget.value)}
    />
    {#if option.content?.kind === 'video' && option.content.videoId}
      <div class="aspect-video max-w-xs overflow-hidden rounded border border-slate-200">
        <iframe
          class="h-full w-full"
          src={`https://www.youtube.com/embed/${option.content.videoId}`}
          title="Video preview"
          allowfullscreen
        ></iframe>
      </div>
    {/if}
  {:else if option.kind === 'input'}
    <input
      type="text"
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      placeholder="Label (optional)"
      value={option.label ?? ''}
      oninput={(e) => onChange({ ...option, label: e.currentTarget.value })}
    />
    <textarea
      bind:this={primaryFieldEl}
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      rows="2"
      placeholder="Accepted answers, one per line"
      value={(option.validAnswers ?? ['']).join('\n')}
      oninput={(e) => onChange({ ...option, validAnswers: e.currentTarget.value.split('\n') })}
    ></textarea>
  {:else if option.kind === 'reveal'}
    <input
      type="text"
      class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      placeholder="Reveal button label (optional)"
      value={option.label ?? ''}
      oninput={(e) => onChange({ ...option, label: e.currentTarget.value })}
    />
    <ContentBlockEditor
      bind:this={revealContentRef}
      value={option.revealContent ?? { kind: 'text', text: '' }}
      onChange={(c) => onChange({ ...option, revealContent: c })}
    />
  {/if}

  {#if variant === 'single-one'}
    <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
      <input
        type="radio"
        class="h-4 w-4 accent-indigo-600"
        name={radioGroupName}
        checked={option.correct}
        onchange={onSetCorrect}
      />
      Correct answer
    </label>
  {:else if variant === 'multiple-many'}
    {#if linked}
      <p class="text-xs text-slate-400">Linked — correctness is determined by matching, not a flag.</p>
    {:else}
      <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          class="h-4 w-4 accent-indigo-600"
          checked={option.correct}
          onchange={(e) => onChange({ ...option, correct: e.currentTarget.checked })}
        />
        Correct answer
      </label>
    {/if}
  {:else}
    <label class="flex items-center gap-2 text-xs font-medium text-slate-600">
      Points
      <input
        type="number"
        class="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
        value={option.points}
        oninput={(e) => onChange({ ...option, points: Number(e.currentTarget.value) || 0 })}
      />
    </label>
  {/if}
</div>
