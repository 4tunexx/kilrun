import { describe, expect, it } from 'vitest';
import { comparePluginVersions, wrapPluginSourceAsCjs } from '@shared/plugin-source';

describe('wrapPluginSourceAsCjs', () => {
  it('runs export default activate against a fake Kilrun', () => {
    const source = `
      export default function activate(Kilrun) {
        Kilrun.entities.registerScript('demo.pulse', { onTouch(hit) { hit.damage(8); } });
      }
    `;
    const scripts: Record<string, { onTouch?: (hit: { damage: (n: number) => void }) => void }> = {};
    const Kilrun = {
      entities: {
        registerScript(id: string, handlers: (typeof scripts)[string]) {
          scripts[id] = handlers;
        },
      },
    };
    const fn = new Function('Kilrun', wrapPluginSourceAsCjs(source));
    fn(Kilrun);
    let dealt = 0;
    scripts['demo.pulse'].onTouch?.({ damage: (n) => { dealt = n; } });
    expect(dealt).toBe(8);
  });
});

describe('comparePluginVersions', () => {
  it('orders semver so catalog can prefer newer source', () => {
    expect(comparePluginVersions('1.2.0', '1.1.0')).toBe(1);
    expect(comparePluginVersions('1.1.0', '1.2.0')).toBe(-1);
    expect(comparePluginVersions('1.2.0', '1.2.0')).toBe(0);
  });
});
