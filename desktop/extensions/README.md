# Kilrun Engine extensions

Extensions are **editor tools**. They are not gameplay actions and never run on the live match server.

Drop a folder or install a `.kext` zip under `Documents/Kilrun/Extensions`. Each extension is one folder with `extension.json` and an entry script.

```json
{
  "id": "my-align",
  "kind": "extension",
  "name": "My Align",
  "version": "1.0.0",
  "engine": "0.1.3",
  "entry": "index.js",
  "permissions": ["tools", "editor"]
}
```

```js
export default function activate(Kilrun) {
  Kilrun.tools.register({
    id: 'align-x',
    label: 'Align X',
    onActivate(ctx) {
      const ids = ctx.selectedIds();
      ctx.mutateDoc((doc) => doc);
    },
  });
}
```

See `kilrun-align-tool` for a working Align X / Flat Y / Align Z toolbar.
