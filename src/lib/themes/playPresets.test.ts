import { describe, expect, it } from 'vitest';
import {
  isKnownPlayPreset,
  PLAY_PRESETS,
  playPresetCss,
  PRESET_ROLES,
  type PlayRoles
} from './playPresets';

/** WCAG 2.1 relative luminance, on the hex colours the presets are written in.
 *
 * Inline rather than a shared colour module: this is the only caller, presets only ever use hex,
 * and the twelve lines here are cheaper to read than a dependency on a general converter. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (from: number) => {
    const c = parseInt(value.slice(from, from + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const AA = 4.5;

/** Every pairing `PLAY_BASE` actually puts on screen, as `[label, ink, background]`. Derived from
 * the role mapping rather than hand-listed, so a role that starts being used somewhere new is
 * still covered by whichever pair names it. */
function pairs(roles: PlayRoles): [string, string, string][] {
  return [
    ['header text on the page', roles.pageInk, roles.page],
    ['body text on a card', roles.surfaceInk, roles.surface],
    ['muted text on a card', roles.surfaceInkMuted, roles.surface],
    ['option text', roles.panelInk, roles.panel],
    ['verdict label', roles.panelInk, roles.panel],
    ['button label', roles.accentInk, roles.accent],
    ['a selected option', roles.accentInk, roles.accent],
    ['a correct option', roles.correctInk, roles.correctSurface],
    ['a wrong option', roles.wrongInk, roles.wrongSurface],
    ['the home button', roles.surfaceInk, roles.surface],
    ['results heading', roles.surfaceInk, roles.panel]
  ];
}

describe('every preset is readable', () => {
  // The check that makes the role indirection worth it. Presets used to name colours element by
  // element, and nothing measured them — two shipped with option text near-invisible on its own
  // tile. A preset that fails this cannot be released, which is the point.
  for (const id of Object.keys(PRESET_ROLES)) {
    it(`${id} meets WCAG AA on every text pair`, () => {
      const failures = pairs(PRESET_ROLES[id])
        .filter(([, ink, bg]) => contrast(ink, bg) < AA)
        .map(([label, ink, bg]) => `${label}: ${contrast(ink, bg).toFixed(2)}:1 (${ink} on ${bg})`);
      expect(failures.join(' · ')).toBe('');
    });
  }

  it('keeps borders visible enough to read as edges', () => {
    // Not a WCAG text threshold — borders separate regions here rather than identify controls (the
    // app's own light theme sits at 1.42:1). 1.5:1 only catches a border that has vanished.
    for (const [id, roles] of Object.entries(PRESET_ROLES)) {
      expect(contrast(roles.border, roles.surface), `${id} border on surface`).toBeGreaterThan(1.5);
    }
  });
});

describe('playPresetCss', () => {
  it('gives every advertised preset a stylesheet, and `none` nothing', () => {
    for (const preset of PLAY_PRESETS) {
      const css = playPresetCss(preset.id);
      if (preset.id === 'none') expect(css).toBe('');
      else expect(css.length, preset.id).toBeGreaterThan(200);
    }
  });

  it('themes every element the play screen has a class for', () => {
    // The other half of the coverage problem: a preset can't forget an element, because the
    // mapping is shared — so asserting it once asserts it for all of them.
    const css = playPresetCss('arcade');
    for (const cls of [
      '.qwiz-back',
      '.qwiz-home',
      '.qwiz-welcome',
      '.qwiz-card',
      '.qwiz-results',
      '.qwiz-dialog',
      '.qwiz-title',
      '.qwiz-description',
      '.qwiz-rules',
      '.qwiz-progress',
      '.qwiz-progressbar',
      '.qwiz-score',
      '.qwiz-question-text',
      '.qwiz-option',
      '.qwiz-option-label',
      '.qwiz-option--selected',
      '.qwiz-option--correct',
      '.qwiz-option--wrong',
      '.qwiz-verdict',
      '.qwiz-verdict-score',
      '.qwiz-start',
      '.qwiz-submit',
      '.qwiz-next',
      '.qwiz-results-title',
      '.qwiz-back-to-summary'
    ]) {
      expect(css, `arcade never styles ${cls}`).toContain(cls);
    }
  });

  it('declares every role variable its rules consume', () => {
    const css = playPresetCss('terminal');
    const used = new Set([...css.matchAll(/var\((--qp-[a-z-]+)\)/g)].map((m) => m[1]));
    for (const name of used) {
      expect(css, `${name} is used but never set`).toContain(`${name}:`);
    }
    expect(used.size).toBeGreaterThan(10);
  });

  it('plays unstyled rather than failing on an id we do not ship', () => {
    // A quiz naming a preset from a newer version of Qwiz has to open.
    expect(playPresetCss('from-the-future')).toBe('');
    expect(playPresetCss(undefined)).toBe('');
  });
});

