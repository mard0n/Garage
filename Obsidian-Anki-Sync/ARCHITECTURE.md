# Architecture & Tooling Decisions

## Language
- TypeScript (strict mode)

## Build
- **esbuild** — fast bundler, recommended by Obsidian plugin docs
- Dev mode: watch + auto-copy to test vault via rsync

## Testing
- **vitest** — fast, native TS, minimal config

## Linting / Formatting
- **biome** — single tool for lint + format (replaces eslint + prettier)

## Project Structure

```
obsidian-anki-sync/
├── ARCHITECTURE.md       # This file
├── DEVELOPMENT_PLAN.md   # Incremental development steps
├── SPEC.md               # Full spec
├── manifest.json         # Obsidian plugin manifest
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── biome.json
├── .env                  # TEST_VAULT path for dev workflow
├── .gitignore
├── styles.css
└── src/
    ├── main.ts           # Plugin entry point
    ├── models.ts         # Card type (step 3)
    ├── parser.ts         # Markdown → Card[] (step 4)
    ├── serializer.ts     # Card → markdown block (step 5)
    ├── mappingStore.ts   # Local JSON state (step 6)
    ├── ankiClient.ts     # AnkiConnect HTTP wrapper (step 7)
    ├── syncEngine.ts     # Sync logic (step 8)
    ├── watchers.ts       # File listeners, timers (step 10)
    ├── fileManager.ts    # File creation from deck paths (step 11)
    └── settings.ts       # Settings tab (step 12)
```

## Dev Workflow
1. `npm run dev` — esbuild watch → builds `main.js` → rsync to `$TEST_VAULT`
2. Reload Obsidian (or use Hot Reload plugin)
3. `npm test` — run vitest
4. `npm run lint` / `npm run format` — biome

## Test Vault
- Path stored in `.env` as `TEST_VAULT=/path/to/vault`
- Build script copies `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/obsidian-anki-sync/`
