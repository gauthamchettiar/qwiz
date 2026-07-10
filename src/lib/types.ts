/** A single unit of question/answer content shared across question types. */
export type ContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'image'; url: string; alt?: string }
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

export interface TriviaSettings {
  /** Score threshold to "win". null = no win/lose condition tracked. */
  pointsToWin: number | null;
  revealAnswers: RevealTiming;
  revealScore: RevealTiming;
  revealWin: RevealWinTiming;
  /** Candidate win messages; one is picked at random when the player wins. */
  winMessage: string[];
  /** Candidate lose messages; one is picked at random when the player doesn't win. */
  loseMessage: string[];
  shuffleQuestions: boolean;
  /** Seconds. null = no limit. */
  perQuestionTimeLimit: number | null;
  /** Seconds. null = no limit. */
  overallTimeLimit: number | null;
  /** Show a cover screen (description + a Start button) before the first question. */
  showIntro: boolean;
  /** Hex color theming the player UI's buttons/highlights. Builder UI is unaffected. */
  accentColor: string;
  /** Show a running "earned / max so far" tally while answering. No effect if revealScore is 'never'. */
  showRunningScore: boolean;
  /** Hide the Back button so players can't revisit earlier questions. */
  disableBack: boolean;
  /** Once a question's reveal screen has been shown, lock its answer against further changes if revisited. */
  disableEditAfterReveal: boolean;
}

export function defaultTriviaSettings(): TriviaSettings {
  return {
    pointsToWin: null,
    revealAnswers: 'end',
    revealScore: 'end',
    revealWin: 'end',
    winMessage: ['You win!'],
    loseMessage: ['Better luck next time!'],
    shuffleQuestions: false,
    perQuestionTimeLimit: null,
    overallTimeLimit: null,
    showIntro: true,
    accentColor: '#4f46e5',
    showRunningScore: false,
    disableBack: false,
    disableEditAfterReveal: false
  };
}

export interface Trivia {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  questions: QuestionInstance[];
  settings: TriviaSettings;
}

/** Lightweight shape used for list views, avoids shipping every question's data. */
export interface TriviaSummary {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
}

export function toSummary(trivia: Trivia): TriviaSummary {
  const { id, title, description, createdAt, updatedAt, questions } = trivia;
  return { id, title, description, createdAt, updatedAt, questionCount: questions.length };
}
