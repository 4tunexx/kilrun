# Kilrun Engine addons (Engine Packs)

Addons upgrade the **Engine client** — themes, home cards, content extras — without rebuilding `Kilrun Engine Setup.exe`.

Drop a folder or install a `.kaddon` zip under `Documents/Kilrun/Addons`.

```json
{
  "id": "studio-pack",
  "kind": "addon",
  "name": "Studio Pack",
  "version": "1.0.0",
  "engine": "0.1.3",
  "entry": "index.js",
  "permissions": ["theme", "content"]
}
```

Theme CSS variables must start with `--kilrun-`. Official addons published by an admin are pulled onto every Engine client on launch.
