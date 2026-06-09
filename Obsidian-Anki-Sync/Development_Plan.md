# Development Plan

Small, incremental, spec-driven steps. Each step is complete when its spec section is implemented and manually or automatically verified.

| # | Section | Deliverable | Verifiable | Status |
|---|---------|-------------|------------|--------|
| 1 | Plugin Setup | Project scaffold: `manifest.json`, `main.ts`, `tsconfig`, `package.json`, dev vault | Plugin loads in Obsidian | ✅ |
| 2 | AnkiConnect connection | `ankiClient.ts`: ping AnkiConnect, verify reachability | Plugin logs "Anki connected" or "Anki unreachable" | — |
| 3 | Internal Card Model | `Card` type (`src/models.ts`) | Typecheck passes | — |
| 4 | Parser | `parser.ts`: markdown → `Card[]` | Unit test with sample `.md` | — |
| 5 | Serializer | `serializer.ts`: `Card` → markdown block | Round-trip parse/serialize test | — |
| 6 | Local State Storage | `mappingStore.ts`: read/write `state.json` | Store → reload → match test | — |
| 7 | Anki Client | `ankiClient.ts`: AnkiConnect create/update/delete/find/deck | Manual test against Anki | — |
| 8 | Sync Engine | `syncEngine.ts`: diff, conflict rules, CRUD decisions | Integration test (mock parser + client) | — |
| 9 | Manual trigger | Status bar button wired to sync engine | Click → sync runs | — |
| 10 | File Save + Watchers | `watchers.ts`: `vault.on("modify")`, debounce, background timer | Save file → sync runs | — |
| 11 | File Manager | `fileManager.ts`: create folders/files from deck paths | Test with vault API | — |
| 12 | Main | `main.ts`: wire everything, startup sync, settings | Full integration test | — |
```
