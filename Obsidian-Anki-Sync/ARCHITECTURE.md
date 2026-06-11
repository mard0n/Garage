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

## Sync Engine (Step 8)

### Purpose
The sync engine (`syncEngine.ts`) is the decision-making core. It takes parsed cards from Obsidian and the local mapping state, diffs against Anki, applies conflict rules (Obsidian wins), and executes CRUD operations.

### Algorithm — two-phase bidirectional sync

```
Phase 1 — Obsidian → Anki
  For each local card:
    • No UUID? Generate one.
    • No mapping in state? → createNote() in Anki, store mapping.
    • Card.updatedAt > mapping.lastSync? → updateNoteFields().
    • Deck path changed? → changeDeck().
  
  For each mapping in state not in local cards:
    • Card deleted from Obsidian → deleteNotes() from Anki, remove mapping.

Phase 2 — Anki → Obsidian
  For each remaining mapping:
    • UUID not found in Anki? → mark for removal from Obsidian file.
    • Anki content different from local & Obsidian didn't change → pull into Obsidian.
    • (If both changed, Obsidian already won in Phase 1.)
```

### Public API

```typescript
function sync(localCards: Card[], state: State, deps: AnkiDeps): Promise<SyncResult>
```

| Param | Source | Purpose |
|-------|--------|---------|
| `localCards` | Parser | Current Obsidian cards |
| `state` | mappingStore | Last known state |
| `deps` | ankiClient mocks | Anki operations |

### Testing strategy
Unit/integration tests with mocked anki client functions. Feed in `Card[]` + `State`, verify mock calls and returned actions.
- New card → createNote called
- Changed card → updateNoteFields called
- Deleted card → deleteNotes called
- Deck moved → changeDeck called
- Anki changed → pullFromAnki populated
- Anki deleted → uuidsDeletedFromAnki populated
- Both changed → Obsidian wins (push to Anki, no pull)
