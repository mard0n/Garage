# Obsidian Anki Sync

An [Obsidian](https://obsidian.md) plugin for **two-way synchronization** between Obsidian markdown notes and [Anki](https://apps.ankiweb.net/) flashcards via [AnkiConnect](https://ankiweb.net/shared/info/2055492159).

## How It Works

Write flashcards as fenced code blocks in your Obsidian notes:

````anki
id: 8b2c9d11-58f2-49a4-9cb9-53b0f73df887

[front]
What is a closure?

[/front]

[back]
A closure remembers variables from outer scope.

[/back]
````

- **`id`** (UUID) — required; stable identity for sync.
- **`ankiNoteId`** — cached Anki note ID, written automatically after first sync.

The plugin creates a custom Anki note type (`Basic-Obsidian`) with `Front`, `Back`, and `UUID` fields.

## Features

- **Bidirectional sync** — changes in Obsidian push to Anki; changes in Anki pull into Obsidian.
- **Three-way merge** — conflict resolution (Obsidian is source of truth on conflicts).
- **Vault-to-deck mapping** — vault folder hierarchy mirrors as Anki subdecks under a configurable root deck.
- **Deletion sync** — deleting a card in either system propagates to the other.
- **Auto-import** — untracked Anki notes are imported as new markdown files.
- **Live preview** — rendered card front/back in Obsidian reading mode.
- **Sync triggers** — status bar button, command palette, or automatic on startup.

## Installation

### From source (development)

```bash
git clone <repo>
cd obsidian-anki-sync
npm install
```

Create `.env` with your test vault path:
```
TEST_VAULT=/path/to/your/obsidian/test/vault
```

```bash
npm run dev      # Watch mode + rsync to test vault
npm run build    # Production build
```

### End-user install

Copy `manifest.json`, `styles.css`, and `dist/main.js` to `.obsidian/plugins/obsidian-anki-sync/` inside your vault, then enable the plugin in Obsidian settings.

## Prerequisites

- Obsidian v1.5.0+
- Anki desktop app with the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on installed (configured to allow requests from `localhost:8765`).

## Configuration

| Setting | Description | Default |
|---|---|---|
| **Root deck name** | Top-level Anki deck; folder hierarchy preserved as subdecks | Vault name |

A **Test Connection** button verifies AnkiConnect is reachable.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Watch mode: build + rsync to test vault |
| `npm run build` | Production build |
| `npm test` | Run unit tests (vitest) |
| `npm run lint` | Biome check |
| `npm run format` | Format code |

## Architecture

```
src/
├── main.ts           Plugin entry point + sync engine (three-way merge)
├── models.ts         Card type definition
├── parser.ts         Markdown → Card[] parser
├── serializer.ts     Card → markdown serializer
├── ankiClient.ts     AnkiConnect HTTP API client
├── fileManager.ts    File operations via Obsidian Vault API
├── mappingStore.ts   Local state management
├── settings.ts       Plugin settings tab
└── cardRenderer.ts   Live preview rendering
```

## Tech Stack

TypeScript, Obsidian Plugin API, esbuild, vitest, Biome.
