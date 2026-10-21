/** A source of uniform floats in [0, 1). */
export type Rng = () => number;

// Typed locally so the core needs no DOM or Node library types. Browsers and Node both provide it.
declare const crypto: { getRandomValues<T extends Uint32Array>(array: T): T };

const TWO_32 = 4294967296;

/** mulberry32, seeded with a 32-bit unsigned integer. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / TWO_32;
  };
}

/** 32-bit FNV-1a over UTF-16 code units. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A typed seed: digits only are used modulo 2^32; any other text is trimmed and hashed. */
export function parseSeed(text: string): number {
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) return Number(BigInt(trimmed) % BigInt(TWO_32));
  return fnv1a32(trimmed);
}

/** A fresh random seed from the platform's cryptographic source. */
export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
}
