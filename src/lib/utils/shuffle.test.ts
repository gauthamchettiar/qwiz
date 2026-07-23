import { describe, expect, it } from 'vitest';
import { shuffledArray } from './shuffle';

describe('shuffledArray', () => {
  it('returns a new array, never the same reference', () => {
    const input = [1, 2, 3];
    expect(shuffledArray(input)).not.toBe(input);
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    shuffledArray(input);
    expect(input).toEqual(snapshot);
  });

  it('is a permutation: same length and same multiset of elements', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = shuffledArray(input);
    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffledArray([])).toEqual([]);
    expect(shuffledArray([42])).toEqual([42]);
  });

  it('eventually produces more than one distinct ordering', () => {
    const input = Array.from({ length: 10 }, (_, i) => i);
    const orderings = new Set(Array.from({ length: 50 }, () => shuffledArray(input).join(',')));
    expect(orderings.size).toBeGreaterThan(1);
  });
});
