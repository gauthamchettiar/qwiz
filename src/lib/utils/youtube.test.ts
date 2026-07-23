import { describe, expect, it } from 'vitest';
import { extractYoutubeId } from './youtube';

describe('extractYoutubeId', () => {
  it('extracts the id from a watch URL', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the id from a watch URL with extra query params', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('extracts the id from a youtu.be short link', () => {
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the id from an embed URL', () => {
    expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the id from a shorts URL', () => {
    expect(extractYoutubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('accepts a bare 11-character id', () => {
    expect(extractYoutubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(extractYoutubeId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for empty input', () => {
    expect(extractYoutubeId('')).toBeNull();
    expect(extractYoutubeId('   ')).toBeNull();
  });

  it('returns null for a URL that is not a recognized YouTube shape', () => {
    expect(extractYoutubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('returns null for text that is not id-shaped', () => {
    expect(extractYoutubeId('not a video id')).toBeNull();
    expect(extractYoutubeId('short')).toBeNull();
  });
});
