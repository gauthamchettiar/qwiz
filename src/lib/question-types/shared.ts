import type { ContentBlock } from '../types';

export function genId(): string {
  return crypto.randomUUID();
}

export function isContentBlockFilled(block: ContentBlock): boolean {
  if (block.kind === 'text') return block.text.trim().length > 0;
  if (block.kind === 'image') return block.url.trim().length > 0;
  return block.videoId.trim().length > 0;
}
