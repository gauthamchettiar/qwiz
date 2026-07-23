/** Extracts an 11-char YouTube video ID from a pasted URL, or returns the input if it already looks like an ID. */
export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlPattern =
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/;
  const match = trimmed.match(urlPattern);
  if (match) return match[1];

  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  return null;
}
