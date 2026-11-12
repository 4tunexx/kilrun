import { describe, expect, it } from 'vitest';
import { buildPluginSandboxDocument, clampPluginDamage, isPluginSandboxEnvelope } from './plugin-sandbox';

describe('plugin-sandbox host guards', () => {
  it('clamps playtest damage to 0–250', () => {
    expect(clampPluginDamage(12)).toBe(12);
    expect(clampPluginDamage(-4)).toBe(0);
    expect(clampPluginDamage(999)).toBe(250);
    expect(clampPluginDamage('nope')).toBe(0);
  });

  describe('plugin sandbox document', () => {
    it('loads the bootstrap and plugin as scripts without inline execution or eval', () => {
      const doc = buildPluginSandboxDocument('test', 'export default function activate(Kilrun) {}');
      expect(doc).toContain("script-src data:");
      expect(doc).not.toContain('unsafe-eval');
      const url = doc.match(/<script src="([^"]+)"><\/script>/)?.[1];
      expect(url).toBeDefined();
      const bootstrap = decodeURIComponent(url!.split(',')[1]);
      expect(bootstrap).not.toContain('new Function');
      const pluginUrl = JSON.parse(bootstrap.match(/script\.src = (".*");/)![1]) as string;
      const plugin = decodeURIComponent(pluginUrl.split(',')[1]);
      expect(plugin).toContain('function activate(Kilrun)');
      expect(plugin).toContain("type: 'ready'");
    });

    it('keeps script-breaking plugin content out of the HTML', () => {
      const doc = buildPluginSandboxDocument('id</script>', 'const value = "</script><script>bad()</script>";');
      expect(doc.match(/<script\b/g)).toHaveLength(1);
    });
  });

  it('accepts only kilrun-plugin envelopes', () => {
    expect(isPluginSandboxEnvelope({ ns: 'kilrun-plugin', pluginId: 'p1', type: 'toast' })).toBe(
      true
    );
    expect(isPluginSandboxEnvelope({ ns: 'other', pluginId: 'p1' })).toBe(false);
    expect(isPluginSandboxEnvelope({ ns: 'kilrun-plugin' })).toBe(false);
    expect(isPluginSandboxEnvelope(null)).toBe(false);
  });
});
