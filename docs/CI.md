# CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main`.

| Job | Runs | Blocking |
|-----|------|----------|
| `web` | `npm ci`, `prisma generate`, `typecheck`, `lint`, `test`, `test:setup` | yes |
| `game-server` | server `typecheck`, `lint:server`, `build` | yes |
| `audit` | `npm audit --omit=dev --audit-level=high` (root + server) | no (until Phase 3) |

Reproduce locally:

```bash
npm ci && npx prisma generate      # needs DATABASE_URL set to any mongodb:// URL
npm run typecheck && npm run lint && npm test && npm run test:setup
npm run lint:server
(cd server && npm ci && npm run typecheck && npm run build)
```

`lint:server` uses `server/.eslintrc.json`. The root `next lint` intentionally skips `server/`.
The isolated setup tests do not connect to MongoDB or validate a real hosted deployment.
