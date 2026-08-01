<script lang="ts">
  // Presentation-only Hangman-style letter bank: renders one button per bank letter and reports a
  // click via `onGuess` — all "is this letter correct/wrong/fully revealed/locked" logic lives in
  // the caller (QuestionPlayer.svelte), which has the question/draft state this component doesn't
  // need to know about. Button grid mirrors QuestionPlayer's own choice-option grid convention
  // (`optionsLayoutClass`), just sized for up to 26 compact letter buttons instead of a handful of
  // full option rows.
  let {
    letters,
    guessedLetters,
    disabledLetters,
    locked = false,
    onGuess
  }: {
    letters: string[];
    guessedLetters: Map<string, 'correct' | 'wrong'>;
    disabledLetters: ReadonlySet<string>;
    locked?: boolean;
    onGuess: (letter: string) => void;
  } = $props();
</script>

<div class="grid grid-cols-7 gap-1.5 sm:grid-cols-9">
  {#each letters as letter (letter)}
    {@const status = guessedLetters.get(letter)}
    <button
      type="button"
      class="rounded-md border py-1.5 text-sm font-medium uppercase transition-colors disabled:cursor-not-allowed {status ===
      'correct'
        ? 'border-positive-line bg-positive-surface text-positive-ink'
        : status === 'wrong'
          ? 'border-negative-line-subtle bg-negative-surface text-negative-ink-faint'
          : 'border-line bg-surface-raised text-ink-muted hover:bg-surface disabled:opacity-50'}"
      disabled={locked || disabledLetters.has(letter)}
      onclick={() => onGuess(letter)}
    >
      {letter}
    </button>
  {/each}
</div>
