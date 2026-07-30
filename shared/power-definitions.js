// Turbopack-only compatibility shim — DO NOT EDIT LOGIC HERE.
//
// `shared/ability-progression.ts` imports `./power-definitions.js` (a real
// .js extension) because that same file is also compiled by the standalone
// Colyseus server build (server/tsconfig.json) under Node's native ESM
// loader, which requires literal .js extensions on relative imports.
//
// Next.js's production build (webpack) already maps that .js specifier back
// to `./power-definitions.ts` via the `resolve.extensionAlias` set in
// next.config.ts, so it never actually loads this file. `tsc` (server build)
// also resolves it back to the .ts source via `moduleResolution: "bundler"`.
//
// Turbopack (`next dev --turbopack`) does neither — it does literal
// filesystem resolution and fails with "Module not found" without a real
// file at this exact path. This file exists purely to satisfy that literal
// lookup in dev; it is excluded from both tsconfig.json `include` globs
// (which only match `**/*.ts`), so it's never type-checked or double
// compiled — it just re-exports the real implementation at runtime.
export * from './power-definitions.ts';
