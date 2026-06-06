# Obsidian ↔ Anki Sync Plugin

An Obsidian plugin that keeps Anki cards in two-way sync with fenced ` ```anki ` blocks in your markdown notes, via the AnkiConnect HTTP API at `localhost:8765`. Full design spec: `SPEC.md`.

## File-by-file

### Build / meta

- `package.json` — npm metadata, `dev` / `build` scripts.
- `esbuild.config.mjs` — bundles `src/main.ts` → `main.js`, externs `obsidian`/electron/codemirror.
- `tsconfig.json` — strict TS, no emit (esbuild does the bundling).
- `manifest.json` — Obsidian plugin manifest (id, version, desktop-only).
- `data.json` — saved user settings (written by `loadData`/`saveData`).
- `state.json` — plugin-private sync state (uuid → ankiNoteId/filePath/lastSync), managed by `MappingStore`.
- `main.js` — generated bundle, do not edit.
- `styles.css` — status bar colors (idle/syncing/success/error).
- `SPEC.md` — full design spec.
- `.gitignore` — standard.

### Source (`src/`)

- `main.ts` — `AnkiSyncPlugin` lifecycle. `onload` wires `AnkiClient`, `FileManager`, `MappingStore`, `SyncEngine`, `Watchers`; registers the `Sync now` command, settings tab, status bar item, and kicks off `runFullSync` once the layout is ready. `onunload` tears down watchers.
- `types.ts` — `Card`, `CardState`, `SyncState`, `PluginSettings`, `AnkiNote`, `SyncStatus`, plus the path↔deck converters `filePathToDeckPath` / `deckPathToFilePath`.
- `parser.ts` — `parseCards(content, filePath, rootDeck)`. Two-stage: `extractBlocks` finds every ` ```anki `…` ``` ` fence, then `CardParser` is a tiny line-based state machine that reads `id:` / `ankiNoteId:` metadata, then `[front]…[/front]` and `[back]…[/back]` bodies.
- `serializer.ts` — inverse of the parser: `Card` → fenced block string (rebuilds `id`, optional `ankiNoteId`, then front/back regions).
- `ankiClient.ts` — thin AnkiConnect wrapper. `invoke<T>` posts JSON-RPC to the configured URL. Methods: `testConnection`, `ensureNoteType` (creates `Basic-Obsidian` with `Front/Back/UUID` fields if missing), `createDeck`, `addNote`, `updateNoteFields`, `updateNoteUuid`, `deleteNotes`, `changeDeck`, `findNotes`, `notesInfo`, and `findAndImportNotes` (pulls every note from every non-ignored deck, longest-deck-first so the deepest deck wins).
- `fileManager.ts` — vault I/O. Reads/writes files, recursively `ensureFolders`/`ensureFile` (with retries), and surgically edits anki blocks: `replaceCardBlock` (find by uuid), `replaceNewCardBlock` (find by missing uuid), `addCardBlock` (append), `removeCardBlock`. `findCardBlocks` walks the file once to locate block byte ranges. `getAnkiCardFiles` filters markdown files that actually contain an anki block.
- `mappingStore.ts` — load/save `state.json` via the vault adapter, with CRUD over `Record<uuid, CardState>` and helpers `getCard`/`getByAnkiNoteId`/`getCardsByFile`/`allUuids`/`count`.
- `syncEngine.ts` — **the brain**, see below.
- `watchers.ts` — `vault.on("modify"|"delete"|"rename")` listeners (debounce `saveDebounceMs` on modify, 500ms settle on rename) and a `setInterval` polling Anki every `syncIntervalSec`.
- `settings.ts` — settings tab UI (AnkiConnect URL, test connection button, sync interval, debounce ms, vault root deck, ignored decks).

## Where the action is

**`src/syncEngine.ts` is the single place all sync decisions are made.** It owns four flows, all triggered by either a vault event, the 60s poll, the `Sync now` command, or startup:

1. `runFullSync` (`syncEngine.ts:52`) — entry point. Pings Anki, calls `ensureNoteType`, then `scanVault` → `syncVaultToAnki` → `syncAnkiToVault`, finally persists state.
2. `syncVaultToAnki` + `syncCardToAnki` (`syncEngine.ts:172`, `:190`) — push direction. For each parsed `Card`: if no uuid, mint one; if no `ankiNoteId`, create deck + `addNote`, then rewrite the markdown block via `fileManager.replaceNewCardBlock` so the new `id` / `ankiNoteId` get persisted. If the card already has an `ankiNoteId` and `card.updatedAt > state.updatedAt`, call `updateNoteFields`. After pushing, any uuid in `MappingStore` that wasn't seen in the vault is treated as a deletion → `deleteNotes` + `removeCard`.
3. `syncAnkiToVault` + `syncAnkiNoteToVault` (`syncEngine.ts:251`, `:266`) — pull direction. `ankiClient.findAndImportNotes` returns all non-ignored notes; for each, the engine migrates vanilla `Basic` notes to `Basic-Obsidian` (delete + recreate with a UUID), then four-way branches on `stateCard` × `vaultCard`:
   - both present, Anki newer, Obsidian stale → `updateObsidianFromAnki` rewrites the block.
   - state only (Obsidian side missing the block) → append the block back to the file.
   - vault only (file lost the block) → nothing to do (it'll be cleaned up by push-side deletion).
   - neither → import: derive file path from deck name via `deckPathToFilePath` and append the block.
4. Event hooks: `syncFile` (file-save), `handleFileDelete` (delete Anki notes for a removed file), `handleFileRename` (recompute deck path with `filePathToDeckPath`, `changeDeck` in Anki, update mapping paths).

`src/watchers.ts` is the trigger layer; `parser.ts` / `serializer.ts` are the format layer; `ankiClient.ts` is the transport; `fileManager.ts` is the disk layer; `mappingStore.ts` is the cross-system join table. Everything meaningful funnels through `SyncEngine`.
