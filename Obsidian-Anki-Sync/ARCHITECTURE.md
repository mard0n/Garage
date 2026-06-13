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
    ├── main.ts           # Plugin entry point + sync logic
    ├── models.ts         # Card type
    ├── parser.ts         # Markdown → Card[]
    ├── serializer.ts     # Card → markdown block
    ├── mappingStore.ts   # Local JSON state (immutable pure functions)
    ├── ankiClient.ts     # AnkiConnect HTTP wrapper
    ├── fileManager.ts    # File creation from deck paths
    └── settings.ts       # Settings tab
```

## Dev Workflow
1. `npm run dev` — esbuild watch → builds `main.js` → rsync to `$TEST_VAULT`
2. Reload Obsidian (or use Hot Reload plugin)
3. `npm test` — run vitest
4. `npm run lint` / `npm run format` — biome

## Test Vault
- Path stored in `.env` as `TEST_VAULT=/path/to/vault`
- Build script copies `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/obsidian-anki-sync/`

## Sync Logic (inline in `main.ts`)

### Purpose
Sync is a single loop in `runSync()` using a three-way merge algorithm. No separate engine file or action types — all decisions and side effects live together.

### Algorithm

```
For each existing mapping (state entries):
  • No local card → deleteNotes() from Anki, removeBlock() from file, removeMapping()
  • Path changed → mark as moved
  • findNotes(uuid) fails → skip card
  • Note missing from Anki → recreate with createNote()
  • Fetch remote content via notesInfo()

  Three-way merge (local vs base vs remote, where base = stored front/back):
    • Local=Remote → noop (update path if changed)
    • Remote changed, local unchanged → pull into file (replaceBlock)
    • Local changed (regardless of remote) → push to Anki (Obsidian wins)

For each local card not yet in state:
  • findNotes(uuid) for identity recovery (avoids duplicates after state loss)
  • ensureDeck + ensureModel + createNote
  • inject ankiNoteId into file via replaceBlock
  • save mapping { ankiNoteId, path, front, back }
```

### Conflict Resolution

| Local vs Base | Remote vs Base | Action |
|---|---|---|
| Same | Same | Noop |
| Same | Different | Pull into Obsidian |
| Different | Same | Push to Anki |
| Different | Different | Obsidian wins (push to Anki) |

### Testing strategy

- Sync logic is not independently testable (no separate module) — it's tested via integration with Obsidian APIs
- Unit tests cover: parser, serializer, mappingStore, ankiClient
- Full sync correctness is verified manually in the test vault
