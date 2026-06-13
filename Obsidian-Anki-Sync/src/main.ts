import { Notice, Plugin, type Vault } from "obsidian";
import * as ankiClient from "./ankiClient";
import { appendBlock, removeBlock, replaceBlock } from "./fileManager";
import { findByAnkiId, removeMapping, setMapping } from "./mappingStore";
import type { Mapping, State } from "./mappingStore";
import type { Card } from "./models";
import { parseCards } from "./parser";
import {
  AnkiSyncSettingTab,
  DEFAULT_SETTINGS,
  type PluginSettings,
} from "./settings";

type SyncAction = "none" | "push" | "pull" | "push-wins";

type SyncCounters = {
  created: number;
  updated: number;
  moved: number;
  deleted: number;
  pulled: number;
  imported: number;
};

export default class ObsidianAnkiSyncPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  statusBarItem!: HTMLElement;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new AnkiSyncSettingTab(this.app, this));

    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.setText("\u{1F504} Sync with Anki");
    this.statusBarItem.addClass("mod-clickable");

    this.registerDomEvent(this.statusBarItem, "click", async () => {
      await this.runSync();
    });

    this.addCommand({
      id: "run-sync",
      name: "Run Anki Sync",
      callback: async () => {
        await this.runSync();
      },
    });

    const ok = await ankiClient.ping();
    if (ok) {
      console.log("Obsidian Anki Sync: Anki connected");
    } else {
      console.log(
        "Obsidian Anki Sync: Anki unreachable (start Anki + AnkiConnect)",
      );
    }
  }

  getEffectiveRootDeck(): string {
    return this.settings.rootDeck.trim() || this.app.vault.getName();
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Record<string, unknown> | undefined;
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      data?.settings as Partial<PluginSettings> | undefined,
    );
  }

  async saveSettings(): Promise<void> {
    const data =
      ((await this.loadData()) as Record<string, unknown> | undefined) ?? {};
    await this.saveData({ ...data, settings: this.settings });
  }

  deckToFilePath(rootDeck: string, deckName: string): string {
    if (deckName === rootDeck) return `${rootDeck}.md`;
    const relative = deckName.slice(rootDeck.length + 2);
    return `${relative.replace(/::/g, "/")}.md`;
  }

  private determineSyncAction(
    localChanged: boolean,
    ankiChanged: boolean,
  ): SyncAction {
    if (!localChanged && !ankiChanged) return "none";
    if (localChanged && !ankiChanged) return "push";
    if (!localChanged && ankiChanged) return "pull";
    return "push-wins";
  }

  private async pushCardToAnki(
    uuid: string,
    mapping: Mapping,
    localCard: Card,
    vault: Vault,
    rootDeck: string,
    newState: State,
    counters: SyncCounters,
  ): Promise<State> {
    const contentChanged =
      localCard.front !== mapping.front || localCard.back !== mapping.back;
    const pathChanged = localCard.filePath !== mapping.path;

    if (contentChanged) {
      try {
        await ankiClient.updateNoteFields({
          noteId: mapping.ankiNoteId,
          front: localCard.front,
          back: localCard.back,
        });
      } catch {
        try {
          await ankiClient.ensureDeck(localCard.deckPath);
          await ankiClient.ensureModel();
          const newId = await ankiClient.createNote({
            deckName: localCard.deckPath,
            front: localCard.front,
            back: localCard.back,
            uuid,
          });
          await replaceBlock(vault, localCard.filePath, uuid, {
            ...localCard,
            ankiNoteId: newId,
          });
          counters.updated++;
          if (pathChanged) counters.moved++;
          return setMapping(newState, uuid, {
            ankiNoteId: newId,
            path: localCard.filePath,
            front: localCard.front,
            back: localCard.back,
          });
        } catch (err) {
          console.error(`Failed to recreate note ${uuid}:`, err);
          return newState;
        }
      }
    }

    if (pathChanged) {
      await ankiClient.ensureDeck(localCard.deckPath).catch(() => {
        console.warn(`Failed to ensure deck for ${uuid}`);
      });
      await ankiClient
        .changeDeck([mapping.ankiNoteId], localCard.deckPath)
        .catch(() => {
          console.warn(`Failed to change deck for ${uuid}`);
        });
    }

    if (contentChanged) counters.updated++;
    if (pathChanged) counters.moved++;
    return setMapping(newState, uuid, {
      ...mapping,
      path: localCard.filePath,
      front: localCard.front,
      back: localCard.back,
    });
  }

  private async reconcileExistingCard(
    uuid: string,
    mapping: Mapping,
    localCardsByUuid: Map<string, Card>,
    vault: Vault,
    rootDeck: string,
    newState: State,
    counters: SyncCounters,
  ): Promise<State> {
    const localCard = localCardsByUuid.get(uuid);

    if (!localCard) {
      // Deleted from Obsidian → delete from Anki too
      await ankiClient.deleteNotes([mapping.ankiNoteId]).catch(() => {});
      await removeBlock(vault, mapping.path, uuid).catch(() => {});
      counters.deleted++;
      return removeMapping(newState, uuid);
    }

    const pathChanged = localCard.filePath !== mapping.path;
    const contentChanged =
      localCard.front !== mapping.front || localCard.back !== mapping.back;
    const localChanged = pathChanged || contentChanged;

    let noteIds: number[];
    try {
      noteIds = await ankiClient.findNotes(uuid);
    } catch {
      return newState;
    }

    if (noteIds.length > 1) {
      console.warn(
        `Multiple notes found for UUID ${uuid} (${noteIds.length}); using first`,
      );
    }

    if (noteIds.length === 0) {
      // Note deleted from Anki → recreate unconditionally
      try {
        await ankiClient.ensureDeck(localCard.deckPath);
        await ankiClient.ensureModel();
        const newId = await ankiClient.createNote({
          deckName: localCard.deckPath,
          front: localCard.front,
          back: localCard.back,
          uuid,
        });
        counters.updated++;
        if (pathChanged) counters.moved++;
        return setMapping(newState, uuid, {
          ankiNoteId: newId,
          path: localCard.filePath,
          front: localCard.front,
          back: localCard.back,
        });
      } catch (err) {
        console.error(`Failed to recreate note ${uuid}:`, err);
        return newState;
      }
    }

    let remoteFront: string | undefined;
    let remoteBack: string | undefined;
    try {
      const [info] = await ankiClient.notesInfo(noteIds);
      remoteFront = info?.fields?.Front?.value;
      remoteBack = info?.fields?.Back?.value;
    } catch {
      return newState;
    }
    if (remoteFront === undefined || remoteBack === undefined) return newState;

    const ankiChanged =
      remoteFront !== mapping.front || remoteBack !== mapping.back;
    const action = this.determineSyncAction(localChanged, ankiChanged);

    switch (action) {
      case "none":
        return newState;

      case "push":
      case "push-wins":
        return await this.pushCardToAnki(
          uuid,
          mapping,
          localCard,
          vault,
          rootDeck,
          newState,
          counters,
        );

      case "pull": {
        const pulledCard: Card = {
          ...localCard,
          front: remoteFront,
          back: remoteBack,
        };
        try {
          await replaceBlock(vault, localCard.filePath, uuid, pulledCard);
        } catch (err) {
          console.error(`Failed to pull block ${uuid}:`, err);
          return newState;
        }
        counters.pulled++;
        return setMapping(newState, uuid, {
          ...mapping,
          path: localCard.filePath,
          front: remoteFront,
          back: remoteBack,
        });
      }
    }
  }

  private async createNewCards(
    allCards: Card[],
    newState: State,
    vault: Vault,
    rootDeck: string,
    counters: SyncCounters,
  ): Promise<State> {
    for (const card of allCards) {
      if (!card.uuid || newState[card.uuid]) continue;

      let ankiNoteId: number;
      try {
        const existing = await ankiClient.findNotes(card.uuid);
        if (existing.length > 0) {
          ankiNoteId = existing[0];
        } else {
          await ankiClient.ensureDeck(card.deckPath);
          await ankiClient.ensureModel();
          ankiNoteId = await ankiClient.createNote({
            deckName: card.deckPath,
            front: card.front,
            back: card.back,
            uuid: card.uuid,
          });
        }
      } catch (err) {
        console.error(`Failed to create note ${card.uuid}:`, err);
        continue;
      }

      newState = setMapping(newState, card.uuid, {
        ankiNoteId,
        path: card.filePath,
        front: card.front,
        back: card.back,
      });

      await replaceBlock(vault, card.filePath, card.uuid, {
        ...card,
        ankiNoteId,
      }).catch((err: unknown) => {
        console.error(
          `Failed to write ankiNoteId to block ${card.uuid}:`,
          err,
        );
      });
      counters.created++;
    }
    return newState;
  }

  private async importUntrackedCards(
    newState: State,
    vault: Vault,
    rootDeck: string,
    counters: SyncCounters,
  ): Promise<State> {
    try {
      const allNoteIds = await ankiClient.findNotesByQuery(
        `deck:"${rootDeck}"`,
      );
      const allInfos = await ankiClient.notesInfo(allNoteIds);

      const cardToDeck = new Map<number, string>();
      try {
        const allCardIds = await ankiClient.findCards(`deck:"${rootDeck}"`);
        const decksMap = await ankiClient.getDecks(allCardIds);
        for (const [deckName, cardIds] of Object.entries(decksMap)) {
          for (const cid of cardIds) {
            cardToDeck.set(cid, deckName);
          }
        }
      } catch (err) {
        console.error("Failed to build deck map:", err);
      }

      for (const info of allInfos) {
        const uuid = info.fields?.UUID?.value?.trim();
        const front = info.fields?.Front?.value;
        const back = info.fields?.Back?.value;
        if (!front || !back) continue;
        if (uuid && newState?.[uuid]) continue;
        if (newState && findByAnkiId(newState, info.noteId)) continue;

        const newUuid = uuid || crypto.randomUUID();
        const ankiNoteId = info.noteId;

        if (!uuid) {
          try {
            await ankiClient.ensureModel();
            await ankiClient.updateNoteModel({
              noteId: info.noteId,
              modelName: "Basic-Obsidian",
              front,
              back,
              uuid: newUuid,
            });
          } catch (err) {
            console.error(`Failed to convert note ${info.noteId}:`, err);
            continue;
          }
        }

        const deckName =
          info.cards.length > 0
            ? (cardToDeck.get(info.cards[0]) ?? rootDeck)
            : rootDeck;
        const filePath = this.deckToFilePath(rootDeck, deckName);

        const untitledCard: Card = {
          uuid: newUuid,
          ankiNoteId,
          front,
          back,
          filePath,
          deckPath: deckName,
          updatedAt: Date.now(),
        };
        try {
          await appendBlock(vault, filePath, untitledCard);
        } catch (err) {
          console.error(`Failed to create file ${filePath}:`, err);
          continue;
        }

        newState = setMapping(newState, newUuid, {
          ankiNoteId,
          path: filePath,
          front,
          back,
        });
        counters.imported++;
      }
    } catch (err) {
      console.error("Import failed:", err);
    }
    return newState;
  }

  private async cleanupEmptyDecks(rootDeck: string): Promise<void> {
    try {
      const allDecks = await ankiClient.deckNames();
      const prefix = `${rootDeck}::`;
      const emptyDecks: string[] = [];
      for (const deck of allDecks) {
        if (deck === rootDeck || !deck.startsWith(prefix)) continue;
        const cards = await ankiClient.findCards(`deck:"${deck}"`);
        if (cards.length === 0) emptyDecks.push(deck);
      }
      if (emptyDecks.length > 0) {
        await ankiClient.deleteDecks(emptyDecks);
      }
    } catch {
      // Skip cleanup if Anki unreachable
    }
  }

  private async scanVaultCards(rootDeck: string): Promise<{
    allCards: Card[];
    localCardsByUuid: Map<string, Card>;
  }> {
    const vault = this.app.vault;
    const allCards: Card[] = [];
    for (const file of vault.getMarkdownFiles()) {
      const content = await vault.read(file);
      const cards = parseCards(content, file.path, rootDeck);
      for (const card of cards) {
        card.updatedAt = file.stat.mtime;
      }
      allCards.push(...cards);
    }

    const localCardsByUuid = new Map<string, Card>();
    for (const card of allCards) {
      if (card.uuid) localCardsByUuid.set(card.uuid, card);
    }
    return { allCards, localCardsByUuid };
  }

  async runSync(): Promise<void> {
    this.statusBarItem.setText("\u{1F504} Syncing...");
    try {
      const rootDeck = this.getEffectiveRootDeck();
      const vault = this.app.vault;

      const data = (await this.loadData()) as
        | Record<string, unknown>
        | undefined;
      const state = data?.state as State | undefined;
      let newState: State = state ?? {};

      const counters: SyncCounters = {
        created: 0,
        updated: 0,
        moved: 0,
        deleted: 0,
        pulled: 0,
        imported: 0,
      };

      // Pass 0: import untracked Anki cards into Obsidian
      newState = await this.importUntrackedCards(
        newState,
        vault,
        rootDeck,
        counters,
      );

      // Scan vault
      const { allCards, localCardsByUuid } = await this.scanVaultCards(rootDeck);

      // Pass 1: reconcile cards already tracked in state
      for (const [uuid, mapping] of Object.entries(newState)) {
        newState = await this.reconcileExistingCard(
          uuid,
          mapping,
          localCardsByUuid,
          vault,
          rootDeck,
          newState,
          counters,
        );
      }

      // Pass 2: create cards not yet in state
      newState = await this.createNewCards(
        allCards,
        newState,
        vault,
        rootDeck,
        counters,
      );

      // Notify
      const parts: string[] = [];
      if (counters.imported) parts.push(`${counters.imported} imported`);
      if (counters.created) parts.push(`${counters.created} created`);
      if (counters.updated) parts.push(`${counters.updated} updated`);
      if (counters.moved) parts.push(`${counters.moved} moved`);
      if (counters.deleted) parts.push(`${counters.deleted} deleted`);
      if (counters.pulled) parts.push(`${counters.pulled} pulled`);
      new Notice(
        parts.length > 0
          ? `Sync: ${parts.join(", ")}`
          : "Sync: nothing to do",
      );

      await this.cleanupEmptyDecks(rootDeck);

      await this.saveData({ settings: this.settings, state: newState });
    } finally {
      this.statusBarItem.setText("\u{1F504} Sync with Anki");
    }
  }
}
