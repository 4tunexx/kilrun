import { describe, expect, it } from 'vitest';
import { bufferFromModelDataUrl } from '@/lib/model-asset-core';

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
});
