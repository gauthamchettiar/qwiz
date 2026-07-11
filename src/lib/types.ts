/** A single unit of question/answer content shared across question types. */
export type ContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'image'; url: string; alt: string }
  | { kind: 'video'; videoId: string };

export function emptyTextBlock(): ContentBlock {
  return { kind: 'text', text: '' };
}

/** A question as stored inside a trivia. `data` shape is owned by the question type. */
export interface QuestionInstance<TData = unknown> {
  id: string;
  type: string;
  data: TData;
}

export type RevealTiming = 'after-question' | 'end' | 'never';
export type RevealWinTiming = 'end' | 'never';

/** Player-page typeface presets. Maps to a CSS font stack applied to the whole player. */
export type FontChoice = 'sans' | 'serif' | 'mono' | 'rounded';
export const FONT_STACKS: Record<FontChoice, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Segoe UI", system-ui, sans-serif'
};

export interface TriviaSettings {
  /** Percentage (0-100) of the played total a player needs to reach to "win". null = no
   * win/lose condition tracked. Converted to a points threshold at play time, since the
   * actual total can vary per attempt when `maxQuestions` samples a subset of the pool. */
  pointsToWinPercent: number | null;
  /** Number of wrong answers allowed before the player automatically fails, regardless of
   * points earned. null = unlimited (no lives mechanic). Always > 0 when set. */
  maxWrongAnswers: number | null;
  revealAnswers: RevealTiming;
  revealScore: RevealTiming;
  revealWin: RevealWinTiming;
  /** Candidate win messages; one is picked at random when the player wins. */
  winMessage: string[];
  /** Candidate lose messages; one is picked at random when the player doesn't win. */
  loseMessage: string[];
  shuffleQuestions: boolean;
  /** Only meaningful when shuffleQuestions is true: ask this many random questions from the
   * pool instead of all of them. null = use every question. */
  maxQuestions: number | null;
  /** Seconds. null = no limit. */
  perQuestionTimeLimit: number | null;
  /** Seconds. null = no limit. */
  overallTimeLimit: number | null;
  /** Show a cover screen (description + a Start button) before the first question. */
  showIntro: boolean;
  /** Main call-to-action buttons (Start, Next, Continue, Play again). */
  primaryColor: string;
  /** Back button and other secondary/outline actions. */
  secondaryColor: string;
  /** Selection highlight: chosen option border/tint, running score, reveal buttons. Hex color theming the player UI. Builder UI is unaffected. */
  accentColor: string;
  /** Correct-answer indication. */
  correctColor: string;
  /** Wrong-answer indication. */
  wrongColor: string;
  /** Partial-credit indication. */
  partialColor: string;
  /** Unscored / neutral indication. */
  neutralColor: string;
  /** Card heading/body text color. */
  textColor: string;
  /** Question/intro/results card background color. */
  bgColor: string;
  /** Typeface preset applied to the whole player page. */
  fontFamily: FontChoice;
  /** Show a running "earned / max so far" tally while answering. No effect if revealScore is 'never'. */
  showRunningScore: boolean;
  /** Hide the Back button so players can't revisit earlier questions. */
  disableBack: boolean;
  /** Once a question's reveal screen has been shown, lock its answer against further changes if revisited. */
  disableEditAfterReveal: boolean;
}

export function defaultTriviaSettings(): TriviaSettings {
  return {
    pointsToWinPercent: null,
    maxWrongAnswers: null,
    revealAnswers: 'end',
    revealScore: 'end',
    revealWin: 'end',
    winMessage: ['You win!'],
    loseMessage: ['Better luck next time!'],
    shuffleQuestions: false,
    maxQuestions: null,
    perQuestionTimeLimit: null,
    overallTimeLimit: null,
    showIntro: true,
    primaryColor: '#4f46e5',
    secondaryColor: '#64748b',
    accentColor: '#4f46e5',
    correctColor: '#16a34a',
    wrongColor: '#dc2626',
    partialColor: '#d97706',
    neutralColor: '#64748b',
    textColor: '#0f172a',
    bgColor: '#ffffff',
    fontFamily: 'sans',
    showRunningScore: false,
    disableBack: false,
    disableEditAfterReveal: false
  };
}

export interface Trivia {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  questions: QuestionInstance[];
  settings: TriviaSettings;
  /** Free-form labels for organizing and filtering on the home page. Optional so trivias
   * authored before tags existed (and remote ones) still validate. */
  tags?: string[];
}

/** Lightweight shape used for list views, avoids shipping every question's data. */
export interface TriviaSummary {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
  tags: string[];
}

export function toSummary(trivia: Trivia): TriviaSummary {
  const { id, title, description, createdAt, updatedAt, questions, tags } = trivia;
  return { id, title, description, createdAt, updatedAt, questionCount: questions.length, tags: tags ?? [] };
}
