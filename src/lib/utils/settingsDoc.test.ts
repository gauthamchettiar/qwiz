import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INHERITABLE_SETTING_KEYS, QUIZ_SETTING_RULES, SETTING_RULES } from './quizScript';

// docs/settings.md is the reference the app itself links to (the arrow beside every Settings
// block — see SettingsDocsLink.svelte), so a key missing from it, or one documented that no longer
// exists, is a broken promise made in the UI. Nothing in the build catches prose drifting from
// code, which is exactly how the tables here ended up listing pre-rename variant names and an
// accepted value (`typed_input=field`) the parser had never accepted.
//
// Deliberately checks the FACTS a reader would act on — which keys exist, what values they take,
// what they default to, whether they inherit — and not the wording around them, which should stay
// free to be edited without a test objecting.
const DOC = 'docs/settings.md';
const source = readFileSync(DOC, 'utf8');

/** The `| \`key\` | ...` rows of the table under `heading`, as key -> whole row. Tables are read
 * by their heading rather than by position so reordering the document doesn't break this. */
function tableRows(heading: string): Map<string, string> {
  const start = source.indexOf(`## ${heading}`);
  expect(start, `"## ${heading}" is missing from ${DOC}`).toBeGreaterThan(-1);
  const rest = source.slice(start + heading.length);
  const end = rest.indexOf('\n## ');
  const section = end === -1 ? rest : rest.slice(0, end);

  const rows = new Map<string, string>();
  for (const line of section.split('\n')) {
    const match = /^\|\s*`([a-z_]+)`\s*\|/.exec(line);
    if (match) rows.set(match[1], line);
  }
  return rows;
}

const quizRows = tableRows('Quiz-wide settings');
const questionRows = tableRows('Per-question settings');

describe('docs/settings.md', () => {
  it('documents every quiz-wide setting, and no key that does not exist', () => {
    expect([...quizRows.keys()].sort()).toEqual(Object.keys(QUIZ_SETTING_RULES).sort());
  });

  it('documents every per-question setting, and no key that does not exist', () => {
    expect([...questionRows.keys()].sort()).toEqual(Object.keys(SETTING_RULES).sort());
  });

  it('lists both tables alphabetically, matching the order the key dropdowns offer', () => {
    expect([...quizRows.keys()]).toEqual([...quizRows.keys()].sort());
    expect([...questionRows.keys()]).toEqual([...questionRows.keys()].sort());
  });

  const enums = [...Object.entries(QUIZ_SETTING_RULES), ...Object.entries(SETTING_RULES)].filter(
    ([, rule]) => rule.values !== undefined
  );

  it.each(enums)('%s documents every value it accepts, and no other', (key, rule) => {
    const row = quizRows.get(key) ?? questionRows.get(key)!;
    for (const value of rule.values!) {
      expect(row, `${key} accepts "${value}" but ${DOC} doesn't list it`).toContain(`\`${value}\``);
    }
  });

  const defaulted = [
    ...Object.entries(QUIZ_SETTING_RULES),
    ...Object.entries(SETTING_RULES)
  ].filter(([, rule]) => rule.default !== undefined);

  it.each(defaulted)('%s documents its real default', (key, rule) => {
    const row = quizRows.get(key) ?? questionRows.get(key)!;
    expect(row, `${key} defaults to ${rule.default}`).toContain(`\`${rule.default}\``);
  });

  // An enum whose own default isn't one of its accepted values makes form mode pre-fill a value it
  // then immediately rejects — the exact `typed_input` bug this file was written after.
  it.each(enums)('%s has a default that is actually one of its accepted values', (_key, rule) => {
    if (rule.default === undefined) return;
    expect(rule.values).toContain(String(rule.default));
  });

  it('marks each per-question setting as inheriting exactly when it does', () => {
    for (const [key, row] of questionRows) {
      const documented = /\|\s*yes\s*\|/.test(row);
      expect(documented, `${key}'s "Inherits" column disagrees with INHERITABLE_SETTING_KEYS`).toBe(
        INHERITABLE_SETTING_KEYS.includes(key)
      );
    }
  });
});
