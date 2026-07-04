# TypeScript migration

Tagvico AI's server runtime is now compiled from TypeScript. All application
modules under `services/`, `routes/`, `models/`, and `config/`, plus the server,
schema, and Swagger entry points, use `.ts` sources. CI type-checks and builds
the complete runtime before performing a compiled-server smoke test.

## Runtime and build

```bash
npm run typecheck
npm run build
npm start
```

`npm run build` writes CommonJS output to `dist/`; `npm start` and the PM2
configuration run `dist/server.js`. Static files and views remain in `public/`
and `views/` and are loaded from the project root.

The file-format migration is complete, but strict typing is still in progress.
Modules without a suppression are checked with TypeScript's `strict` mode.
Legacy modules that still need structural typing carry a clearly marked
`@ts-nocheck` directive. `npm run check:type-debt` prevents that suppression
count from increasing; each typing change should reduce it.

## JavaScript that remains

Some JavaScript is intentional and is not server TypeScript source:

- `public/js/` contains browser assets served directly to clients.
- `ecosystem.config.js` is a PM2 configuration file.
- `scripts/*.js` contains Node maintenance utilities.
- Root `test-*.js` files are standalone diagnostic scripts, not runtime modules.

The completed one-time migration workflow and converter have been removed. New
server runtime code must be strict TypeScript and is enforced by the build,
lint, and type-debt checks.
