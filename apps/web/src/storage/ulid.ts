/** Crockford base32, as used by ULIDs. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_TIME = 2 ** 48 - 1;

/**
 * A ULID: 10 characters of millisecond time then 16 of randomness, 26 in all, sortable by time.
 * Randomness comes from crypto.getRandomValues unless a source of floats in [0, 1) is given.
 */
export function ulid(at: number, random?: () => number): string {
  let time = Math.floor(at);
  if (!Number.isFinite(time) || time < 0 || time > MAX_TIME) throw new RangeError(`Cannot encode time ${at} in a ULID`);
  let out = '';
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[time % 32] + out;
    time = Math.floor(time / 32);
  }
  if (random) {
    for (let i = 0; i < 16; i++) out += ALPHABET[Math.min(31, Math.floor(random() * 32))];
  } else {
    // 256 is a multiple of 32, so masking each byte keeps the characters uniform.
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) out += ALPHABET[byte & 31];
  }
  return out;
}

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** The millisecond time encoded in a ULID. */
export function ulidTime(id: string): number {
  let time = 0;
  for (const ch of id.slice(0, 10)) time = time * 32 + ALPHABET.indexOf(ch);
  return time;
}
