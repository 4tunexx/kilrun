import { describe, expect, it } from 'vitest';
import { bufferFromModelDataUrl, LIVE_MODEL_MAX_BYTES, persistModelBuffer } from '@/lib/model-asset-core';

describe('bufferFromModelDataUrl', () => {
  it('decodes a data URL into bytes', () => {
    const payload = Buffer.from('glTF').toString('base64');
    const { buffer, hintExt } = bufferFromModelDataUrl(`data:model/gltf-binary;base64,${payload}`);
    expect(buffer.toString()).toBe('glTF');
    expect(hintExt).toBe('glb');
  });

  it('rejects a non-data URL', () => {
    expect(() => bufferFromModelDataUrl('https://cdn.example/model.glb')).toThrow(/Invalid data URL/);
  });

  it('rejects live-site uploads over the Hobby body cap', async () => {
    expect(LIVE_MODEL_MAX_BYTES).toBe(4_000_000);
    await expect(persistModelBuffer(Buffer.alloc(LIVE_MODEL_MAX_BYTES + 1), 'big.glb')).rejects.toThrow(
      /Live site max is about 4 MB/
    );
  });
});
