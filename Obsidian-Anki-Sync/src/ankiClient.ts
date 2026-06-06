import { requestUrl } from "obsidian"
import { AnkiConnectResponse, AnkiNote, PluginSettings } from "./types"

export class AnkiClient {
  private settings: PluginSettings

  constructor(settings: PluginSettings) {
    this.settings = settings
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings
  }

  private async invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await requestUrl({
      url: this.settings.ankiConnectUrl,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        version: 6,
        params,
      }),
    })

    const data = response.json as AnkiConnectResponse<T>

    if (data.error) {
      throw new Error(`AnkiConnect error: ${data.error}`)
    }

    return data.result as T
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.invoke<number>("version")
      return result > 0
    } catch (e) {
      console.error("AnkiConnect connection test failed:", e)
      return false
    }
  }

  async version(): Promise<number> {
    return this.invoke<number>("version")
  }

  async deckNames(): Promise<string[]> {
    return this.invoke<string[]>("deckNames")
  }

  async createDeck(deck: string): Promise<void> {
    await this.invoke<number>("createDeck", { deck })
  }

  async ensureNoteType(): Promise<void> {
    const modelNames = await this.invoke<string[]>("modelNames")

    if (modelNames.includes("Basic-Obsidian")) {
      return
    }

    await this.invoke<number>("createModel", {
      modelName: "Basic-Obsidian",
      inOrderFields: ["Front", "Back", "UUID"],
      css: ".card { font-family: system-ui, sans-serif; }",
      isCloze: false,
      cardTemplates: [
        {
          Name: "Card 1",
          Front: "{{Front}}",
          Back: "{{Front}}<hr id=answer>{{Back}}",
        },
      ],
    })
  }

  async addNote(
    deckName: string,
    front: string,
    back: string,
    uuid: string
  ): Promise<number> {
    return this.invoke<number>("addNote", {
      note: {
        deckName,
        modelName: "Basic-Obsidian",
        fields: {
          Front: front,
          Back: back,
          UUID: uuid,
        },
        options: {
          allowDuplicate: false,
        },
        tags: [],
      },
    })
  }

  async updateNoteFields(noteId: number, front: string, back: string): Promise<void> {
    await this.invoke<void>("updateNoteFields", {
      note: {
        id: noteId,
        fields: {
          Front: front,
          Back: back,
        },
      },
    })
  }

  async updateNoteUuid(noteId: number, uuid: string): Promise<void> {
    await this.invoke<void>("updateNoteFields", {
      note: {
        id: noteId,
        fields: {
          UUID: uuid,
        },
      },
    })
  }

  async deleteNotes(noteIds: number[]): Promise<void> {
    if (noteIds.length === 0) return
    await this.invoke<void>("deleteNotes", { notes: noteIds })
  }

  async changeDeck(noteIds: number[], deck: string): Promise<void> {
    if (noteIds.length === 0) return
    await this.invoke<void>("changeDeck", { cards: noteIds, deck })
  }

  async findNotes(query: string): Promise<number[]> {
    return this.invoke<number[]>("findNotes", { query })
  }

  async notesInfo(noteIds: number[]): Promise<AnkiNote[]> {
    if (noteIds.length === 0) return []

    const batchSize = 100
    const results: AnkiNote[] = []

    for (let i = 0; i < noteIds.length; i += batchSize) {
      const batch = noteIds.slice(i, i + batchSize)
      const batchResult = await this.invoke<AnkiNote[]>("notesInfo", { notes: batch })
      results.push(...batchResult)
    }

    return results
  }

  async findAndImportNotes(ignoreDecks: string[]): Promise<AnkiNote[]> {
    const deckNames = await this.deckNames()
    const activeDeckNames = deckNames.filter(
      (d) => d && !ignoreDecks.some((ignored) => ignored && (d === ignored || d.startsWith(`${ignored}::`)))
    )

    if (activeDeckNames.length === 0) return []

    // Process most specific decks first so deepest deck name wins
    const sortedDecks = [...activeDeckNames].sort((a, b) => b.length - a.length)

    const noteDeckMap = new Map<number, string>()
    const allNoteIds: number[] = []
    for (const deck of sortedDecks) {
      const query = `deck:"${deck.replace(/"/g, '\\"')}"`
      const ids = await this.findNotes(query)
      for (const id of ids) {
        if (!noteDeckMap.has(id)) {
          noteDeckMap.set(id, deck)
          allNoteIds.push(id)
        }
      }
    }

    if (allNoteIds.length === 0) return []

    const notes = await this.notesInfo(allNoteIds)
    for (const note of notes) {
      const deck = noteDeckMap.get(note.noteId)
      if (deck) {
        ;(note as any).deckName = deck
      }
    }

    return notes
  }
}
