import type { Component } from 'svelte';

export interface GradeResult {
  /** Points actually earned for this question. */
  earned: number;
  /** Maximum points obtainable for this question. A question where max === 0 is effectively unscored. */
  max: number;
}

/**
 * The contract every question type must implement to plug into the builder and player.
 * A new question type = a new folder implementing this + one line in registry.ts.
 * No other file needs to change.
 */
export interface QuestionTypeDefinition<TData = any, TResponse = any> {
  type: string;
  label: string;
  description: string;

  /** Data for a freshly added question of this type. */
  createDefault(): TData;

  /**
   * Opaque focus descriptor (same shape `Editor` expects via `focusTarget`) to apply when a
   * freshly-added question of this type first opens in edit mode. Omit to open with nothing
   * specifically focused.
   */
  defaultFocusTarget?(): unknown;

  /**
   * Derives a blank-content question from an existing one for the "format lock" feature:
   * keeps structural choices (variant, option kinds/count, point values) but clears
   * text/media/answer content. Falls back to createDefault() if not implemented.
   */
  cloneAsTemplate?(data: TData): TData;

  /** Returns a list of human-readable problems; empty array means the question is valid. */
  validate(data: TData): string[];

  /** Grades a player's response against the question's data. */
  grade(data: TData, response: TResponse): GradeResult;

  /** Returns a copy of data with answer-option order randomized, for the shuffle-options trivia setting. Omit if the type has no natural "options" concept. */
  shuffleOptions?(data: TData): TData;

  /**
   * JSON Schema (draft 2020-12) fragment describing this type's `data` shape, used to validate
   * `type`/`data` pairs during JSON import (see src/lib/triviaSchema.ts). Omit to allow any
   * shape for `data` when this type is encountered during import.
   */
  dataSchema?: object;

  /**
   * Builder-side editor for authoring the question. `focusTarget`/`onFocusHandled` are only
   * meaningful for types that also implement `Preview`: when a click on the Preview identifies
   * a specific field, the builder re-mounts this question in edit mode with `focusTarget` set
   * to that type's own (opaque-to-the-contract) focus descriptor; the Editor should focus the
   * matching DOM node and then call `onFocusHandled()`.
   */
  Editor: Component<{
    data: TData;
    onChange: (data: TData) => void;
    focusTarget?: unknown;
    onFocusHandled?: () => void;
  }>;

  /** Play-side component for answering the question. */
  Player: Component<{ data: TData; response: TResponse; onChange: (response: TResponse) => void }>;

  /**
   * Read-only review renderer for reveal screens: shows the full question the way the player
   * saw it, annotated with what they picked vs what was actually correct. Omit to skip answer
   * reveals for this type.
   */
  AnswerSummary?: Component<{ data: TData; response: TResponse }>;

  /**
   * Read-only, player-styled view used as a question card's default (non-editing) state in the
   * builder. `onFocus` is called with a type-owned focus descriptor when the user clicks a
   * specific field, requesting that this question switch into edit mode with that field
   * focused (see `Editor`'s `focusTarget`). Omit to always show `Editor` instead.
   */
  Preview?: Component<{ data: TData; onFocus: (target: unknown) => void }>;
}
