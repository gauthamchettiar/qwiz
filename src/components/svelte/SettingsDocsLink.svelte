<script lang="ts">
  import { ArrowUpRight } from '@lucide/svelte';

  // The whole settings reference, one tap from either settings block (a question's and the quiz's).
  // Complements SettingHelp rather than repeating it: that explains the ONE key a row holds, which
  // is the wrong shape for "what can I even set here, and how do these interact" — the question the
  // full document answers.
  //
  // Points at the docs on GitHub rather than an in-app page, matching the "Read Docs" link on the
  // home page: this is a static, client-only app (see CLAUDE.md §1), and docs/settings.md is
  // already the maintained copy. The arrow is the standard leaves-the-page marker, so the new tab
  // isn't a surprise.
  const SETTINGS_DOCS_URL = 'https://github.com/gauthamchettiar/qwiz/blob/main/docs/settings.md';
</script>

<a
  href={SETTINGS_DOCS_URL}
  target="_blank"
  rel="noopener noreferrer"
  class="inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
  aria-label="Settings reference (opens GitHub in a new tab)"
  title="Settings reference"
>
  <ArrowUpRight size={16} class="shrink-0" />
</a>
