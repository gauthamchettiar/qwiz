/** A whole quiz, compressed and carried inside a URL fragment, so sharing one is a single link
 * instead of a file plus an import step.
 *
 * The fragment (`/play#q=…`) rather than a query string is load-bearing: a fragment is never sent
 * to the server, so a shared quiz stays as private as a locally-stored one and isn't subject to any
 * request-line length limit. Compression is the platform's own `CompressionStream('deflate-raw')`
 * rather than a library — a `.qwiz` document is highly repetitive text, deflate typically takes it
 * to a fifth of its size, and no dependency is worth adding for that. The cost is that encoding and
 * decoding are async, and that this needs Safari 16.4+ / Firefox 113+ / Chrome 103+.
 */

/** Fragment payload format: `<version>.<base64url>`. The version digit exists so a future change
 * to the compression or the document format can be rejected with a real message instead of
 * decoding into garbage. */
export const SHARE_PAYLOAD_VERSION = '1';

/** Past this many characters a link still works, but chat clients, mail gateways and link
 * previewers start wrapping or truncating it. The share dialog warns and hands it over anyway. */
export const SHARE_URL_WARN_LENGTH = 8000;

/** Past this, a link is refused outright rather than shared as something that probably won't
 * survive being pasted: browsers stop accepting URLs reliably around 32k characters, so anything
 * longer isn't a link that has been made awkward, it's one that doesn't work. A quiz only reaches
 * this by embedding base64 image data — the share dialog says so and points at Download .qwiz,
 * which has no size limit at all. */
export const SHARE_URL_MAX_LENGTH = 32000;

/** How shareable a built URL actually is. Separated from the dialog so the thresholds are one
 * pure, tested decision rather than two comparisons written inline in markup. */
export type ShareUrlVerdict = 'ok' | 'long' | 'too-long';

export function shareUrlVerdict(url: string): ShareUrlVerdict {
  if (url.length > SHARE_URL_MAX_LENGTH) return 'too-long';
  if (url.length > SHARE_URL_WARN_LENGTH) return 'long';
  return 'ok';
}

/** base64url (RFC 4648 §5): standard base64 with `+/` swapped for `-_` and the padding dropped,
 * so the result survives being a URL fragment untouched — plain base64's `+` and `/` are legal in
 * a fragment but get mangled by enough link handlers to be worth avoiding, and `=` is worse.
 *
 * Split out from the compression above it, and synchronous, specifically so the alphabet
 * translation is testable on its own — it's the part with an off-by-one to get wrong. */
export function toBase64Url(bytes: Uint8Array): string {
  // Chunked rather than `String.fromCharCode(...bytes)`: spreading a few hundred thousand
  // arguments overflows the call stack, and an image-bearing quiz gets there easily.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Inverse of `toBase64Url`. Throws on anything that isn't valid base64url — callers treat that as
 * "the link was damaged in transit", which is by far the likeliest way it happens. */
export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipeThrough(bytes: Uint8Array, transform: TransformStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A `.qwiz` document as a fragment payload. */
export async function encodeSharePayload(source: string): Promise<string> {
  const compressed = await pipeThrough(
    new TextEncoder().encode(source),
    new CompressionStream('deflate-raw')
  );
  return `${SHARE_PAYLOAD_VERSION}.${toBase64Url(compressed)}`;
}

/** The inverse, returning `{ result, error }` rather than throwing, in the same spirit as the
 * `.qwiz` parser: a link arriving damaged is an expected outcome, not a programmer error. The three
 * failures get distinct messages because they call for different things from the reader — a
 * truncated link means "copy it again", a version mismatch means "this link is from another
 * Qwiz". */
export async function decodeSharePayload(
  payload: string
): Promise<{ source?: string; error?: string }> {
  const separator = payload.indexOf('.');
  const version = separator === -1 ? '' : payload.slice(0, separator);
  if (version !== SHARE_PAYLOAD_VERSION) {
    return { error: "This link isn't in a format this version of Qwiz can read." };
  }

  let compressed: Uint8Array;
  try {
    compressed = fromBase64Url(payload.slice(separator + 1));
  } catch {
    return { error: 'This link looks damaged — try copying the whole thing again.' };
  }

  try {
    const bytes = await pipeThrough(compressed, new DecompressionStream('deflate-raw'));
    return { source: new TextDecoder().decode(bytes) };
  } catch {
    return { error: "This link looks cut short — the quiz data in it isn't complete." };
  }
}

export function buildShareUrl(origin: string, payload: string): string {
  return `${origin}/play#q=${payload}`;
}

/** Pulls the payload back out of a `location.hash`. Returns null for a bare `/play` with no
 * fragment, or a fragment that isn't ours — both of which the page reports as "this link has no
 * quiz in it" rather than as a decode failure. */
export function readSharePayload(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const payload = params.get('q');
  return payload ? payload : null;
}
