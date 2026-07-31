import { describe, expect, it } from 'vitest';
import { sanitizeNumericInput } from './numericInput';

describe('sanitizeNumericInput', () => {
  it('passes through what is already a number', () => {
    expect(sanitizeNumericInput('12')).toBe('12');
    expect(sanitizeNumericInput('-3')).toBe('-3');
    expect(sanitizeNumericInput('0.5')).toBe('0.5');
    expect(sanitizeNumericInput('-0.25')).toBe('-0.25');
  });

  // The states a number passes through on its way to being typed have to survive, or the
  // corresponding numbers can't be entered at all.
  it('keeps a lone "-" and a trailing "." so negatives and decimals stay typeable', () => {
    expect(sanitizeNumericInput('-')).toBe('-');
    expect(sanitizeNumericInput('1.')).toBe('1.');
    expect(sanitizeNumericInput('-.')).toBe('-.');
  });

  it('drops letters and symbols rather than rejecting the whole edit', () => {
    expect(sanitizeNumericInput('12 pts')).toBe('12');
    expect(sanitizeNumericInput('abc')).toBe('');
    expect(sanitizeNumericInput('1e5')).toBe('15');
    expect(sanitizeNumericInput('$-4.50!')).toBe('-4.50');
  });

  it('allows a minus only in the leading position', () => {
    expect(sanitizeNumericInput('1-2')).toBe('12');
    expect(sanitizeNumericInput('--5')).toBe('-5');
  });

  it('allows at most one decimal point', () => {
    expect(sanitizeNumericInput('1.2.3')).toBe('1.23');
    expect(sanitizeNumericInput('..')).toBe('.');
  });

  it('leaves an empty field empty — blank means "no explicit weight", not zero', () => {
    expect(sanitizeNumericInput('')).toBe('');
  });
});
