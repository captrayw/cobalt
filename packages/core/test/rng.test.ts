import { describe, expect, it } from 'vitest';
import { fnv1a32, mulberry32, newSeed, parseSeed } from '../src/index.ts';

describe('randomness', () => {
  it('mulberry32 matches the canonical signed-integer formulation', () => {
    // The widely published form, kept verbatim apart from types.
    function canonical(a: number) {
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    for (const seed of [0, 1, 42, 0x7fffffff, 0x80000000, 0xffffffff]) {
      const ours = mulberry32(seed),
        theirs = canonical(seed);
      for (let i = 0; i < 1000; i++) expect(ours()).toBe(theirs());
    }
  });

  it('mulberry32 is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(42),
      b = mulberry32(42);
    for (let i = 0; i < 10_000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('FNV-1a hashes UTF-16 code units to 32 bits', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('parses typed seeds: digits modulo 2^32, other text trimmed and hashed', () => {
    expect(parseSeed('123')).toBe(123);
    expect(parseSeed(' 123 ')).toBe(123);
    expect(parseSeed('4294967296')).toBe(0);
    expect(parseSeed('4294967297')).toBe(1);
    expect(parseSeed('18446744073709551621')).toBe(5);
    expect(parseSeed('  ocean ')).toBe(fnv1a32('ocean'));
    expect(parseSeed('12a')).toBe(fnv1a32('12a'));
  });

  it('new seeds are 32-bit unsigned integers', () => {
    for (let i = 0; i < 100; i++) {
      const s = newSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(4294967296);
    }
  });
});
