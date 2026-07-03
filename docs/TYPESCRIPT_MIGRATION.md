# TypeScript migration

Archivista AI's server runtime is now compiled from TypeScript. All application
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

The migration was deliberately mechanical. Previously untyped modules carry a
`// @ts-nocheck` marker so runtime behavior remains unchanged. Removing those
markers and adding strict types is follow-up hardening, not a file-format
migration requirement. Modules that were already typed retain their existing
types.

## JavaScript that remains

Some JavaScript is intentional and is not server TypeScript source:

- `public/js/` contains browser assets served directly to clients.
- `ecosystem.config.js` is a PM2 configuration file.
- `scripts/*.js` contains Node maintenance utilities.
- Root `test-*.js` files are standalone diagnostic scripts, not runtime modules.

The completed one-time migration workflow has been removed. New server runtime
code must be added as TypeScript and is enforced by the build and CI checks.
