import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GROUP_MODES, GROUP_SETTING_MODES, GROUP_SETTING_RULES } from './quizGroup';

// The same guard settingsDoc.test.ts puts on docs/settings.md, for the same reason: nothing in the
// build catches prose drifting from code, and a settings table that lists a key the parser rejects
// (or omits one it accepts) is a broken promise made to an author who has no other reference.
//
// Deliberately checks the FACTS a reader would act on — which keys exist, what they accept, what
// they default to, which modes they apply to — and never the wording, which stays free to be
// edited without a test objecting.
const DOC = 'docs/qwizgroup-format.md';
const source = readFileSync(DOC, 'utf8');

/** The `| \`key\` | ...` rows of the table under `heading`, as key -> whole row. Read by heading
 * rather than position so the document can be reordered freely. */
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

const groupRows = tableRows('Group-wide settings');
const entryRows = tableRows('Entry keys');

describe('docs/qwizgroup-format.md', () => {
  it('documents every group-wide setting, and no key that does not exist', () => {
    expect([...groupRows.keys()].sort()).toEqual(Object.keys(GROUP_SETTING_RULES).sort());
  });

  it('lists the settings table alphabetically, matching how the keys are offered elsewhere', () => {
    expect([...groupRows.keys()]).toEqual([...groupRows.keys()].sort());
  });

  it('leads the entry table with the one required key, then lists the rest alphabetically', () => {
    // Not strict alphabetical on purpose: `quiz:` is what identifies a block at all, so a reader
    // scanning this table needs it first. Everything optional sorts after it.
    const [first, ...optional] = [...entryRows.keys()];
    expect(first).toBe('quiz');
    expect(optional).toEqual([...optional].sort());
  });

  const enums = Object.entries(GROUP_SETTING_RULES).filter(([, rule]) => rule.values !== undefined);

  it.each(enums)('%s documents every value it accepts', (key, rule) => {
    const row = groupRows.get(key)!;
    for (const value of rule.values!) {
      expect(row, `${key} accepts "${value}" but ${DOC} doesn't list it`).toContain(`\`${value}\``);
    }
  });

  const defaulted = Object.entries(GROUP_SETTING_RULES).filter(
    ([, rule]) => rule.default !== undefined
  );

  it.each(defaulted)('%s documents its real default', (key, rule) => {
    expect(groupRows.get(key)!, `${key} defaults to ${rule.default}`).toContain(
      `\`${rule.default}\``
    );
  });

  // A key's "Applies to" column is the thing an author reads to decide where to put it, and a wrong
  // one sends them straight into a parse error the docs told them wouldn't happen.
  it.each(Object.entries(GROUP_SETTING_MODES))(
    '%s documents the modes it applies to',
    (key, modes) => {
      const row = groupRows.get(key)!;
      if (modes.length === GROUP_MODES.length) {
        expect(row, `${key} applies everywhere and should say "all"`).toMatch(/\|\s*all\s*\|/);
        return;
      }
      for (const mode of modes) {
        expect(row, `${key} applies to ${mode} but ${DOC} doesn't say so`).toContain(`\`${mode}\``);
      }
    }
  );

  it('gives every mode its own section, so none is listed but unexplained', () => {
    for (const mode of GROUP_MODES) {
      expect(source, `mode "${mode}" has no "### ${mode}" section`).toContain(`### \`${mode}\``);
    }
  });

  it('documents the entry keys the parser actually understands', () => {
    expect([...entryRows.keys()].sort()).toEqual(['group', 'id', 'quiz', 'requires', 'title']);
  });
});
