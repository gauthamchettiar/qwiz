import type { Trivia } from './types';

/** A shared link packs the whole trivia into the URL fragment, so there's no server involved.
 * Beyond this total URL length a link gets unwieldy (address bars, chat apps, and some tools
 * truncate long URLs), so past it we refuse to share by link and point the user at the JSON
 * download instead. */
export const MAX_SHARE_URL_LENGTH = 8000;

// A one-char marker prefixes the payload so we know how it was encoded: gzip (normal) or raw
// base64 (fallback when CompressionStream isn't available).
const GZIP = 'g';
const RAW = 'r';

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function gzip(str: string): Promise<Uint8Array> {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

/** Serializes + compresses a trivia into a compact, URL-safe string. */
export async function encodeTrivia(trivia: Trivia): Promise<string> {
  const json = JSON.stringify(trivia);
  if (typeof CompressionStream !== 'undefined') {
    return GZIP + bytesToB64url(await gzip(json));
  }
  return RAW + bytesToB64url(new TextEncoder().encode(json));
}

/** Reverses `encodeTrivia`. Throws if the string is malformed. */
export async function decodeTrivia(encoded: string): Promise<Trivia> {
  const marker = encoded[0];
  const bytes = b64urlToBytes(encoded.slice(1));
  const json = marker === GZIP ? await gunzip(bytes) : new TextDecoder().decode(bytes);
  return JSON.parse(json) as Trivia;
}

/** Builds a self-contained share link. Returns `{ url: null }` (with the length it would have
 * been) when the trivia is too large to fit a shareable URL. */
export async function buildShareUrl(trivia: Trivia): Promise<{ url: string | null; length: number }> {
  const encoded = await encodeTrivia(trivia);
  const url = `${window.location.origin}/shared#s=${encoded}`;
  return url.length <= MAX_SHARE_URL_LENGTH ? { url, length: url.length } : { url: null, length: url.length };
}
