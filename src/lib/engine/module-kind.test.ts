import { describe, expect, it } from 'vitest';
import {
  inferKindFromManifestName,
  kindAllowsServer,
  parseModuleKind,
} from './module-kind';

describe('module kinds', () => {
  it('defaults unknown kind to plugin', () => {
    expect(parseModuleKind(undefined)).toBe('plugin');
    expect(parseModuleKind('theme')).toBe('plugin');
    expect(parseModuleKind('extension')).toBe('extension');
    expect(parseModuleKind('addon')).toBe('addon');
  });

  it('infers kind from the manifest file name', () => {
    expect(inferKindFromManifestName('extension.json')).toBe('extension');
    expect(inferKindFromManifestName('pack/addon.json')).toBe('addon');
    expect(inferKindFromManifestName('plugin.json')).toBe('plugin');
    expect(inferKindFromManifestName('readme.md')).toBe(null);
  });

  it('only plugins may ship live-server source', () => {
    expect(kindAllowsServer('plugin')).toBe(true);
    expect(kindAllowsServer('extension')).toBe(false);
    expect(kindAllowsServer('addon')).toBe(false);
  });
});
