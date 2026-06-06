import { Notice } from "obsidian"
import { AnkiClient } from "./ankiClient"
import { FileManager } from "./fileManager"
import { MappingStore } from "./mappingStore"
import { parseCards } from "./parser"
import { serializeCard } from "./serializer"
import {
  AnkiNote,
  Card,
  PluginSettings,
  SyncStatus,
  filePathToDeckPath,
  deckPathToFilePath,
} from "./types"

export class SyncEngine {
  private ankiClient: AnkiClient
  private fileManager: FileManager
  private mappingStore: MappingStore
  private settings: PluginSettings
  private onStatusChange: (status: SyncStatus, message?: string) => void

  constructor(
    ankiClient: AnkiClient,
    fileManager: FileManager,
    mappingStore: MappingStore,
    settings: PluginSettings,
    onStatusChange: (status: SyncStatus, message?: string) => void
  ) {
    this.ankiClient = ankiClient
    this.fileManager = fileManager
    this.mappingStore = mappingStore
    this.settings = settings
    this.onStatusChange = onStatusChange
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings
  }

  private get rootDeck(): string {
    return this.settings.vaultRootDeck
  }

  private isDeckIgnored(deckPath: string | undefined): boolean {
    if (!deckPath) return false
    return this.settings.ignoreDecks.some(
      (ignored) => ignored && (deckPath === ignored || deckPath.startsWith(`${ignored}::`))
    )
  }

