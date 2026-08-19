# Kilrun Engine (Windows)

Kilrun Engine is a **standalone Windows application**. Install the setup file and
double-click **Kilrun Engine** — there is no `npm run dev`, no browser, and no
website to start.

## Share / install

Send this file:

`desktop/dist/Kilrun Engine Setup.exe`

(or the copy on your Desktop after `npm run engine:build`)

The installer:

- Puts **Kilrun Engine** in the Start menu (folder **Kilrun**)
- Bundles the map editor, Three.js runtime, game assets, Play Test, and local projects
- Talks to the live Kilrun website when you Sign in / Push to live / Set as MAIN
- Installs WebView2 if Windows does not already have it (no extra download for you)

Recipients do **not** need Node, Rust, or this repo.

Maps, prefabs, plugins, and exports live on disk:

```
Documents/Kilrun/
  Projects/<map-id>/map.json
  Assets/
  Prefabs/
  Plugins/
  Cache/
  Exports/
```

Cloud publish / live multiplayer still use the Kilrun website and game server
when you choose those commands. Editing and local Play Test work offline.

## Rebuild (developers only)

```bash
npm install
npm run engine:build
```

Needs Rust + Visual Studio C++ Build Tools. Players never run these commands.
The shareable installer is copied to `desktop/dist/` and your Desktop.
