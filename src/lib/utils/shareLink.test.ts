import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SHARE_PAYLOAD_VERSION,
  SHARE_URL_MAX_LENGTH,
  SHARE_URL_WARN_LENGTH,
  buildShareUrl,
  decodeSharePayload,
  encodeSharePayload,
  fromBase64Url,
  readSharePayload,
  shareUrlVerdict,
  toBase64Url
} from './shareLink';

const exampleFiles = readdirSync('examples').filter((f) => f.endsWith('.qwiz'));

describe('base64url', () => {
  it('round-trips bytes at every padding length', () => {
    // 0, 1 and 2 bytes of padding — the three cases the "=" stripping has to get right.
    for (const length of [0, 1, 2, 3, 4, 5, 6, 255]) {
      const bytes = new Uint8Array(Array.from({ length }, (_, i) => (i * 37) % 256));
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });

  it('emits only URL-safe characters', () => {
    // 0xFB 0xFF encodes to "+/" in standard base64 — the exact pair the alphabet swap exists for.
    const encoded = toBase64Url(new Uint8Array([0xfb, 0xff, 0xbf]));
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encoded).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('survives a payload large enough to overflow a spread call', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(() => toBase64Url(bytes)).not.toThrow();
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });
});

describe('encode/decode round-trip', () => {
  it.each(exampleFiles)('reproduces %s exactly', async (file) => {
    const source = readFileSync(`examples/${file}`, 'utf8');
    const { source: decoded, error } = await decodeSharePayload(await encodeSharePayload(source));
    expect(error).toBeUndefined();
    expect(decoded).toBe(source);
  });

  it('handles non-ASCII text, which a naive byte encoding would mangle', async () => {
    const source = 'Quel est le café le plus ancien ? 日本語 — emoji 🎉';
    const { source: decoded } = await decodeSharePayload(await encodeSharePayload(source));
    expect(decoded).toBe(source);
  });

  it('handles an empty document', async () => {
    const { source: decoded } = await decodeSharePayload(await encodeSharePayload(''));
    expect(decoded).toBe('');
  });

  it('actually compresses — otherwise the fragment gains nothing over the raw text', async () => {
    const source = readFileSync(`examples/${exampleFiles[0]}`, 'utf8');
    const payload = await encodeSharePayload(source);
    expect(payload.length).toBeLessThan(source.length);
  });

  it('tags the payload with its version', async () => {
    expect(await encodeSharePayload('x')).toMatch(new RegExp(`^${SHARE_PAYLOAD_VERSION}\\.`));
  });
});

describe('decodeSharePayload — damaged links', () => {
  it('rejects a payload from another version, distinctly', async () => {
    const { source, error } = await decodeSharePayload('9.AAAA');
    expect(source).toBeUndefined();
    expect(error).toMatch(/version of Qwiz/);
  });

  it('rejects a payload with no version prefix at all', async () => {
    expect((await decodeSharePayload('AAAA')).error).toMatch(/version of Qwiz/);
  });

  it('reports malformed base64 as a damaged link', async () => {
    const { error } = await decodeSharePayload(`${SHARE_PAYLOAD_VERSION}.not valid base64!!`);
    expect(error).toMatch(/damaged/);
  });

  it('reports valid base64 that is not deflate data as a cut-short link', async () => {
    const junk = toBase64Url(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    const { error } = await decodeSharePayload(`${SHARE_PAYLOAD_VERSION}.${junk}`);
    expect(error).toMatch(/cut short/);
  });

  it('reports a truncated real payload rather than throwing', async () => {
    const payload = await encodeSharePayload(readFileSync(`examples/${exampleFiles[0]}`, 'utf8'));
    const { source, error } = await decodeSharePayload(payload.slice(0, payload.length - 40));
    expect(source).toBeUndefined();
    expect(error).toBeDefined();
  });
});

describe('buildShareUrl / readSharePayload', () => {
  it('puts the payload in the fragment of /play', () => {
    expect(buildShareUrl('https://qwiz.example', '1.abc')).toBe('https://qwiz.example/play#q=1.abc'); // prettier-ignore
  });

  it('round-trips through a location.hash', async () => {
    const payload = await encodeSharePayload('hello');
    const url = buildShareUrl('https://qwiz.example', payload);
    expect(readSharePayload(new URL(url).hash)).toBe(payload);
  });

  it('returns null for a fragment with no quiz in it', () => {
    for (const hash of ['', '#', '#q=', '#other=x', '#justtext']) {
      expect(readSharePayload(hash)).toBeNull();
    }
  });
});

describe('shareUrlVerdict', () => {
  it('is ok for an ordinary text quiz', async () => {
    const source = readFileSync(`examples/${exampleFiles[0]}`, 'utf8');
    const url = buildShareUrl('https://qwiz.example', await encodeSharePayload(source));
    expect(url.length).toBeLessThan(SHARE_URL_WARN_LENGTH);
    expect(shareUrlVerdict(url)).toBe('ok');
  });

  it('warns past the length link handlers start truncating at', () => {
    expect(shareUrlVerdict('x'.repeat(SHARE_URL_WARN_LENGTH))).toBe('ok');
    expect(shareUrlVerdict('x'.repeat(SHARE_URL_WARN_LENGTH + 1))).toBe('long');
    expect(shareUrlVerdict('x'.repeat(SHARE_URL_MAX_LENGTH))).toBe('long');
  });

  it('refuses past the length browsers stop accepting', () => {
    expect(shareUrlVerdict('x'.repeat(SHARE_URL_MAX_LENGTH + 1))).toBe('too-long');
  });

  // The realistic way a quiz gets too big to share is embedded base64 image data — the one kind of
  // content in a .qwiz document that doesn't compress, since it's already compressed.
  it('refuses a quiz carrying a large embedded image', async () => {
    // Deterministic but incompressible, which is what real base64 image data looks like — a
    // repeating pattern would deflate to nothing and prove the opposite of the point.
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let x = 123456789; // xorshift32 — an LCG's low bits are patterned enough for deflate to eat
    const next = () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return x >>> 0;
    };
    const imageData = Array.from({ length: 80_000 }, () => ALPHABET.charAt(next() % 64)).join('');
    const source = [
      '---',
      'title: Picture round',
      'description: ',
      'category: ',
      'tags: []',
      '---',
      '',
      `![A photograph](data:image/png;base64,${imageData})`,
      'What is this?',
      '{',
      '=A photograph',
      '}'
    ].join('\n');

    const url = buildShareUrl('https://qwiz.example', await encodeSharePayload(source));
    expect(shareUrlVerdict(url)).toBe('too-long');
    // Still decodable — the refusal is about what a link can carry, not about the quiz being bad.
    expect((await decodeSharePayload(await encodeSharePayload(source))).source).toBe(source);
  });
});
