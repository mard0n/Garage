# Reconciliation Logic

The sync engine performs a **two-phase bidirectional three-way diff** between three data sources:

1. **Local cards** — parsed from all Obsidian markdown files at sync time (keyed by UUID)
2. **State** — the persisted mapping JSON (`data.json`, keyed by UUID)
3. **Anki remote** — queries AnkiConnect for existing notes by UUID

## Three-Way Diff (Categorize)

```
local cards (parsed from .md) → categorize() against state
  ├── toCreate  → recoverNoteId() → createNote() in Anki
  ├── toUpdate  → pushUpdate() in Anki (with fallback to create if deleted remotely)
  ├── toDelete  → deleteNotes() in Anki
  └── unchanged → checkRemote() in Phase B
                     ├── deleted in Anki → removeBlock() from .md
                     ├── changed in Anki, local unchanged → replaceBlock() in .md
                     └── changed in both / unchanged → no action
```

### `categorize()` (syncEngine.ts)

The function takes the persisted `State` (from `data.json`) and the parsed local cards:

```typescript
function categorize(
  state: State,
  localByUuid: Map<string, Card>,
): {
  toCreate: Card[];
  toUpdate: CardWithMapping[];
  toDelete: Array<{ uuid: string; mapping: Mapping }>;
  unchanged: CardWithMapping[];
}
```

| Condition | Classification | Meaning |
|---|---|---|
| UUID in local, **NOT** in state | `toCreate` | New card — never synced before |
| UUID in local **AND** state, and `card.updatedAt > mapping.lastSync` | `toUpdate` | File modified since last sync |
| UUID in local **AND** state, and `card.updatedAt <= mapping.lastSync` | `unchanged` | No local change |
| UUID **NOT** in local, **IS** in state | `toDelete` | Card block was removed from the file |

The algorithm uses set subtraction:

1. Copy all state entries into a `remaining` map
2. Walk each local card by UUID:
   - If found in `remaining`, remove it from `remaining` and classify as `toUpdate` or `unchanged` based on timestamp comparison
3. Whatever is left in `remaining` after the loop = `toDelete`

## Phase A: Push (Obsidian → Anki)

### toCreate
Before creating a new note, `recoverNoteId()` queries Anki by UUID (`findNotes(uuid)`). If the note already exists in Anki (e.g., local state was lost), the existing `ankiNoteId` is reused — no duplicate is created. If not found, `createNote()` is called with the `Basic-Obsidian` model (fields: Front, Back, UUID).

### toUpdate
Calls `pushUpdate()` which is `updateNoteFields()` via AnkiConnect. If the update fails (e.g., the note was deleted in Anki), it falls back to creating a new note in Anki and updates the mapping's `ankiNoteId`.

### toDelete
Calls `deleteNotes([mapping.ankiNoteId])` to remove the note from Anki. The mapping is simply not carried forward into `newState`.

## Phase B: Pull (Anki → Obsidian)

For each mapping in the new state that was **not** pushed in Phase A, `checkRemote()` is called:

```typescript
async function checkRemote(uuid, mapping, localCard, deps, rootDeck):
  Promise<{ pull: PullCard | null; deleted: boolean }>
```

Logic:

1. `findNotes(uuid)` → if empty, return `deleted: true`
2. `notesInfo(noteIds)` → get remote Front/Back values
3. If no local card exists (orphaned mapping), return `pull` with remote content
4. If remote differs from local **AND** `localCard.updatedAt <= mapping.lastSync` (Obsidian unchanged), return `pull` with remote content
5. Otherwise → no action

## Conflict Resolution

**Obsidian wins when both sides changed.**

| Remote changed | Local changed (`updatedAt > lastSync`) | Result |
|---|---|---|
| No | No | No action |
| No | Yes | Push to Anki |
| Yes | No | Pull from Anki into markdown |
| Yes | Yes | **Obsidian wins** — push, no pull |

## Deletion

### Deleted in Obsidian (card block removed from markdown)
1. Card block is absent from the next vault scan
2. Its UUID still exists in the persisted state
3. `categorize()` classifies it as `toDelete`
4. `sync()` calls `deleteNotes([mapping.ankiNoteId])` in Anki
5. The mapping is excluded from `newState`

### Deleted in Anki (note removed manually or by another client)
1. Phase B checks each mapping via `findNotes(uuid)`
2. Returns `deleted: true` when no note is found
3. UUID is added to `uuidsDeletedFromAnki[]`
4. `main.ts` calls `removeBlock(vault, path, uuid)` to strip the card block from the markdown file
5. Mapping is removed from `newState`

## File Moves (No Explicit Tracking)

File moves/renames are **not explicitly tracked**. When a card block moves between files:

- The UUID remains the same
- `categorize()` sees it in both local and state → not `toCreate` or `toDelete`
- If the new file's `mtime > lastSync`, it's classified as `toUpdate`
- The engine pushes the card content to Anki (Front/Back update)
- The `path` in the new state is updated to the new file path
- **The Anki deck assignment is NOT migrated** — it was set at creation time and remains fixed

## Identity Recovery

`recoverNoteId()` handles local state loss (e.g., `data.json` deleted):

1. Before creating a new note, queries Anki's `UUID` field via `findNotes(uuid)`
2. If the note exists in Anki, reuses the existing `ankiNoteId`
3. This is why the custom `Basic-Obsidian` model includes a `UUID` field — it's the anchor for cross-session identity

## Data Structures

```typescript
type Card = {
  uuid: string;           // Stable UUID, generated by plugin
  ankiNoteId?: number;    // Anki's numeric note ID
  front: string;          // Question content
  back: string;           // Answer content
  filePath: string;       // Path within vault, e.g. "Frontend/JS/Functions.md"
  deckPath: string;       // Anki deck path, e.g. "Obsidian::Frontend::JS::Functions"
  updatedAt: number;      // File mtime (ms) at scan time
};

type Mapping = {
  ankiNoteId: number;
  path: string;           // File path within vault
  lastSync: number;       // Unix ms timestamp of last sync
};

type State = Record<string, Mapping>;  // Keyed by UUID
```

## Key Files

| File | Role |
|---|---|
| `src/syncEngine.ts:69-100` | `categorize()` — three-way diff |
| `src/syncEngine.ts:200-304` | `sync()` — two-phase orchestration |
| `src/syncEngine.ts:133-137` | `recoverNoteId()` — identity recovery |
| `src/syncEngine.ts:152-196` | `checkRemote()` — Anki pull logic |
| `src/mappingStore.ts` | Immutable state operations |
| `src/main.ts:55-120` | `runSync()` — vault scan + write-back |
