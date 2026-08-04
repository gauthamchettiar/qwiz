/** A minimal ZIP writer, so a whole group of quizzes can leave the app as one file.
 *
 * Hand-rolled rather than a dependency, for the same reason `shareLink.ts` deflates with the
 * platform's own `CompressionStream` instead of pulling in a compression library: the format's
 * writing half is about 120 lines, the browser already provides the only hard part (DEFLATE), and
 * a zip library would be the largest dependency in the project by some margin — for one button.
 *
 * Only what's needed is implemented: no directory entries (a path with `/` in it creates the
 * folders on extraction), no zip64 (a group of text files is nowhere near 4GB), no encryption.
 * Everything is written little-endian, per the spec.
 */

/** Precomputed CRC-32 table (polynomial 0xEDB88320). Every entry in a zip carries a CRC of its
 * UNCOMPRESSED bytes, and an archive with a wrong one is rejected by every extractor rather than
 * quietly opening — so this is the part worth testing against known values. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Path within the archive. Forward slashes create folders on extraction. */
  name: string;
  content: string;
}

/** A fixed timestamp for every entry, rather than "now".
 *
 * Deliberate: it makes the same group download byte-identical every time, which is what lets an
 * author diff two downloads and see only what they actually changed. A real clock would make every
 * archive differ from the last for no reason the author caused. 1980-01-01 is the earliest the DOS
 * date format can express, so it reads as "unset" rather than as a wrong date. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Builds the archive. Async because DEFLATE is — the same cost `encodeSharePayload` pays. */
export async function createZip(entries: readonly ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = encoder.encode(entry.content);
    const deflated = await deflateRaw(raw);
    const crc = crc32(raw);

    // DEFLATE can be LARGER than the input for tiny or already-random data, in which case storing
    // it verbatim is both smaller and faster to read back.
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const method = stored ? 0 : 8;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // flags: bit 11 = filename is UTF-8
    lv.setUint16(8, method, true);
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // extra field length
    local.set(name, 30);

    const entryHeader = new Uint8Array(46 + name.length);
    const cv = new DataView(entryHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory header signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    // extra (30), comment (32), disk number (34), internal attrs (36) all zero
    cv.setUint32(38, 0, true); // external attributes
    cv.setUint32(42, offset, true); // offset of the local header
    entryHeader.set(name, 46);

    parts.push(local, body);
    central.push(entryHeader);
    offset += local.length + body.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory signature
  ev.setUint16(8, entries.length, true); // entries on this disk
  ev.setUint16(10, entries.length, true); // entries total
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true); // where the central directory starts
  // comment length (20) is zero

  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/zip' });
}
