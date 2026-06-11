# Development Plan

Small, incremental, spec-driven steps. Each step is complete when its spec section is implemented and manually or automatically verified.

| # | Section | Deliverable | Verifiable | Status |
|---|---------|-------------|------------|--------|
| 1 | Plugin Setup | Project scaffold: `manifest.json`, `main.ts`, `tsconfig`, `package.json`, dev vault | Plugin loads in Obsidian | ✅ |
| 2 | AnkiConnect connection | `ankiClient.ts`: ping AnkiConnect, settings tab with Test Connection button, command palette entry, startup check | Settings tab shows connection test result | ✅ |
| 3 | Internal Card Model | `Card` type (`src/models.ts`) | Typecheck passes | ✅ |
| 4 | Parser | `parser.ts`: markdown → `Card[]`, accepts `rootDeck`, derives `deckPath` from file path (`{rootDeck}::{subfolder}::{filename}`), state machine parser, skips malformed blocks | Unit tests pass | ✅ |
| 5 | Serializer | `serializer.ts`: `Card` → markdown block, auto-adjusts fence count to avoid collision with backticks in content | 8 round-trip tests pass | ✅ |
| 6 | Local State Storage | `mappingStore.ts`: pure state functions (get/set/remove/findByAnkiId), immutable updates, persisted via Obsidian loadData/saveData | 12 unit tests pass | ✅ |
| 7a | Anki Client — Create/Find | `ankiClient.ts`: `findNotes`, `notesInfo`, `createNote` | Create note in Anki, find by UUID, read fields back | ✅ |
| 7b | Anki Client — Update/Delete | `ankiClient.ts`: `updateNoteFields`, `deleteNotes` | Update front/back, delete note, confirm gone | ✅ |
| 7c | Anki Client — Decks | `ankiClient.ts`: `deckNames`, `createDeck`, `changeDeck` | List, create, and move notes between decks | ✅ |
| 8 | Sync Engine | `syncEngine.ts`: diff, conflict rules, CRUD decisions (no deck migration on rename — deck set at creation only) | Integration test (mock parser + client) | ✅ |
| 9 | Manual trigger | Status bar button wired to sync engine | Click → sync runs | ✅ |
| 10 | File Manager | `fileManager.ts`: create folders/files from deck paths | Test with vault API | ✅ |
| 11 | Settings + Root Deck | `settings.ts`: root deck name config (default: vault name), `main.ts` resolves `getEffectiveRootDeck()` | Root deck cards land in correct subdecks | ✅ |
| 12 | Main | `main.ts`: wire everything, load settings, pass `rootDeck` to parser + sync, startup sync | Full integration test | ✅ |
```
