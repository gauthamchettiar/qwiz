// A tiny, dependency-free ZIP writer (store method — no compression). Enough to bundle a
// quiz-data/ folder of small JSON files into one download the user can commit to their repo.

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipFile {
  /** Full path within the zip, e.g. "quiz-data/01-basics/trivia.json". */
  name: string;
  content: string;
}

/** Builds a .zip Blob from a set of text files (folders are implied by the paths). */
export function createZip(files: ZipFile[]): Blob {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const size = data.length;

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); // local file header signature
    lh.setUint16(4, 20, true); // version needed
    lh.setUint16(6, 0x0800, true); // flags (UTF-8 filename)
    lh.setUint16(8, 0, true); // method: store
    lh.setUint16(10, 0, true); // mod time
    lh.setUint16(12, 0x21, true); // mod date (1980-01-01)
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); // compressed size
    lh.setUint32(22, size, true); // uncompressed size
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true); // extra length
    const localHeader = new Uint8Array(lh.buffer);
    parts.push(localHeader, nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); // central dir signature
    cd.setUint16(4, 20, true); // version made by
    cd.setUint16(6, 20, true); // version needed
    cd.setUint16(8, 0x0800, true); // flags
    cd.setUint16(10, 0, true); // method
    cd.setUint16(12, 0, true); // mod time
    cd.setUint16(14, 0x21, true); // mod date
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true); // extra
    cd.setUint16(32, 0, true); // comment
    cd.setUint16(34, 0, true); // disk number
    cd.setUint16(36, 0, true); // internal attrs
    cd.setUint32(38, 0, true); // external attrs
    cd.setUint32(42, offset, true); // local header offset
    const centralHeader = new Uint8Array(cd.buffer);
    central.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
    centralSize += centralHeader.length + nameBytes.length;
  }

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); // end of central directory signature
  eocd.setUint16(8, files.length, true); // entries on this disk
  eocd.setUint16(10, files.length, true); // total entries
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true); // central dir offset
  eocd.setUint16(20, 0, true); // comment length

  return new Blob([...parts, ...central, new Uint8Array(eocd.buffer)], { type: 'application/zip' });
}
