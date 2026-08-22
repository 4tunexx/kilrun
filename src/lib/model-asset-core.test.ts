import { describe, expect, it } from 'vitest';
import {
  bufferFromModelDataUrl,
  LIVE_MODEL_MAX_BYTES,
  looksLikeValidModelFile,
  persistModelBuffer,
} from '@/lib/model-asset-core';

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

describe('persistModelBuffer content validation', () => {
  // Type used to be inferred purely from the filename extension / data-URL
  // header, so any arbitrary binary could be uploaded and stored/served as
  // a `.glb` — these prove real content is now checked before persisting.

  it('rejects a .glb upload that is not actually GLB binary', async () => {
    await expect(
      persistModelBuffer(Buffer.from('this is definitely not a model file'), 'fake.glb')
    ).rejects.toThrow(/does not look like a valid/i);
  });

  it('rejects a .gltf upload that is not valid JSON with an asset field', async () => {
    await expect(
      persistModelBuffer(Buffer.from('not json at all'), 'fake.gltf')
    ).rejects.toThrow(/does not look like a valid/i);
    await expect(
      persistModelBuffer(Buffer.from(JSON.stringify({ notAsset: true })), 'fake2.gltf')
    ).rejects.toThrow(/does not look like a valid/i);
  });

  it('rejects an .obj upload with no recognizable OBJ tokens', async () => {
    await expect(
      persistModelBuffer(Buffer.from('random garbage\nmore garbage'), 'fake.obj')
    ).rejects.toThrow(/does not look like a valid/i);
  });
});

describe('looksLikeValidModelFile (pure, no I/O)', () => {
  it('accepts a buffer with a real GLB magic header', () => {
    // Minimal 12-byte GLB header: magic "glTF" + version(1) + length.
    const header = Buffer.alloc(12);
    header.write('glTF', 0, 'ascii');
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12, 8);
    expect(looksLikeValidModelFile(header, 'glb')).toBe(true);
  });

  it('rejects a short or non-magic buffer as glb', () => {
    expect(looksLikeValidModelFile(Buffer.from('short'), 'glb')).toBe(false);
    expect(looksLikeValidModelFile(Buffer.alloc(20), 'glb')).toBe(false);
  });

  it('accepts a well-formed minimal glTF JSON document', () => {
    const gltf = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scenes: [] }));
    expect(looksLikeValidModelFile(gltf, 'gltf')).toBe(true);
  });

  it('rejects gltf JSON missing the required asset field', () => {
    expect(looksLikeValidModelFile(Buffer.from(JSON.stringify({ scenes: [] })), 'gltf')).toBe(false);
  });

  it('accepts a minimal valid OBJ file', () => {
    const obj = 'o Cube\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
    expect(looksLikeValidModelFile(Buffer.from(obj), 'obj')).toBe(true);
  });

  it('accepts a binary FBX magic header', () => {
    const fbx = Buffer.concat([Buffer.from('Kaydara FBX Binary  \0', 'ascii'), Buffer.alloc(10)]);
    expect(looksLikeValidModelFile(fbx, 'fbx')).toBe(true);
  });

  it('accepts an ASCII FBX file by its header comment', () => {
    const fbx = Buffer.from('; FBX 7.3.0 project file\n; ---------------------\n');
    expect(looksLikeValidModelFile(fbx, 'fbx')).toBe(true);
  });

  it('rejects an unknown extension outright', () => {
    expect(looksLikeValidModelFile(Buffer.from('anything'), 'exe')).toBe(false);
  });
});
