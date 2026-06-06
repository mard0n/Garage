export interface Card {
  uuid: string
  ankiNoteId?: number
  front: string
  back: string
  filePath: string
  deckPath: string
  updatedAt: number
}

export interface CardState {
  ankiNoteId: number
  filePath: string
  updatedAt: number
}

export interface SyncState {
  version: number
  lastSync: number
  cards: Record<string, CardState>
}

export interface PluginSettings {
  ankiConnectUrl: string
  syncIntervalSec: number
  saveDebounceMs: number
  ignoreDecks: string[]
  vaultRootDeck: string
}

export const DEFAULT_SETTINGS: PluginSettings = {
  ankiConnectUrl: "http://localhost:8765",
  syncIntervalSec: 60,
  saveDebounceMs: 2000,
  ignoreDecks: [],
  vaultRootDeck: "",
}

export interface AnkiNote {
  noteId: number
  deckName?: string
  modelName: string
  fields: Record<string, { value: string; order: number }>
  mod: number
}

export interface AnkiConnectResponse<T> {
  result: T | null
  error: string | null
}

export type SyncDirection = "obsidian-to-anki" | "anki-to-obsidian" | "both"

export type SyncStatus = "idle" | "syncing" | "success" | "error"

export function filePathToDeckPath(filePath: string, rootDeck?: string): string {
  const deck = filePath.replace(/\//g, "::").replace(/\.md$/i, "")
  if (rootDeck) {
    return `${rootDeck}::${deck}`
  }
  return deck
}

export function deckPathToFilePath(deckPath: string, rootDeck?: string): string {
  let path = deckPath
  if (rootDeck) {
    const prefix = `${rootDeck}::`
    if (path.startsWith(prefix)) {
      path = path.substring(prefix.length)
    } else if (path === rootDeck) {
      path = ""
    }
  }
  if (!path) return ""
  return path.replace(/::/g, "/") + ".md"
}
