import { describe, expect, it } from 'vitest';
import { needsThemeDecision, resolveThemeCss } from './themeCss';

describe('resolveThemeCss', () => {
  const PRESET = '.qwiz-option { border-radius: 999px; }';
  const CUSTOM = '.qwiz-question-text { font-family: Georgia, serif; }';

  it('applies a preset with nothing asked — it is this app’s own css, named not carried', () => {
    expect(resolveThemeCss(PRESET, undefined, undefined)).toBe(PRESET);
  });

  it('applies nothing at all when there is neither a preset nor custom css', () => {
    expect(resolveThemeCss('', undefined, 'full')).toBeNull();
    expect(resolveThemeCss('', '   ', 'full')).toBeNull();
    expect(resolveThemeCss('   ', '', undefined)).toBeNull();
  });

  it('holds the author’s css back until it has been allowed', () => {
    expect(resolveThemeCss(PRESET, CUSTOM, undefined)).toBe(PRESET);
    expect(resolveThemeCss(PRESET, CUSTOM, 'none')).toBe(PRESET);
  });

  it('appends the author’s css after the preset, so it wins ties on specificity', () => {
    expect(resolveThemeCss(PRESET, CUSTOM, 'full')).toBe(`${PRESET}\n\n${CUSTOM}`);
  });

  it('applies custom css on its own, with no preset', () => {
    expect(resolveThemeCss('', CUSTOM, 'full')).toBe(CUSTOM);
    expect(resolveThemeCss('', CUSTOM, undefined)).toBeNull();
  });
});

describe('needsThemeDecision', () => {
  it('asks only about css the author wrote, never about a preset', () => {
    expect(needsThemeDecision('.qwiz-option { color: red; }', undefined)).toBe(true);
    expect(needsThemeDecision('.qwiz-option { color: red; }', 'full')).toBe(false);
    expect(needsThemeDecision('.qwiz-option { color: red; }', 'none')).toBe(false);
    expect(needsThemeDecision(undefined, undefined)).toBe(false);
    expect(needsThemeDecision('  ', undefined)).toBe(false);
  });
});