describe('PLAY_PRESETS', () => {
  it('has a stylesheet for every id but `none`, and no orphan stylesheets', () => {
    const advertised = PLAY_PRESETS.map((p) => p.id).filter((id) => id !== 'none');
    expect(advertised.sort()).toEqual(Object.keys(PRESET_ROLES).sort());
  });

  it('accepts what it advertises and nothing else', () => {
    for (const preset of PLAY_PRESETS) expect(isKnownPlayPreset(preset.id)).toBe(true);
    expect(isKnownPlayPreset('nord')).toBe(false);
  });
});

/** `color-mix(in srgb, a p%, b)` — a straight weighted average of the gamma-encoded channels,
 * which is what the srgb colour space mixes in. Mirrors the hover rule in PLAY_BASE. */
function mix(a: string, b: string, weightOfA: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.replace('#', '').slice(i, i + 2), 16);
  const out = [0, 2, 4].map((i) =>
    Math.round(ch(a, i) * weightOfA + ch(b, i) * (1 - weightOfA))
      .toString(16)
      .padStart(2, '0')
  );
  return `#${out.join('')}`;
}

// Hover is where this went wrong once already: with no rule of its own, Tailwind's `hover:bg-surface`
// resolved to the light theme's near-white on every preset, so hovering an option on a dark theme
// turned it white under white text. Measuring the hovered state stops that returning silently.
describe('every preset stays readable while hovered', () => {
  for (const [id, roles] of Object.entries(PRESET_ROLES)) {
    it(id, () => {
      const failures: string[] = [];
      const check = (label: string, ink: string, base: string) => {
        const hovered = mix(base, roles.panelInk, 0.88);
        const ratio = contrast(ink, hovered);
        if (ratio < AA) failures.push(`${label}: ${ratio.toFixed(2)}:1 on ${hovered}`);
      };
      check('an unanswered option', roles.panelInk, roles.panel);
      check('a selected option', roles.accentInk, roles.accent);
      check('a correct option', roles.correctInk, roles.correctSurface);
      check('a wrong option', roles.wrongInk, roles.wrongSurface);
      expect(failures.join(' · ')).toBe('');
    });
  }
});

describe('role values stay mixable', () => {
  // Paper once set an option state to `transparent` in its own flourishes, and the hover rule
  // blended that toward the ink into a translucent dark under dark text — 1.02:1 in a real
  // browser, while this file's arithmetic quietly produced NaN and passed. Every role must be a
  // plain hex colour, and no preset may introduce a keyword the hover mix can't handle.
  it('every role is a six-digit hex', () => {
    for (const [id, roles] of Object.entries(PRESET_ROLES)) {
      for (const [role, value] of Object.entries(roles)) {
        expect(value, `${id}.${role}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('no preset sets an option colour to a keyword', () => {
    for (const preset of PLAY_PRESETS) {
      const css = playPresetCss(preset.id);
      expect(css, preset.id).not.toMatch(/--qp-option-bg:\s*(transparent|currentcolor|inherit)/i);
    }
  });
});
