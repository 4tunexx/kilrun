# Kilrun Engine plugins

Drop a folder (or install a zip) under Documents/Kilrun/Plugins. Each plugin is one folder with `plugin.json` and an entry script (usually `index.js`).

## plugin.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "engine": "0.1.1",
  "entry": "index.js",
  "permissions": ["editor", "map", "playtest", "weapons", "assets", "modes", "server"],
  "modes": [
    {
      "id": "gauntlet",
      "title": "Gauntlet",
      "base": "deathrun"
    }
  ]
}
```

`id` is the stable slug. `engine` is the minimum Kilrun Engine version. `modes[].base` must be `deathrun`, `horde`, or `competitive`.

## Permissions

Listed at install and **enforced** at runtime:

| Permission | What it unlocks |
| --- | --- |
| `editor` / `map` | Sidebar panels and `mutateDoc` |
| `playtest` | Play Test hooks and `startPlay` |
| `weapons` | `Kilrun.weapons.register` and `Kilrun.shop.registerItem` |
| `assets` | `Kilrun.assets.loadDataUrl` (plugin folder files) |
| `modes` | `Kilrun.modes.register` |
| `server` | Include JS on map upload / live catalog so public matches can run entity scripts |

Without `server`, Engine still stores modes/weapons/shop on the map, but **omits `source`** so the live VM will not run that plugin’s scripts.

## Entry script

Default-export `activate(Kilrun)`:

```js
export default function activate(Kilrun) {
  Kilrun.modes.register({ id: 'gauntlet', title: 'Gauntlet', base: 'deathrun' });
  Kilrun.editor.registerPanel({ id: 'stats', label: 'Stats', mount(el, ctx) {} });
  Kilrun.weapons.register({ id: 'plugin_pulse_bat', /* catalog weapon */ });
  Kilrun.shop.registerItem({ id: 'plugin_pulse_bat', /* shop row */ });
  Kilrun.entities.registerScript('my-plugin.pulse', {
    onTouch(hit) { hit.damage(8); },
  });
}
```

Entity scripts run in Engine Play Test and, with `server`, on Colyseus. Weapons/shop registrations are captured into the map and merged into Horde/Competitive buy menus (id-stable — authored shop rows are not wiped).

## Going live

1. Link Engine to the website with a staff Steam session.
2. Install/load the plugin (Engine upserts `/api/engine/plugins`).
3. Upload the map and set **MAIN** for that mode (`gauntlet`, not only `deathrun`).
4. Play hub shows the extra mode card. Queue stays disabled until a MAIN map exists for that mode.
5. Play Test Live joins `{mode}_practice` (for example `gauntlet_practice`).
6. XP/VP still use the base sim (Deathrun/Horde/Competitive). Match reports also send `pluginMode` for logs/results copy.

The game server prefers a **newer catalog version** over the JS snapshot baked into the map, so you can update a plugin without republishing every map. Snapshot remains the fallback.

See `desktop/plugins/kilrun-example` for a working Gauntlet mode, Map Stats panel, Pulse Bat shop item, and `kilrun-example.pulse` touch script.
