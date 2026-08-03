<script lang="ts">
  import { Check, Copy, ShieldCheck } from '@lucide/svelte';
  import {
    SHARE_URL_MAX_LENGTH,
    buildShareUrl,
    encodeSharePayload,
    shareUrlVerdict,
    type ShareUrlVerdict
  } from '@/lib/utils/shareLink';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';
  import ErrorList from './ErrorList.svelte';

  let dialog: Dialog;
  let urlInputEl: HTMLInputElement | undefined = $state();

  let url = $state('');
  let verdict = $state<ShareUrlVerdict>('ok');
  let building = $state(false);
  let errors = $state<string[]>([]);
  let copied = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(copyTimeout));

  /** Builds the link for `source` and shows it. Async because compression is (see shareLink.ts),
   * which is also why the size verdict can only be reached here and not on the menu item that
   * opens this — a document's compressed length isn't knowable from its authored length. */
  export async function open(source: string) {
    url = '';
    errors = [];
    copied = false;
    verdict = 'ok';
    building = true;
    dialog.open();
    try {
      const built = buildShareUrl(window.location.origin, await encodeSharePayload(source));
      verdict = shareUrlVerdict(built);
      // A refused link is deliberately never put on screen: a half-usable URL that silently fails
      // when pasted is worse than being told up front to send the file instead.
      if (verdict !== 'too-long') url = built;
    } catch {
      errors = ["Couldn't build a link for this quiz. Try downloading the .qwiz file instead."];
    } finally {
      building = false;
    }
  }

  async function copy() {
    // Selecting the text first means the fallback is already in place if the clipboard write is
    // refused (permissions policy, insecure context) — the URL is selected and ready for Ctrl+C.
    urlInputEl?.select();
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => (copied = false), 2000);
    } catch {
      errors = ['Copying was blocked — the link is selected, so press Ctrl/Cmd+C to copy it.'];
    }
  }
</script>

<Dialog bind:this={dialog} title="Share this quiz">
  {#snippet body()}
    {#if building}
      <p class="text-sm text-ink-subtle">Building the link…</p>
    {:else if verdict === 'too-long'}
      <ErrorList
        errors={[
          `This quiz is too big to fit in a link — it comes to more than ${SHARE_URL_MAX_LENGTH.toLocaleString()} characters, which browsers stop accepting. Embedded images are almost always the cause.`
        ]}
      />
      <p class="text-sm text-ink-muted">
        Download the .qwiz file from this menu instead and send that — it has no size limit, and the
        person you send it to can open it with Import.
      </p>
    {:else}
      <div class="flex gap-2">
        <!-- Read-only rather than disabled: the text still has to be selectable, which is the
             fallback when the clipboard API is unavailable. -->
        <input
          bind:this={urlInputEl}
          type="text"
          readonly
          value={url}
          aria-label="Share link"
          class="min-w-0 flex-1 rounded-md border border-line-subtle bg-surface px-3 py-2 font-mono text-xs text-ink-muted focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-subtle"
        />
        <Button size="sm" variant="primary" onclick={copy}>
          {#if copied}
            <Check size={15} /> Copied
          {:else}
            <Copy size={15} /> Copy
          {/if}
        </Button>
      </div>

      <p class="flex items-start gap-1.5 text-xs text-ink-subtle">
        <ShieldCheck size={14} class="mt-px shrink-0" />
        <span>
          The whole quiz is compressed into the link itself, after the <code class="font-mono"
            >#</code
          >. Nothing is uploaded — that part of a URL is never sent to any server. Opening the link
          plays the quiz; it's only saved if the player chooses to keep a copy.
        </span>
      </p>

      {#if verdict === 'long'}
        <p
          class="rounded-md border border-warning-line bg-warning-surface p-3 text-xs text-warning-ink-strong"
        >
          This link is very long, so some chat apps and email clients may wrap or cut it off. If it
          doesn't work for someone, send them the .qwiz file instead.
        </p>
      {/if}

      <ErrorList {errors} />
    {/if}
  {/snippet}
  {#snippet footer()}
    <Button size="sm" onclick={() => dialog.close()}>Done</Button>
  {/snippet}
</Dialog>
