# Development Plan

Small, incremental, spec-driven steps. Each step is complete when its spec section is implemented and manually or automatically verified.

| # | Section | Deliverable | Verifiable | Status |
|---|---------|-------------|------------|--------|
| 1 | Plugin Setup | Project scaffold: `manifest.json`, `main.ts`, `tsconfig`, `package.json`, dev vault | Plugin loads in Obsidian | ✅ |
| 2 | AnkiConnect connection | `ankiClient.ts`: ping AnkiConnect, settings tab with Test Connection button, command palette entry, startup check | Settings tab shows connection test result | ✅ |
| 3 | Internal Card Model | `Card` type (`src/models.ts`) | Typecheck passes | ✅ |
| 4 | Parser | `parser.ts`: markdown → `Card[]`, supports basePath config, state machine parser, skips malformed blocks | 12 unit tests pass | ✅ |
| 5 | Serializer | `serializer.ts`: `Card` → markdown block, auto-adjusts fence count to avoid collision with backticks in content | 8 round-trip tests pass | ✅ |
| 6 | Local State Storage | `mappingStore.ts`: pure state functions (get/set/remove/findByAnkiId), immutable updates, persisted via Obsidian loadData/saveData | 12 unit tests pass | ✅ |
| 7 | Anki Client | `ankiClient.ts`: AnkiConnect create/update/delete/find/deck | Manual test against Anki | — |
| 8 | Sync Engine | `syncEngine.ts`: diff, conflict rules, CRUD decisions | Integration test (mock parser + client) | — |
| 9 | Manual trigger | Status bar button wired to sync engine | Click → sync runs | — |
| 10 | File Save + Watchers | `watchers.ts`: `vault.on("modify")`, debounce, background timer | Save file → sync runs | — |
| 11 | File Manager | `fileManager.ts`: create folders/files from deck paths | Test with vault API | — |
| 12 | Main | `main.ts`: wire everything, startup sync, settings | Full integration test | — |
```
