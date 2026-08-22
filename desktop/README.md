# Kilrun Engine (Windows)

Kilrun Engine is a **standalone Windows application** built on Tauri 2 (Rust
backend + WebView2 frontend). Install the setup file and double-click
**Kilrun Engine** — there is no `npm run dev`, no browser, and no website to
start. It's the map/model editor and content-authoring tool for Kilrun;
actual live multiplayer matches are still played on the website
(`kilrun.vercel.app`) in a browser.

## What it does

- **Map Editor** — place props, mark solids/jump pads/death zones/lights,
  author Start/Finish, wire buttons to timed/toggling traps, bake stairs,
  group + rotate selections as rigid bodies, prefab stamps, Play Test with
  the exact same physics step the live game server runs.
- **Model Editor / Player Model studio** — sculpt skins, weapons, and player
  models; bind animation clips; publish to the shop.
- **Plugin SDK** — install/author `.kplugin` bundles that register weapons,
  shop items, modes, or editor panels. Plugins requesting the `server`
  permission (server-executable code) can only be published by full admins,
  not moderators — see [Security](#security) below.
- **Live publish** — "Set as MAIN" pushes a map straight to the live site
  as the active map for its mode. GLB/texture uploads go to the live site's
  storage, not embedded as data URLs.

## Install (players / map authors)

Send this file:

`desktop/dist/Kilrun Engine Setup.exe`

(or the copy on your Desktop after `npm run engine:build`)

The installer:

- Puts **Kilrun Engine** in the Start menu (folder **Kilrun**)
- Bundles the map editor, Three.js runtime, game assets, Play Test, and
  local projects
- Talks to the live Kilrun website when you Sign in / Push to live / Set as
  MAIN
- Installs WebView2 if Windows does not already have it (no extra download
  for you)

Recipients do **not** need Node, Rust, or this repo.

> **Not code-signed.** Windows SmartScreen or Defender may warn on first
> run ("Windows protected your PC") because the installer isn't signed with
> a code-signing certificate yet. Click **More info → Run anyway**. This is
> expected until a certificate is purchased and wired into the build.
>
> **No auto-update.** New versions must be manually re-downloaded and
> re-installed; there's no in-app update check yet.

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

Uninstalling the app does **not** delete this folder — your local projects
and plugins survive a reinstall/upgrade.

Cloud publish / live multiplayer still use the Kilrun website and game
server when you choose those commands. Editing and local Play Test work
offline.

## Security

- **Session token** — the live-site sign-in token is encrypted at rest with
  Windows DPAPI (`CryptProtectData`), bound to your Windows user account.
  It is never stored as plaintext on disk.
- **Content Security Policy** — the app window runs under an explicit CSP
  (script-src limited to the bundled app; no arbitrary remote script
  execution), not a disabled one.
- **Plugin permissions** — a plugin's manifest must explicitly declare
  `"permissions": ["server"]` to have its server-executable code shipped to
  the live catalog; omitting `permissions` no longer implicitly grants it.
  Publishing a `server`-permission plugin requires an **admin** account
  (moderators can publish everything else).
- **Known limitation**: the plugin runtime sandbox (Node `vm`, on the
  Colyseus game server) is a scripting boundary, not a hard security
  boundary — Node's own docs say `vm` should not be used to run untrusted
  code with security guarantees. Real containment would need process/isolate
  separation (e.g. `isolated-vm` or a dedicated worker process). Until then,
  the admin-only publish gate above is the actual mitigation: don't grant
  the `server` permission to plugins from accounts you don't fully trust.
- **Upload rate limiting** — the Engine staff upload endpoints
  (models/images/meshes/sounds) are rate-limited per staff account.
- **Not yet done**: code signing and an in-app auto-updater (see above).

## Rebuild (developers only)

```bash
npm install
npm run engine:build
```

Needs Rust + Visual Studio C++ Build Tools. Players never run these
commands. The shareable installer is copied to `desktop/dist/` and your
Desktop.

The engine version lives in **one place**: `desktop/src-tauri/Cargo.toml`'s
`version` field. `tauri.conf.json` has no `version` of its own (it falls
back to Cargo.toml automatically), the Rust code reads it via
`env!("CARGO_PKG_VERSION")`, and `stamp-exe-icon.mjs` reads it straight out
of `Cargo.toml` at build time — bump it in Cargo.toml and every other place
follows.

Other useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run engine:dev` | Run the Tauri app in dev mode against a local Next.js dev server |
| `npm run engine:ui:build` | Build just the bundled frontend (`desktop/ui`) |
| `npm run engine:icon` | Regenerate app icons from source art |

## Project layout

```
desktop/
  src-tauri/          Rust backend (Tauri commands, IPC, local file I/O)
    src/lib.rs          Project/plugin CRUD, session storage, deep links
    src/secure_store.rs DPAPI encrypt/decrypt for the session token
    capabilities/       Window remote-origin allowlist (rewritten per build
                         by build-engine.mjs from your .env)
    tauri.conf.json     App window config, CSP, NSIS installer settings
  ui/                 Bundled frontend (Vite) — the actual editor UI, built
                       from the same game/editor components as the website
  plugins/            Bundled example plugin (kilrun-example)
  scripts/            Build tooling (icon stamping, installer packaging)
  dist/               Build output — Setup.exe + a standalone .exe (gitignored)
```

## Further reading

- Root [`README.md`](../README.md) — full project overview, web hub, game
  server
- [`docs/MAP_EDITOR_AND_PHYSICS_AUDIT.md`](../docs/MAP_EDITOR_AND_PHYSICS_AUDIT.md)
- [`docs/MODEL_EDITOR_AND_SKINS.md`](../docs/MODEL_EDITOR_AND_SKINS.md)