  async runFullSync(): Promise<void> {
    this.onStatusChange("syncing", "Starting full sync...")

    try {
      const connected = await this.ankiClient.testConnection()
      if (!connected) {
        this.onStatusChange("error", "Cannot connect to AnkiConnect")
        new Notice("Obsidian Anki Sync: Cannot connect to Anki. Is Anki running with AnkiConnect?")
        return
      }

      await this.ankiClient.ensureNoteType()

      this.onStatusChange("syncing", "Scanning vault...")
      const vaultCards = await this.scanVault()

      this.onStatusChange("syncing", "Syncing to Anki...")
      await this.syncVaultToAnki(vaultCards)

      this.onStatusChange("syncing", "Syncing from Anki...")
      await this.syncAnkiToVault(vaultCards)

      this.mappingStore.lastSync = Date.now()
      await this.mappingStore.save()

      this.onStatusChange("success", `Sync complete. ${this.mappingStore.count()} cards tracked.`)
      new Notice(`Obsidian Anki Sync: Sync complete (${this.mappingStore.count()} cards)`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error("Full sync failed:", e)
      this.onStatusChange("error", `Sync failed: ${message}`)
      new Notice(`Obsidian Anki Sync: Sync failed — ${message}`)
    }
  }

  async syncFile(filePath: string): Promise<void> {
    this.onStatusChange("syncing", `Syncing ${filePath}...`)

    try {
      const vaultCards = await this.fileManager.readCardsFromFile(filePath, this.rootDeck)

      for (const card of vaultCards) {
        await this.syncCardToAnki(card)
      }

      const stateCards = this.mappingStore.getCardsByFile(filePath)
      for (const uuid of Object.keys(stateCards)) {
        const stillExists = vaultCards.some((c) => c.uuid === uuid)
        if (!stillExists) {
          const stateCard = stateCards[uuid]
          await this.ankiClient.deleteNotes([stateCard.ankiNoteId])
          this.mappingStore.removeCard(uuid)
        }
      }

      await this.mappingStore.save()
      this.onStatusChange("success")
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error(`Sync failed for ${filePath}:`, e)
      this.onStatusChange("error", `Sync failed: ${message}`)
    }
  }

  async handleFileDelete(filePath: string): Promise<void> {
    const stateCards = this.mappingStore.getCardsByFile(filePath)
    const noteIds: number[] = []

    for (const uuid of Object.keys(stateCards)) {
      noteIds.push(stateCards[uuid].ankiNoteId)
      this.mappingStore.removeCard(uuid)
    }

    if (noteIds.length > 0) {
      try {
        await this.ankiClient.deleteNotes(noteIds)
      } catch (e) {
        console.error("Failed to delete notes for deleted file:", e)
      }
      await this.mappingStore.save()
    }
  }

  async handleFileRename(oldPath: string, newPath: string): Promise<void> {
    const stateCards = this.mappingStore.getCardsByFile(oldPath)
    const newDeckPath = filePathToDeckPath(newPath, this.rootDeck)
    const noteIds: number[] = []

    for (const uuid of Object.keys(stateCards)) {
      noteIds.push(stateCards[uuid].ankiNoteId)
      this.mappingStore.updateCard(uuid, {
        ...stateCards[uuid],
        filePath: newPath,
        updatedAt: Date.now(),
      })
    }

    if (noteIds.length > 0) {
      try {
        await this.ankiClient.createDeck(newDeckPath)
        await this.ankiClient.changeDeck(noteIds, newDeckPath)
      } catch (e) {
        console.error("Failed to move notes to new deck:", e)
      }
      await this.mappingStore.save()
    }
  }

  private async scanVault(): Promise<Card[]> {
    const paths = await this.fileManager.getAnkiCardFiles(this.rootDeck)
    const allCards: Card[] = []

    for (const path of paths) {
      const cards = await this.fileManager.readCardsFromFile(path, this.rootDeck)
      allCards.push(...cards)
    }

    return allCards
  }

  private async syncVaultToAnki(vaultCards: Card[]): Promise<void> {
    for (const card of vaultCards) {
      await this.syncCardToAnki(card)
    }

    const stateUuids = this.mappingStore.allUuids()
    for (const uuid of stateUuids) {
      const inVault = vaultCards.some((c) => c.uuid === uuid)
      if (!inVault) {
        const stateCard = this.mappingStore.getCard(uuid)
        if (stateCard) {
          await this.ankiClient.deleteNotes([stateCard.ankiNoteId])
          this.mappingStore.removeCard(uuid)
        }
      }
    }
  }

  private async syncCardToAnki(card: Card): Promise<void> {
    const isNewCard = !card.uuid

    if (isNewCard) {
      card.uuid = this.generateUuid()
    }

    if (card.ankiNoteId === undefined) {
      if (this.isDeckIgnored(card.deckPath)) {
        return
      }

      try {
        await this.ankiClient.createDeck(card.deckPath)
        const noteId = await this.ankiClient.addNote(
          card.deckPath,
          card.front,
          card.back,
          card.uuid
        )

        card.ankiNoteId = noteId
        this.mappingStore.updateCard(card.uuid, {
          ankiNoteId: noteId,
          filePath: card.filePath,
          updatedAt: card.updatedAt,
        })

        const newBlock = serializeCard(card)
        if (isNewCard) {
          await this.fileManager.replaceNewCardBlock(card.filePath, card.uuid, newBlock)
        } else {
          await this.fileManager.replaceCardBlock(card.filePath, card.uuid, newBlock)
        }
      } catch (e) {
        console.error(`Failed to create Anki note for card ${card.uuid}:`, e)
      }
    } else {
      const stateCard = this.mappingStore.getCard(card.uuid)
      if (stateCard && card.updatedAt > stateCard.updatedAt) {
        try {
          await this.ankiClient.updateNoteFields(card.ankiNoteId, card.front, card.back)

          this.mappingStore.updateCard(card.uuid, {
            ankiNoteId: card.ankiNoteId,
            filePath: card.filePath,
            updatedAt: card.updatedAt,
          })
        } catch (e) {
          console.warn(`Failed to update Anki note ${card.ankiNoteId} (may be deleted), attempting to re-create:`, e)
          await this.recreateAnkiNote(card)
        }
      } else if (!stateCard) {
        if (card.ankiNoteId !== undefined) {
          try {
            await this.ankiClient.notesInfo([card.ankiNoteId])
          } catch {
            console.warn(`Anki note ${card.ankiNoteId} missing for vault card ${card.uuid}, re-creating`)
            await this.recreateAnkiNote(card)
            return
          }
        }
        this.mappingStore.updateCard(card.uuid, {
          ankiNoteId: card.ankiNoteId,
          filePath: card.filePath,
          updatedAt: card.updatedAt,
        })
      }
    }
  }

  private async syncAnkiToVault(vaultCards: Card[]): Promise<void> {
    let ankiNotes
    try {
      ankiNotes = await this.ankiClient.findAndImportNotes(this.settings.ignoreDecks)
    } catch (e) {
      console.error("Failed to fetch Anki notes:", e)
      return
    }

    let successCount = 0
    let errorCount = 0
    for (const ankiNote of ankiNotes) {
      if (!ankiNote || !ankiNote.noteId) continue
      try {
        await this.syncAnkiNoteToVault(ankiNote, vaultCards)
        successCount++
      } catch (e) {
        errorCount++
        const message = e instanceof Error ? e.message : String(e)
        console.error(
          `Failed to sync Anki note ${ankiNote.noteId} (deck: ${ankiNote.deckName ?? "unknown"}):`,
          message
        )
      }
    }

    if (errorCount > 0) {
      console.warn(`Anki -> Obsidian: ${successCount} succeeded, ${errorCount} failed`)
    }
  }

  private async syncAnkiNoteToVault(
    ankiNote: AnkiNote,
    vaultCards: Card[]
  ): Promise<void> {
    if (!ankiNote.fields || !ankiNote.deckName) return
    if (this.isDeckIgnored(ankiNote.deckName)) return

    if (!ankiNote.fields["Front"] && !ankiNote.fields["Back"]) return

    const frontField = ankiNote.fields["Front"]
    const backField = ankiNote.fields["Back"]
    const hasUuidField = "UUID" in ankiNote.fields
    let noteId = ankiNote.noteId
    let uuid = ""

    if (!hasUuidField) {
      uuid = this.generateUuid()
      try {
        const newNoteId = await this.ankiClient.addNote(
          ankiNote.deckName,
          frontField?.value || "",
          backField?.value || "",
          uuid
        )
        await this.ankiClient.deleteNotes([ankiNote.noteId])
        noteId = newNoteId
      } catch (e) {
        console.error(`Failed to convert Basic note ${ankiNote.noteId} to Basic-Obsidian:`, e)
        return
      }
    } else {
      const uuidField = ankiNote.fields["UUID"]
      uuid = uuidField?.value?.trim() || ""
      if (!uuid) {
        uuid = this.generateUuid()
        try {
          await this.ankiClient.updateNoteUuid(ankiNote.noteId, uuid)
        } catch (e) {
          console.error(`Failed to update UUID for note ${ankiNote.noteId}:`, e)
          return
        }
      }
    }

    const stateCard = this.mappingStore.getCard(uuid)
    const vaultCard = vaultCards.find((c) => c.uuid === uuid)

    if (stateCard && vaultCard) {
      const ankiModTime = ankiNote.mod * 1000
      if (ankiModTime > stateCard.updatedAt && vaultCard.updatedAt <= stateCard.updatedAt) {
        await this.updateObsidianFromAnki(vaultCard, ankiNote)
      }
    } else if (!stateCard && vaultCard) {
      this.mappingStore.updateCard(uuid, {
        ankiNoteId: noteId,
        filePath: vaultCard.filePath,
        updatedAt: Date.now(),
      })
    } else if (stateCard && !vaultCard) {
      const filePath = stateCard.filePath
      const card: Card = {
        uuid,
        ankiNoteId: noteId,
        front: frontField?.value || "",
        back: backField?.value || "",
        filePath,
        deckPath: filePathToDeckPath(filePath, this.rootDeck),
        updatedAt: Date.now(),
      }
      const block = serializeCard(card)
      await this.fileManager.addCardBlock(filePath, block)
      this.mappingStore.updateCard(uuid, {
        ankiNoteId: noteId,
        filePath,
        updatedAt: Date.now(),
      })
    } else {
      const filePath = deckPathToFilePath(ankiNote.deckName, this.rootDeck)
      if (!filePath) return
      const card: Card = {
        uuid,
        ankiNoteId: noteId,
        front: frontField?.value || "",
        back: backField?.value || "",
        filePath,
        deckPath: ankiNote.deckName,
        updatedAt: Date.now(),
      }
      const block = serializeCard(card)
      await this.fileManager.addCardBlock(filePath, block)
      this.mappingStore.updateCard(uuid, {
        ankiNoteId: noteId,
        filePath,
        updatedAt: Date.now(),
      })
    }
  }

  private async updateObsidianFromAnki(
    card: Card,
    ankiNote: { fields: Record<string, { value: string }> }
  ): Promise<void> {
    const frontField = ankiNote.fields["Front"]
    const backField = ankiNote.fields["Back"]

    card.front = frontField?.value || ""
    card.back = backField?.value || ""
    card.updatedAt = Date.now()

    const newBlock = serializeCard(card)
    await this.fileManager.replaceCardBlock(card.filePath, card.uuid, newBlock)

    this.mappingStore.updateCard(card.uuid, {
      ankiNoteId: card.ankiNoteId!,
      filePath: card.filePath,
      updatedAt: card.updatedAt,
    })
  }

  private async recreateAnkiNote(card: Card): Promise<void> {
    try {
      await this.ankiClient.createDeck(card.deckPath)
      const newNoteId = await this.ankiClient.addNote(
        card.deckPath,
        card.front,
        card.back,
        card.uuid
      )
      card.ankiNoteId = newNoteId
      this.mappingStore.updateCard(card.uuid, {
        ankiNoteId: newNoteId,
        filePath: card.filePath,
        updatedAt: card.updatedAt,
      })
      const newBlock = serializeCard(card)
      await this.fileManager.replaceCardBlock(card.filePath, card.uuid, newBlock)
    } catch (e) {
      console.error(`Failed to re-create Anki note for card ${card.uuid}:`, e)
    }
  }

  private generateUuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
    })
  }
}
