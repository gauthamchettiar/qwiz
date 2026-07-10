import type { QuestionTypeDefinition } from './types';
import { choiceType } from './choice';

/**
 * Every question type registers itself here. To add a new type:
 * 1. Create src/lib/question-types/<type>/{index.ts,Editor.svelte,Player.svelte}
 * 2. Import its definition and add it to this list.
 * No other file needs to change.
 */
const definitions: QuestionTypeDefinition[] = [choiceType];

export const questionTypeRegistry: Record<string, QuestionTypeDefinition> = Object.fromEntries(
  definitions.map((d) => [d.type, d])
);

/** Ordered list for "Add question" menus. */
export const questionTypeList = definitions;

export function getQuestionType(type: string): QuestionTypeDefinition {
  const def = questionTypeRegistry[type];
  if (!def) throw new Error(`Unknown question type: ${type}`);
  return def;
}
