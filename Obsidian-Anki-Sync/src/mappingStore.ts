import { CardState, SyncState } from "./types"
import { DataAdapter } from "obsidian"

export class MappingStore {
  private state: SyncState
  private adapter: DataAdapter
  private statePath: string

  constructor(adapter: DataAdapter, pluginDir: string) {
    this.adapter = adapter
    this.statePath = `${pluginDir}/state.json`
    this.state = {
      version: 1,
      lastSync: 0,
      cards: {},
    }
  }

  async load(): Promise<void> {
    try {
      const exists = await this.adapter.exists(this.statePath)
      if (!exists) return

      const data = await this.adapter.read(this.statePath)
      this.state = JSON.parse(data)
    } catch (e) {
      console.warn("Failed to load sync state, starting fresh:", e)
      this.state = { version: 1, lastSync: 0, cards: {} }
    }
  }

  async save(): Promise<void> {
    try {
      const dir = this.statePath.substring(0, this.statePath.lastIndexOf("/"))
      const dirExists = await this.adapter.exists(dir)
      if (!dirExists) {
        await this.adapter.mkdir(dir)
      }
      await this.adapter.write(this.statePath, JSON.stringify(this.state, null, 2))
    } catch (e) {
      console.error("Failed to save sync state:", e)
    }
  }

  getCard(uuid: string): CardState | undefined {
    return this.state.cards[uuid]
  }

  getByAnkiNoteId(ankiNoteId: number): { uuid: string; card: CardState } | undefined {
    for (const [uuid, card] of Object.entries(this.state.cards)) {
      if (card.ankiNoteId === ankiNoteId) {
        return { uuid, card }
      }
    }
    return undefined
  }

  getCardsByFile(filePath: string): Record<string, CardState> {
    const result: Record<string, CardState> = {}
    for (const [uuid, card] of Object.entries(this.state.cards)) {
      if (card.filePath === filePath) {
        result[uuid] = card
      }
    }
    return result
  }

  updateCard(uuid: string, data: CardState): void {
    this.state.cards[uuid] = data
  }

  removeCard(uuid: string): void {
    delete this.state.cards[uuid]
  }

  removeCardsByFile(filePath: string): string[] {
    const removed: string[] = []
    for (const [uuid, card] of Object.entries(this.state.cards)) {
      if (card.filePath === filePath) {
        delete this.state.cards[uuid]
        removed.push(uuid)
      }
    }
    return removed
  }

  get lastSync(): number {
    return this.state.lastSync
  }

  set lastSync(value: number) {
    this.state.lastSync = value
  }

  allCards(): Record<string, CardState> {
    return { ...this.state.cards }
  }

  allUuids(): string[] {
    return Object.keys(this.state.cards)
  }

  isEmpty(): boolean {
    return Object.keys(this.state.cards).length === 0
  }

  count(): number {
    return Object.keys(this.state.cards).length
  }
}
