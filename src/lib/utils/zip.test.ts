import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createZip, crc32 } from './zip';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function zipBytes(entries: { name: string; content: string }[]): Promise<Uint8Array> {
  return new Uint8Array(await (await createZip(entries)).arrayBuffer());
}

function u32(data: Uint8Array, at: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(at, true);
}
function u16(data: Uint8Array, at: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(at, true);
}

describe('crc32', () => {
  // Published check values for the standard CRC-32 (polynomial 0xEDB88320) — the one thing here
  // worth pinning to something external, since a wrong CRC makes every extractor reject the
  // archive rather than quietly opening it.
  it('matches the published check value for "123456789"', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('matches known values for the empty string and a single character', () => {
    expect(crc32(bytes(''))).toBe(0);
    expect(crc32(bytes('a'))).toBe(0xe8b7be43);
  });
});

describe('createZip — structure', () => {
  it('writes the three signatures a zip is made of', async () => {
    const data = await zipBytes([{ name: 'a.txt', content: 'hello' }]);

    expect(u32(data, 0)).toBe(0x04034b50); // local file header
    const end = data.length - 22;
    expect(u32(data, end)).toBe(0x06054b50); // end of central directory
    expect(u32(data, u32(data, end + 16))).toBe(0x02014b50); // central directory, at its offset
  });

  it('counts its entries in the end record', async () => {
    const data = await zipBytes([
      { name: 'a.txt', content: 'one' },
      { name: 'b.txt', content: 'two' },
      { name: 'c.txt', content: 'three' }
    ]);
    const end = data.length - 22;
    expect(u16(data, end + 8)).toBe(3);
    expect(u16(data, end + 10)).toBe(3);
  });

  it('records the real CRC and uncompressed size of each entry', async () => {
    const content = 'the quick brown fox';
    const data = await zipBytes([{ name: 'a.txt', content }]);

    expect(u32(data, 14)).toBe(crc32(bytes(content)));
    expect(u32(data, 22)).toBe(bytes(content).length);
  });

  it('marks filenames as UTF-8, so a non-ASCII name survives extraction', async () => {
    const data = await zipBytes([{ name: 'café/quiz.qwiz', content: 'x' }]);
    expect(u16(data, 6) & 0x0800).toBe(0x0800);
  });

  it('stores rather than deflates when deflating would make an entry bigger', async () => {
    // Tiny inputs inflate under DEFLATE's block overhead. Storing them is both smaller and what
    // any sane writer does.
    const data = await zipBytes([{ name: 'a.txt', content: 'x' }]);
    expect(u16(data, 8)).toBe(0); // method 0 = stored
  });

  it('deflates content that actually compresses', async () => {
    const data = await zipBytes([{ name: 'a.txt', content: 'ab'.repeat(500) }]);
    expect(u16(data, 8)).toBe(8); // method 8 = deflate
    expect(u32(data, 18)).toBeLessThan(u32(data, 22)); // compressed < uncompressed
  });

  it('is byte-identical for the same input, so two downloads diff cleanly', async () => {
    const entries = [
      { name: '.qwizgroup', content: '---\ntitle: A\n---' },
      { name: 'one.qwiz', content: '---\ntitle: One\n---' }
    ];
    expect(await zipBytes(entries)).toEqual(await zipBytes(entries));
  });

  it('produces a valid empty archive', async () => {
    const data = await zipBytes([]);
    expect(data.length).toBe(22);
    expect(u32(data, 0)).toBe(0x06054b50);
  });
});

// The structural assertions above can all pass on an archive no real tool accepts. This is the one
// that would actually catch that, so it's worth the shell-out — skipped rather than failed where
// `unzip` isn't installed, since that's an environment gap and not a regression.
const unzip = (() => {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!unzip)('createZip — a real extractor accepts it', () => {
  it('round-trips every file, contents intact', async () => {
    const entries = [
      { name: '.qwizgroup', content: '---\ntitle: The Trail\n:mode=journey\n---' },
      { name: 'rounds/one.qwiz', content: '---\ntitle: One\n---\n\nQ?\n{\n=A\n~B\n}' },
      { name: 'rounds/two.qwiz', content: 'x'.repeat(2000) }
    ];
    const dir = mkdtempSync(join(tmpdir(), 'qwiz-zip-'));
    try {
      writeFileSync(join(dir, 'group.zip'), await zipBytes(entries));
      execFileSync('unzip', ['-q', 'group.zip'], { cwd: dir });

      for (const entry of entries) {
        expect(readFileSync(join(dir, entry.name), 'utf8'), entry.name).toBe(entry.content);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
