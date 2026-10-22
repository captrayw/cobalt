/**
 * Draws wool textures off the main thread, so a page change never waits for one. Noise fields are
 * kept for the seeds in use, so most pages only relight the drifted surface.
 */
import { noiseField, woolPixels, type NoiseField } from './wool';

export interface WoolRequest {
  id: number;
  width: number;
  height: number;
  scale: number;
  seedA: number;
  seedB: number;
  mix: number;
}

export interface WoolResult {
  id: number;
  bitmap: ImageBitmap;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WoolRequest>) => void) | null;
  postMessage(message: WoolResult, transfer: Transferable[]): void;
};

const fields = new Map<string, NoiseField>();

function field(seed: number, width: number, height: number, scale: number): NoiseField {
  const key = `${seed} ${width}x${height}@${scale}`;
  let f = fields.get(key);
  if (!f) {
    f = noiseField(seed, width, height, scale);
    fields.set(key, f);
    // Two seeds are in use at a time, three while the drift moves on to the next.
    while (fields.size > 3) fields.delete(fields.keys().next().value as string);
  }
  return f;
}

scope.onmessage = (e) => {
  const { id, width, height, scale, seedA, seedB, mix } = e.data;
  const a = field(seedA, width, height, scale);
  // With no drift yet (a session's first page), the next seed's field is not needed.
  const b = mix > 0 ? field(seedB, width, height, scale) : a;
  const pixels = woolPixels(a, b, mix, width, height, scale);
  void createImageBitmap(new ImageData(pixels, width, height)).then((bitmap) => scope.postMessage({ id, bitmap }, [bitmap]));
};
