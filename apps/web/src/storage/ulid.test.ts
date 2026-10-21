import { mulberry32 } from '@calm/core';
import { describe, expect, it } from 'vitest';
import { ulid, ULID_PATTERN, ulidTime } from './ulid';

describe('ulid', () => {
  it('is 26 Crockford base32 characters', () => {
    for (let i = 0; i < 200; i++) {
      const id = ulid(Date.now());
      expect(id).toHaveLength(26);
      expect(id).toMatch(ULID_PATTERN);
    }
  });

  it('encodes milliseconds in the first 10 characters', () => {
    // The example from the ULID specification.
    expect(ulid(1469918176385, mulberry32(1)).slice(0, 10)).toBe('01ARYZ6S41');
    expect(ulid(0, () => 0)).toBe('0'.repeat(26));
    expect(ulid(2 ** 48 - 1, () => 0.999999).slice(0, 10)).toBe('7ZZZZZZZZZ');
    expect(ulidTime(ulid(1_760_000_123_456))).toBe(1_760_000_123_456);
  });

  it('sorts by time and is reproducible with a given random source', () => {
    const ids = [3, 1, 2].map((k) => ulid(1_760_000_000_000 + k * 1000));
    expect([...ids].sort()).toEqual([ids[1], ids[2], ids[0]]);
    expect(ulid(1_760_000_000_000, mulberry32(9))).toBe(ulid(1_760_000_000_000, mulberry32(9)));
    expect(ulid(1_760_000_000_000)).not.toBe(ulid(1_760_000_000_000));
  });

  it('refuses times it cannot encode', () => {
    expect(() => ulid(-1)).toThrow(RangeError);
    expect(() => ulid(2 ** 48)).toThrow(RangeError);
    expect(() => ulid(Number.NaN)).toThrow(RangeError);
  });
});
