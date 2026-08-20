/** Kilrun Engine example plugin. Default-export activate(Kilrun). */
export default function activate(Kilrun) {
  Kilrun.modes.register({
    id: 'gauntlet',
    title: 'Gauntlet',
    shortTitle: 'Gauntlet',
    description:
      'Deathrun variant shipped by the example plugin. Same course tools, with Pulse hazards on the live server.',
    players: 'Up to 8',
    editorBlurb: 'Same as Deathrun. Put kilrun-example.pulse on a hazard for extra touch damage.',
    base: 'deathrun',
  });

  Kilrun.editor.registerPanel({
    id: 'map-stats',
    label: 'Map Stats',
    order: 175,
    mount(el, ctx) {
      const paint = () => {
        const doc = ctx.getDoc();
        const entities = doc?.entities || [];
        const byKind = {};
        for (const ent of entities) {
          const kind = ent.kind || 'unknown';
          byKind[kind] = (byKind[kind] || 0) + 1;
        }
        const rows = Object.keys(byKind)
          .sort()
          .map((kind) => `<div style="display:flex;justify-content:space-between;gap:8px"><span>${kind}</span><b>${byKind[kind]}</b></div>`)
          .join('');
        el.innerHTML = `
          <div style="padding:4px 2px;color:#e2e8f0;font:12px/1.45 'Space Grotesk',sans-serif">
            <p style="margin:0 0 8px;letter-spacing:.28em;text-transform:uppercase;color:#fca5a5;font-size:10px">Map Stats</p>
            <p style="margin:0 0 10px;color:#94a3b8">${entities.length} entit${entities.length === 1 ? 'y' : 'ies'} on this map.</p>
            <div style="display:grid;gap:4px">${rows || '<span style="color:#64748b">Empty map</span>'}</div>
            <p style="margin:14px 0 0;color:#64748b;font-size:11px">NEW FILE includes <b>Gauntlet</b>. Play Test / live: hazards with plugin script <code>kilrun-example.pulse</code> deal extra damage on touch.</p>
          </div>`;
      };
      paint();
      const id = setInterval(paint, 700);
      return () => clearInterval(id);
    },
  });

  Kilrun.weapons.register({
    id: 'plugin_pulse_bat',
    label: 'Pulse Bat (plugin)',
    modelUrl: '/game/weapons/baseball_bat_001.glb',
    kind: 'melee',
    combat: { kind: 'melee', damage: 42, range: 2.4, cooldownMs: 480 },
    modes: ['horde', 'competitive'],
    gripHint: 'Example plugin weapon',
    sortOrder: 80,
  });

  Kilrun.shop.registerItem({
    id: 'plugin_pulse_bat',
    label: 'Pulse Bat (plugin)',
    description: 'Example plugin melee — buy in Horde / Competitive',
    kind: 'melee',
    damage: 42,
    range: 2.4,
    cooldownMs: 480,
    coneRadians: 0.5,
    shopPrice: 120,
    modelUrl: '/game/weapons/baseball_bat_001.glb',
    catalogId: 'plugin_pulse_bat',
    enabled: true,
    modes: ['horde', 'competitive'],
    sortOrder: 80,
  });

  Kilrun.entities.registerScript('kilrun-example.pulse', {
    onTouch(hit) {
      hit.damage(8);
    },
  });
}
