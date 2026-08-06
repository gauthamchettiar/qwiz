<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import {
    ArrowDown,
    ArrowUp,
    Check,
    ChevronDown,
    ChevronRight,
    Code,
    Download,
    FolderGit2,
    FolderTree,
    Loader2,
    Play,
    Plus,
    X
  } from '@lucide/svelte';
  import { listQuizzes } from '@/lib/stores/quizzes';
  import { getSavedGroup, saveGroup, type SavedGroup } from '@/lib/stores/savedGroups';
  import { savedGroupUrl } from '@/lib/utils/remoteSource';
  import { downloadBlobFile } from '@/lib/utils/download';
  import { createZip } from '@/lib/utils/zip';
  import {
    GROUP_FRONTMATTER_RULES,
    GROUP_SUGGESTED_SETTING_KEYS,
    parseQwizGroup
  } from '@/lib/utils/quizGroup';
  import {
    groupSettingKeys,
    settingDefaultValue,
    settingValueSuggestions,
    validateSettingValue
  } from '@/lib/utils/quizScript';
  import {
    buildGroupFiles,
    draftFromQuizGroup,
    draftMode,
    emptyGroupDraft,
    emptyGroupEntryDraft,
    groupZipName,
    modeSummary,
    modeUsesFolders,
    type GroupDraft,
    type GroupEntryDraft
  } from '@/lib/utils/groupBuilder';
  import ErrorList from './ErrorList.svelte';
  import Button from './Button.svelte';
  import CodeEditor from './CodeEditor.svelte';
  import LeaveGuard from './LeaveGuard.svelte';
  import MetadataFields from './MetadataFields.svelte';
  import SettingsDocsLink from './SettingsDocsLink.svelte';
  import SettingsLegend from './SettingsLegend.svelte';
  import SuggestionInput from './SuggestionInput.svelte';

  // Assembles a publishable group out of quizzes already in this browser. The app deliberately
  // stops at a downloadable folder rather than creating a repository — that would need a GitHub
  // token with write access, and the whole remote feature rests on reading public files signed out.
  //
  // Deliberately the same screen as QuizBuilder, field for field: the shared metadata block, a
  // collapsible generic settings list, a card per item with an "Add" button under them, and a "<>"
  // that swaps the whole form for the source. A `.qwizgroup` manifest IS a `.qwiz` document's
  // frontmatter plus blocks, so two screens that looked nothing alike were describing one format.
  //
  // Every DECISION (filenames, ids, whether the result parses, what an edited manifest maps back
  // to) lives in `lib/utils/groupBuilder.ts`. This is the form.
  const library = listQuizzes();
  const byId = new Map(library.map((quiz) => [quiz.id, quiz]));

  /** Reads `?id=` and turns the saved group it names back into a draft, or explains why it can't.
   *
   * `?id=` reopens a group already saved to this browser, read at mount rather than passed as a
   * prop — the page is `client:only` precisely because this can only be known at runtime, the same
   * arrangement /local/edit uses for a quiz.
   *
   * The mapping itself is `draftFromQuizGroup` — the same function code mode's Apply uses, given an
   * empty previous draft so every entry resolves against the library instead. Only the URL reading
   * and the store lookup live here; nothing about the transformation does. */
  function openSavedGroup(): {
    draft: GroupDraft | null;
    saved: SavedGroup | null;
    warnings: string[];
    error: string | null;
  } {
    const empty = { draft: null, saved: null, warnings: [], error: null };
    if (typeof window === 'undefined') return empty;

    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return empty;

    const saved = getSavedGroup(id);
    if (!saved) {
      return { ...empty, error: "That group isn't saved in this browser any more." };
    }
    // A group copied from GitHub names files in someone else's repository, not quizzes in this
    // library, so almost nothing in it would resolve. Saying so beats opening a form full of
    // entries that can't be found.
    if (saved.origin !== 'local') {
      return {
        ...empty,
        error:
          'This group was saved from a repository, so it can’t be edited here — open it from Saved Groups to play or update it.'
      };
    }

    const parsed = parseQwizGroup(saved.manifest);
    if (parsed.errors.length > 0) {
      return {
        ...empty,
        saved,
        error: `This saved group can no longer be read: ${parsed.errors[0]}`
      };
    }

    const mapped = draftFromQuizGroup(parsed.group, emptyGroupDraft(), byId);
    return { draft: mapped.draft, saved, warnings: mapped.errors, error: null };
  }

  const opened = untrack(() => openSavedGroup());

  const seed = untrack(() => opened.draft ?? emptyGroupDraft());
  let title = $state(seed.title);
  let description = $state(seed.description);
  let category = $state(seed.category);
  let tags = $state<string[]>([...seed.tags]);
  let tagDraft = $state('');
  let entries = $state<GroupEntryDraft[]>(seed.entries);

  /** The saved group this builder is editing, if any — its `key` is reused on every save so the
   * record updates in place rather than piling up copies, and so journey progress against it
   * survives (the key is `groupProgress.ts`'s key too). Minted on the first save of a new group. */
  let savedKey = $state(opened.saved?.key ?? '');
  /** Reasons the saved group couldn't be fully restored — a quiz since deleted from the library,
   * usually. Warnings rather than errors: the rest of the group opened fine, and refusing to show
   * it would be a worse answer than showing it with a note. */
  let openWarnings = $state<string[]>(opened.warnings);
  /** A `?id=` that named nothing openable. Fatal: the form stays hidden, because starting a blank
   * group under a URL that promised an existing one is how you lose the existing one. */
  const openError = opened.error;

  // Same "list is canonical, Record is a view of it" relationship QuizBuilder has — and the reason
  // `mode` is in here at all rather than being its own field: it's a `:key=value` in the file, so
  // making it one in the form means `validateSettingValue` checks it like everything else.
  let settingsList = $state(
    Object.entries(seed.settings).map(([key, value]) => ({
      key,
      value: String(value),
      _key: crypto.randomUUID()
    }))
  );
  let settingsOpen = $state(true);
  let leaveGuard: LeaveGuard | undefined = $state();
  let saveState = $state<'idle' | 'saved'>('idle');
  let saveFlashTimeout: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(saveFlashTimeout));
  let saveErrors = $state<string[]>([]);

  let metadata: MetadataFields | undefined = $state();
  // `$props.id()` may only appear as a top-level declaration initializer, hence the two lines.
  const instanceId = $props.id();
  const settingsPanelId = `${instanceId}-settings`;

  const groupSettings = $derived(
    Object.fromEntries(
      settingsList
        .filter((s) => s.key.trim() !== '')
        .map((s) => [s.key, validateSettingValue(s.key, s.value, GROUP_FRONTMATTER_RULES).value])
    )
  );

  const draft = $derived<GroupDraft>({
    title,
    description,
    category,
    tags,
    settings: groupSettings,
    entries
  });
  const mode = $derived(draftMode(draft));
  const showFolders = $derived(modeUsesFolders(mode));

  // Recomputed on every keystroke, which is affordable because it's pure string work — and it's
  // what makes the code editor and the error list describe the SAME artefact the download produces.
  const built = $derived(buildGroupFiles(draft, byId));

  function addSetting() {
    const used = settingsList.map((s) => s.key);
    const key = GROUP_SUGGESTED_SETTING_KEYS.find((k) => !used.includes(k)) ?? '';
    settingsList = [
      ...settingsList,
      { _key: crypto.randomUUID(), key, value: settingDefaultValue(key, GROUP_FRONTMATTER_RULES) }
    ];
  }

  function removeSetting(key: string) {
    settingsList = settingsList.filter((s) => s._key !== key);
  }

  /** Same as QuizBuilder's: a value that's still valid for the newly-picked key survives, anything
   * else is replaced by that key's default rather than left as a stale error. */
  function selectSettingKey(setting: { key: string; value: string }) {
    if (validateSettingValue(setting.key, setting.value, GROUP_FRONTMATTER_RULES).error) {
      setting.value = settingDefaultValue(setting.key, GROUP_FRONTMATTER_RULES);
    }
  }

  function addEntry() {
    entries = [...entries, emptyGroupEntryDraft()];
  }

  function removeEntry(index: number) {
    entries = entries.filter((_, i) => i !== index);
  }

  function move(index: number, by: number) {
    const next = [...entries];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    entries = next;
  }

  /** What an entry is called on screen and in its fields' labels. Falls back to its position,
   * because a card exists before a quiz has been picked for it. */
  function entryLabel(entry: GroupEntryDraft, index: number): string {
    return byId.get(entry.quizId)?.title || `entry ${index + 1}`;
  }

  // --- Editing the manifest directly -----------------------------------------------------------
  // `null` = not in code mode. The draft is the same `.qwizgroup` text the download writes, so this
  // is a second surface on one format rather than a second representation of a group.
  let fileDraft = $state<string | null>(null);
  let fileEditor: CodeEditor | undefined = $state();
  /** Reasons an otherwise-parseable manifest couldn't be mapped back onto the form — a `quiz:` path
   * naming no quiz in this library, essentially. Kept apart from the parse errors because they
   * survive a document that's perfectly valid `.qwizgroup`. */
  let applyErrors = $state<string[]>([]);

  const fileDraftErrors = $derived(fileDraft === null ? [] : parseQwizGroup(fileDraft).errors);

  function enterGroupCode() {
    // A tag half-typed in the tag field is state the document has to include — otherwise it
    // silently vanishes the moment the document is applied back.
    metadata?.commitTagDraft();
    applyErrors = [];
    fileDraft = built.manifest;
    // A document is read from the top, so that's where the caret starts.
    tick().then(() => fileEditor?.focusStart());
  }

  /** Parses the manifest back into the form's own state, leaving the editor open (with its errors
   * showing) if it doesn't parse or can't be mapped — the same save-if-valid contract QuizBuilder's
   * `applyFileDraft` has. */
  function applyGroupDraft(): boolean {
    if (fileDraft === null) return true;
    const parsed = parseQwizGroup(fileDraft);
    if (parsed.errors.length > 0) return false;

    const mapped = draftFromQuizGroup(parsed.group, draft, byId);
    if (mapped.errors.length > 0) {
      applyErrors = mapped.errors;
      return false;
    }

    title = mapped.draft.title;
    description = mapped.draft.description;
    category = mapped.draft.category;
    tags = mapped.draft.tags;
    settingsList = Object.entries(mapped.draft.settings).map(([key, value]) => ({
      key,
      value: String(value),
      _key: crypto.randomUUID()
    }));
    settingsOpen = true;
    entries = mapped.draft.entries;
    applyErrors = [];
    fileDraft = null;
    return true;
  }

  /** Leaves code mode without applying anything — the escape hatch for a manifest edited into a
   * state that can't parse, or that the author simply changed their mind about. */
  function discardGroupDraft() {
    fileDraft = null;
    applyErrors = [];
  }

  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if (fileDraft !== null && (e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        applyGroupDraft();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- Keeping it -------------------------------------------------------------------------------
  // Nothing here is persisted until Save, so the same guard QuizBuilder carries applies: `built`
  // recomputes on every keystroke and `built.manifest` is exactly what a save writes, so the
  // document itself is the dirty check — no separate snapshot to keep in sync.
  let savedSnapshot = $state(untrack(() => buildGroupFiles(seed, byId).manifest));
  const isDirty = $derived(built.manifest !== savedSnapshot || tagDraft.trim() !== '');

  /** Writes the group and its quiz files to this browser. Returns the saved id, or `null` if it
   * couldn't be written — callers decide what to do next, exactly as `buildAndSaveQuiz` does. */
  function saveToBrowser(): string | null {
    metadata?.commitTagDraft();
    saveErrors = [];

    // Applying an open source draft first, for the same reason QuizBuilder does: saving while the
    // manifest is being edited has to save what's on screen, and must refuse rather than quietly
    // write the pre-edit group behind the author's back.
    if (fileDraft !== null && !applyGroupDraft()) {
      saveErrors = [
        "The .qwizgroup document has an error, so it wasn't saved. Fix it, or discard the edit to go back."
      ];
      return null;
    }
    if (built.errors.length > 0) return null;

    // Minted once and then reused, so re-saving updates this group instead of adding another. It's
    // also the journey-progress key, which is why it must not be re-derived from the title.
    const key = savedKey || `local:${crypto.randomUUID()}`;
    const result = saveGroup({
      key,
      origin: 'local',
      title: draft.title.trim(),
      description: draft.description.trim(),
      mode,
      // No repository behind a group built here. Nothing may turn these into a URL without checking
      // `origin` first — see `savedGroupUrl`/`savedGroupPlayUrl`.
      owner: '',
      repo: '',
      path: '',
      ref: '',
      manifest: built.manifest,
      // `.qwizgroup` is carried as `manifest`; `files` is the quizzes only. Note the rename from
      // ZipEntry's `name` to the store's `path`.
      files: built.files
        .filter((file) => file.name !== '.qwizgroup')
        .map((file) => ({ path: file.name, content: file.content }))
    });

    if (!result.saved) {
      saveErrors = [result.error ?? "Couldn't save this group to your browser."];
      return null;
    }

    savedKey = key;
    savedSnapshot = built.manifest;
    return result.saved.id;
  }

  function save() {
    const id = saveToBrowser();
    if (!id) return;

    // A brand-new group's first save is the moment it starts existing, so /local/group stops being
    // an accurate address for it — same move /local/create makes to /local/edit. Re-saving an
    // already-open group just flashes the confirmation. `opened.saved` is the whole test: it's only
    // set when this page load arrived with a `?id=` that resolved.
    if (!opened.saved) {
      leaveGuard?.release();
      window.location.href = `/local/group?id=${id}`;
      return;
    }
    saveState = 'saved';
    clearTimeout(saveFlashTimeout);
    saveFlashTimeout = setTimeout(() => (saveState = 'idle'), 2000);
  }

  /** Save, then open the group's own screen. Playing anything other than what's actually stored
   * would be showing stale content, so the save is not optional — the same contract as the quiz
   * builder's Play. Goes to the lobby rather than straight into a run: `folders` and `journey` are
   * browsing screens where the player picks what to open, and the lobby offers its own Play for the
   * modes that want one. */
  function playNow() {
    const id = saveToBrowser();
    if (!id) return;
    leaveGuard?.release();
    window.location.href = savedGroupUrl(id);
  }

  let building = $state(false);
  let downloadError = $state<string[]>([]);

  async function download() {
    if (built.errors.length > 0 || building) return;
    building = true;
    downloadError = [];
    try {
      const blob = await createZip(built.files);
      downloadBlobFile(groupZipName(draft), blob);
    } catch {
      // Compression is the platform's own and needs Safari 16.4+ / Firefox 113+ / Chrome 103+ —
      // the same floor share links already sit on.
      downloadError = ["Couldn't build the archive — this browser may be too old to compress it."];
    } finally {
      building = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0 space-y-1">
      <!-- The eyebrow is what actually says which builder you're in — see QuizBuilder for its
           counterpart. Its icon carries the group hue; everything else here stays on the neutral
           ramp, so no text depends on a colour to be legible. -->
      <p
        class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle"
      >
        <FolderTree size={13} class="shrink-0 text-brand-group" /> Group
      </p>
      <h1 class="text-2xl font-bold text-ink">
        {opened.saved ? 'Edit a Group' : 'Generate a Group'}
      </h1>
      <p class="text-sm text-ink-subtle">
        Pick quizzes from your library, choose how they should be played, then keep it here or
        download the folder to publish on GitHub.
      </p>
    </div>
    {#if library.length > 0 && !openError}
      <!-- Play is the one action worth a permanent button up here, same as the quiz builder's:
           it's how you check what you just assembled, and it saves first so it never opens stale
           content. -->
      <div class="shrink-0">
        <Button variant="primary" size="sm" onclick={playNow}>
          <Play size={15} /> Play
        </Button>
      </div>
    {/if}
  </div>

  {#if openError}
    <ErrorList errors={[openError]} />
  {:else if library.length === 0}
    <p class="rounded-lg border border-line-subtle p-6 text-center text-sm text-ink-subtle">
      No quizzes yet — a group is made from quizzes in your library, so create one first.
    </p>
  {:else if fileDraft !== null}
    <!-- Replaces the metadata card and every entry card for as long as it's open: the manifest IS
         all of those, and leaving them on screen would mean two editable copies of the same group,
         only one of which is being typed into. Same reasoning as QuizBuilder's whole-file mode.

         No split preview, unlike the quiz editor: a manifest's meaning is the entry list you come
         back to on Apply, and there's no per-block rendering to put beside the source. So no `xl:`
         breakout either — one column, sized by its content. -->
    <div class="relative space-y-3 rounded-lg border border-line-subtle bg-surface-raised p-6">
      <p class="text-xs font-medium text-ink-subtle">
        The whole group as <span class="font-mono">.qwizgroup</span> source — the details block and every
        quiz in it. Exactly what the download contains.
      </p>

      <!-- Apply and Discard as a tick and a cross, matching every card's own button strip with the
           same `lg:`-gated absolute/in-flow switch (see QuestionCard for why). -->
      <div
        class="mb-3 flex items-center gap-1 lg:absolute lg:right-full lg:top-6 lg:mb-0 lg:mr-2 lg:flex-col"
      >
        <button
          type="button"
          class="rounded-md border border-line-subtle bg-surface-raised p-1.5 text-positive-ink-soft hover:bg-positive-surface"
          onclick={() => applyGroupDraft()}
          aria-label="Apply changes"
          title="Apply changes (Ctrl+S)"
        >
          <Check size={15} />
        </button>
        <button
          type="button"
          class="rounded-md border border-line-subtle bg-surface-raised p-1.5 text-negative-ink hover:bg-negative-surface"
          onclick={discardGroupDraft}
          aria-label="Discard changes"
          title="Discard changes"
        >
          <X size={15} />
        </button>
      </div>

      <CodeEditor
        bind:this={fileEditor}
        value={fileDraft}
        ariaLabel="Group .qwizgroup source"
        rows={Math.min(40, Math.max(12, fileDraft.split('\n').length))}
        onInput={(next) => (fileDraft = next)}
      />
      <SettingsLegend keys={GROUP_SUGGESTED_SETTING_KEYS} rules={GROUP_FRONTMATTER_RULES} />
      <ErrorList errors={[...fileDraftErrors, ...applyErrors]} />
    </div>
  {:else}
    <!-- The rail is the group hue's main appearance: decoration only, never behind text, so it
         stays outside the contrast contract while still making this card read as a different KIND
         of document from a quiz's. -->
    <div
      class="relative space-y-5 rounded-lg border border-l-4 border-line-subtle border-l-brand-group bg-surface-raised p-6"
    >
      <!-- Same `lg:`-gated absolute/in-flow switch as QuizBuilder's: Base.astro's page container
           leaves no margin outside this card below `lg:` (1024px), so the button would otherwise be
           pushed off-screen on mobile. -->
      <button
        type="button"
        class="mb-3 rounded-md border border-line-subtle bg-surface-raised p-1.5 text-ink-faint hover:bg-surface lg:absolute lg:right-full lg:top-0 lg:mb-0 lg:mr-2"
        onclick={enterGroupCode}
        aria-label="Edit group code"
        title="Edit the whole group as .qwizgroup source"
      >
        <Code size={15} />
      </button>

      <MetadataFields
        bind:this={metadata}
        bind:title
        bind:description
        bind:category
        bind:tags
        bind:tagDraft
        titlePlaceholder="Untitled group"
        descriptionPlaceholder="What this set of quizzes is…"
      />

      <div class="space-y-1.5">
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="flex items-center gap-1 text-xs font-medium text-ink-subtle hover:text-ink-muted"
            aria-expanded={settingsOpen}
            aria-controls={settingsPanelId}
            onclick={() => (settingsOpen = !settingsOpen)}
          >
            {#if settingsOpen}
              <ChevronDown size={14} class="shrink-0" />
            {:else}
              <ChevronRight size={14} class="shrink-0" />
            {/if}
            Settings
            {#if settingsList.length > 0}
              <span class="rounded-full bg-surface-hover px-1.5 py-0.5 font-semibold text-ink-soft">
                {settingsList.length}
              </span>
            {/if}
          </button>
          <SettingsDocsLink />
        </div>
        <div id={settingsPanelId} class="space-y-1.5" hidden={!settingsOpen}>
          <SettingsLegend keys={GROUP_SUGGESTED_SETTING_KEYS} rules={GROUP_FRONTMATTER_RULES} />
          {#each settingsList as setting (setting._key)}
            {@const usedElsewhere = settingsList
              .filter((s) => s._key !== setting._key)
              .map((s) => s.key)}
            {@const valueSuggestions = settingValueSuggestions(
              setting.key,
              GROUP_FRONTMATTER_RULES
            )}
            {@const validation = setting.key.trim()
              ? validateSettingValue(setting.key, setting.value, GROUP_FRONTMATTER_RULES)
              : null}
            <div class="flex flex-wrap items-center gap-1.5">
              <select
                class="w-28 max-w-full shrink-0 rounded-md border border-line px-2 py-1 text-xs text-ink focus:border-line-strong focus:outline-none"
                bind:value={setting.key}
                onchange={() => selectSettingKey(setting)}
                aria-label="Setting key"
              >
                {#each groupSettingKeys( GROUP_SUGGESTED_SETTING_KEYS.filter((k) => !usedElsewhere.includes(k)), GROUP_FRONTMATTER_RULES ) as group (group.label)}
                  <optgroup label={group.label}>
                    {#each group.keys as k (k)}
                      <option value={k}>{k}</option>
                    {/each}
                  </optgroup>
                {/each}
              </select>
              <SuggestionInput
                bind:value={setting.value}
                suggestions={valueSuggestions}
                placeholder="value"
                class="min-w-[6rem] flex-1"
              />
              <button
                type="button"
                class="shrink-0 rounded p-2 text-ink-subtle hover:bg-surface-hover"
                onclick={() => removeSetting(setting._key)}
                aria-label="Remove setting"
              >
                <X size={16} />
              </button>
            </div>
            {#if validation?.error}
              <!-- Lines up under the value field: the key select (7rem) plus its gap. -->
              <p class="break-words text-xs text-negative-ink sm:pl-[7.375rem]">
                {validation.error}
              </p>
            {/if}
          {/each}
          <button
            type="button"
            class="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:bg-surface"
            onclick={addSetting}
          >
            <Plus size={13} /> Add setting
          </button>
          <!-- The one thing a generic key/value list can't say. `mode` decides what every other
               key and field on this screen even means, so what it currently means goes under it. -->
          <p class="pt-1 text-xs text-ink-subtle">{modeSummary(mode)}</p>
        </div>
      </div>
    </div>

    <!-- Direct siblings of the metadata card in the page's own space-y-6, exactly as question
         cards are in QuizBuilder — same visual family, so the same gap. -->
    {#each entries as entry, index (index)}
      {@const label = entryLabel(entry, index)}
      <div class="space-y-2 rounded-lg border border-line-subtle bg-surface-raised p-4">
        <div class="flex items-center gap-2">
          <!-- The badge's dot is the group hue again; the number itself stays on the ink ramp,
               since it's text. -->
          <span class="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ink-subtle">
            <span class="size-1.5 rounded-full bg-brand-group" aria-hidden="true"></span>#{index +
              1}
          </span>
          <select
            class="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-line-strong focus:outline-none"
            aria-label={`Quiz ${index + 1}`}
            bind:value={entry.quizId}
          >
            <option value="">— choose a quiz —</option>
            {#each library as quiz (quiz.id)}
              <option value={quiz.id}>{quiz.title || 'Untitled quiz'}</option>
            {/each}
          </select>
          <button
            type="button"
            class="shrink-0 rounded p-1 text-ink-subtle hover:bg-surface-hover disabled:opacity-40"
            aria-label={`Move ${label} up`}
            disabled={index === 0}
            onclick={() => move(index, -1)}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            class="shrink-0 rounded p-1 text-ink-subtle hover:bg-surface-hover disabled:opacity-40"
            aria-label={`Move ${label} down`}
            disabled={index === entries.length - 1}
            onclick={() => move(index, 1)}
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            class="shrink-0 rounded p-1 text-ink-subtle hover:bg-surface-hover hover:text-negative-ink"
            aria-label={`Remove ${label}`}
            onclick={() => removeEntry(index)}
          >
            <X size={15} />
          </button>
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            class="rounded-md border border-line-subtle bg-surface px-2 py-1 text-xs text-ink"
            placeholder="Display name (optional)"
            aria-label={`Display name for ${label}`}
            bind:value={entry.title}
          />
          {#if showFolders}
            <input
              type="text"
              class="rounded-md border border-line-subtle bg-surface px-2 py-1 text-xs text-ink"
              placeholder={mode === 'gauntlet' ? 'Category (required)' : 'Folder (optional)'}
              aria-label={`Folder for ${label}`}
              bind:value={entry.folder}
            />
          {/if}
        </div>
      </div>
    {/each}

    <button
      type="button"
      class="flex items-center gap-1 rounded-lg border border-dashed border-line px-4 py-3 text-sm font-medium text-ink-subtle hover:border-line-strong hover:text-ink-muted"
      onclick={addEntry}
    >
      <Plus size={15} /> Add quiz
    </button>
  {/if}

  {#if library.length > 0 && !openError}
    <ErrorList errors={[...built.errors, ...saveErrors, ...downloadError]} />

    <!-- What couldn't be restored when this group was reopened. A warning tint rather than the
         error one: the group opened, and the rest of it is editable — dismissible by fixing it,
         which is what removing or re-picking the entry does. -->
    {#if openWarnings.length > 0}
      <div
        class="rounded-lg border border-warning-line bg-warning-surface p-4 text-sm text-warning-ink-strong"
      >
        <ul class="space-y-1">
          {#each openWarnings as warning (warning)}
            <li class="break-words">{warning}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="flex flex-wrap items-center justify-end gap-3 border-t border-line-subtle pt-4">
      <p class="mr-auto text-xs text-ink-subtle">
        {built.files.length > 0 ? `${built.files.length} files` : 'Nothing to download yet'}
      </p>
      {#if saveState === 'saved'}
        <span
          transition:fade={{ duration: 200 }}
          class="flex items-center gap-1 text-sm font-medium text-positive-ink-soft"
        >
          <Check size={15} /> Saved
        </span>
      {/if}
      <!-- Download is secondary now: keeping the group in this browser is what most people want
           from this screen, and publishing to a repository is the deliberate extra step. -->
      <Button variant="secondary" disabled={built.errors.length > 0 || building} onclick={download}>
        {#if building}
          <Loader2 size={15} class="animate-spin" /> Building…
        {:else}
          <Download size={15} /> Download .zip
        {/if}
      </Button>
      <Button variant="primary" disabled={built.errors.length > 0} onclick={save}>
        Save to this browser
      </Button>
    </div>

    <div
      class="space-y-2 rounded-lg border border-line-subtle bg-surface p-4 text-sm text-ink-subtle"
    >
      <p class="flex items-center gap-1.5 font-medium text-ink-soft">
        <FolderGit2 size={15} /> What to do with it
      </p>
      <ol class="ml-4 list-decimal space-y-1">
        <li>Unzip it into a public GitHub repository — the whole folder, keeping the structure.</li>
        <li>Commit and push.</li>
        <li>
          <!-- `text-ink-soft` rather than inheriting the panel's `text-ink-subtle`: a sunken chip
               is a lighter background than the panel around it, and subtle ink on it lands at
               3.86:1 — a real contrast failure the a11y suite caught the moment it first visited
               this screen. Every other `bg-surface-sunken` in the app already pairs with
               `text-ink-soft` for the same reason. -->
          Share
          <code class="rounded bg-surface-sunken px-1 text-ink-soft">/group?repo=owner/name</code>,
          or the folder you put it in with
          <code class="rounded bg-surface-sunken px-1 text-ink-soft">&amp;path=</code>.
        </li>
      </ol>
      <p>
        Qwiz reads it signed out, so the repository has to be public. Nothing is uploaded from here
        — this is a download.
      </p>
    </div>
  {/if}
</div>

<!-- Nothing here is persisted until Save, so leaving with edits outstanding loses them outright —
     the same class of loss the quiz builder faces, and the same guard. -->
<LeaveGuard
  bind:this={leaveGuard}
  active={isDirty}
  title="Leave without saving?"
  message="This group has changes that haven't been saved to this browser yet. Leaving now discards them."
  confirmLabel="Discard changes"
/>
