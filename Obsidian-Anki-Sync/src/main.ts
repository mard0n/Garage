import { Notice, Plugin } from "obsidian";
import * as ankiClient from "./ankiClient";
import { registerCardRenderer } from "./cardRenderer";
import { appendBlock, removeBlock, replaceBlock } from "./fileManager";
import { removeMapping, setMapping } from "./mappingStore";
import type { Mapping, State } from "./mappingStore";
import type { Card } from "./models";
import { parseCards } from "./parser";
import { AnkiSyncSettingTab, DEFAULT_SETTINGS, type PluginSettings } from "./settings";

type SyncCounters = {
  created: number;
  updated: number;
  moved: number;
  deleted: number;
  pulled: number;
  imported: number;
};

type RemoteCard = {
  front: string;
  back: string;
  ankiNoteId: number;
  deckName: string;
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
      console.log("Obsidian Anki Sync: Anki unreachable (start Anki + AnkiConnect)");
    }

    registerCardRenderer(this);
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
    const data = ((await this.loadData()) as Record<string, unknown> | undefined) ?? {};
    await this.saveData({ ...data, settings: this.settings });
  }

  deckToFilePath(rootDeck: string, deckName: string, branchDecks: Set<string>): string {
    if (deckName === rootDeck) return `${rootDeck}.md`;
    const relative = deckName.slice(rootDeck.length + 2);
    const path = relative.replace(/::/g, "/");
    if (branchDecks.has(deckName)) {
      const parts = path.split("/");
      const leaf = parts[parts.length - 1];
      return `${path}/${leaf}.md`;
    }
    return `${path}.md`;
  }

  private async getAllRemoteCards(rootDeck: string): Promise<{
    remoteCardsByUuid: Map<string, RemoteCard>;
    notesWithoutUuid: ankiClient.NoteInfo[];
    cardToDeck: Map<number, string>;
  }> {
    const remoteCardsByUuid = new Map<string, RemoteCard>();
    const notesWithoutUuid: ankiClient.NoteInfo[] = [];

    const allNoteIds = await ankiClient.findNotesByQuery(`deck:"${rootDeck}"`);
    if (allNoteIds.length === 0)
      return { remoteCardsByUuid, notesWithoutUuid, cardToDeck: new Map() };

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
      const front = info.fields?.Front?.value;
      const back = info.fields?.Back?.value;
      if (!front || !back) continue;

      const uuid = info.fields?.UUID?.value?.trim();
      const deckName =
        info.cards.length > 0 ? (cardToDeck.get(info.cards[0]) ?? rootDeck) : rootDeck;

      if (uuid) {
        remoteCardsByUuid.set(uuid, {
          front,
          back,
          ankiNoteId: info.noteId,
          deckName,
        });
      } else {
        notesWithoutUuid.push(info);
      }
    }

    return { remoteCardsByUuid, notesWithoutUuid, cardToDeck };
  }

  private async getAllCardsInVault(rootDeck: string): Promise<{
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

      // base ← loadState()
      const data = (await this.loadData()) as Record<string, unknown> | undefined;
      let newState: State = (data?.state as State) ?? {};

      const counters: SyncCounters = {
        created: 0,
        updated: 0,
        moved: 0,
        deleted: 0,
        pulled: 0,
        imported: 0,
      };

      // Build set of branch decks (decks that have sub-decks)
      const branchDecks = new Set<string>();
      try {
        const allDeckNames = await ankiClient.deckNames();
        for (const deck of allDeckNames) {
          const prefix = `${deck}::`;
          if (allDeckNames.some((d) => d !== deck && d.startsWith(prefix))) {
            branchDecks.add(deck);
          }
        }
      } catch {
        // Anki unreachable — skip branch detection, use flat mapping
      }

      // remoteCards ← anki.getAllCards()
      const { remoteCardsByUuid, notesWithoutUuid, cardToDeck } =
        await this.getAllRemoteCards(rootDeck);

      // localCards ← parseAllMarkdownFiles()
      const { allCards, localCardsByUuid } = await this.getAllCardsInVault(rootDeck);

      //
      // Step 1: Import cards that are in Anki but not tracked anywhere
      //

      // 1a: Cards with a UUID
      for (const [uuid, remote] of remoteCardsByUuid) {
        if (newState[uuid] || localCardsByUuid.has(uuid)) continue;

        const filePath = this.deckToFilePath(rootDeck, remote.deckName, branchDecks);
        const importedCard: Card = {
          uuid,
          ankiNoteId: remote.ankiNoteId,
          front: remote.front,
          back: remote.back,
          filePath,
          deckPath: remote.deckName,
          updatedAt: Date.now(),
        };
        await appendBlock(vault, filePath, importedCard);
        newState = setMapping(newState, uuid, {
          ankiNoteId: remote.ankiNoteId,
          path: filePath,
          front: remote.front,
          back: remote.back,
        });
        counters.imported++;
      }

      // 1b: Cards without a UUID — assign one, convert model, import
      for (const info of notesWithoutUuid) {
        const front = info.fields?.Front?.value;
        const back = info.fields?.Back?.value;
        if (!front || !back) continue;

        const newUuid = crypto.randomUUID();
        const deckName =
          info.cards.length > 0 ? (cardToDeck.get(info.cards[0]) ?? rootDeck) : rootDeck;

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

        const filePath = this.deckToFilePath(rootDeck, deckName, branchDecks);
        const importedCard: Card = {
          uuid: newUuid,
          ankiNoteId: info.noteId,
          front,
          back,
          filePath,
          deckPath: deckName,
          updatedAt: Date.now(),
        };
        await appendBlock(vault, filePath, importedCard);
        newState = setMapping(newState, newUuid, {
          ankiNoteId: info.noteId,
          path: filePath,
          front,
          back,
        });
        counters.imported++;
      }

      //
      // Step 2: Reconcile every card we know about
      //
      for (const [uuid, mapping] of Object.entries(newState)) {
        const local = localCardsByUuid.get(uuid);
        const remote = remoteCardsByUuid.get(uuid);

        // Deleted in Obsidian → delete from Anki
        if (!local) {
          await ankiClient.deleteNotes([mapping.ankiNoteId]).catch(() => {});
          await removeBlock(vault, mapping.path, uuid).catch(() => {});
          newState = removeMapping(newState, uuid);
          counters.deleted++;
          continue;
        }

        // Deleted in Anki → recreate unconditionally
        if (!remote) {
          try {
            await ankiClient.ensureDeck(local.deckPath);
            await ankiClient.ensureModel();
            const newId = await ankiClient.createNote({
              deckName: local.deckPath,
              front: local.front,
              back: local.back,
              uuid,
            });
            counters.updated++;
            await replaceBlock(vault, local.filePath, uuid, {
              ...local,
              ankiNoteId: newId,
            });
            newState = setMapping(newState, uuid, {
              ankiNoteId: newId,
              path: local.filePath,
              front: local.front,
              back: local.back,
            });
          } catch (err) {
            console.error(`Failed to recreate note ${uuid}:`, err);
          }
          continue;
        }

        const localContentChanged = local.front !== mapping.front || local.back !== mapping.back;
        const localPathChanged = local.filePath !== mapping.path;
        const localChanged = localContentChanged || localPathChanged;

        const remoteContentChanged = remote.front !== mapping.front || remote.back !== mapping.back;
        const remoteFilePath = this.deckToFilePath(rootDeck, remote.deckName, branchDecks);
        const remotePathChanged = remoteFilePath !== mapping.path;
        const remoteChanged = remoteContentChanged || remotePathChanged;

        // Both unchanged — nothing to do
        if (!localChanged && !remoteChanged) {
          continue;
        }

        // Push: Obsidian changed, Anki unchanged
        if (localChanged && !remoteChanged) {
          if (localContentChanged) {
            try {
              await ankiClient.updateNoteFields({
                noteId: mapping.ankiNoteId,
                front: local.front,
                back: local.back,
              });
              counters.updated++;
            } catch {
              try {
                await ankiClient.ensureDeck(local.deckPath);
                await ankiClient.ensureModel();
                const newId = await ankiClient.createNote({
                  deckName: local.deckPath,
                  front: local.front,
                  back: local.back,
                  uuid,
                });
                counters.updated++;
                await replaceBlock(vault, local.filePath, uuid, {
                  ...local,
                  ankiNoteId: newId,
                });
                newState = setMapping(newState, uuid, {
                  ankiNoteId: newId,
                  path: local.filePath,
                  front: local.front,
                  back: local.back,
                });
              } catch (err) {
                console.error(`Failed to recreate note ${uuid}:`, err);
                continue;
              }
              continue;
            }
          }

          if (localPathChanged) {
            await ankiClient.ensureDeck(local.deckPath).catch(() => {});
            await ankiClient.changeDeck([mapping.ankiNoteId], local.deckPath).catch(() => {});
            counters.moved++;
          }

          newState = setMapping(newState, uuid, {
            ...mapping,
            path: local.filePath,
            front: local.front,
            back: local.back,
          });
          continue;
        }

        // Pull: Anki changed, Obsidian unchanged
        if (!localChanged && remoteChanged) {
          const pulledCard: Card = {
            ...local,
            front: remote.front,
            back: remote.back,
          };

          if (remotePathChanged) {
            try {
              await appendBlock(vault, remoteFilePath, pulledCard);
              await removeBlock(vault, local.filePath, uuid);
              counters.moved++;
            } catch (err) {
              console.error(`Failed to move block for pull ${uuid}:`, err);
              continue;
            }
          } else {
            try {
              await replaceBlock(vault, local.filePath, uuid, pulledCard);
            } catch (err) {
              console.error(`Failed to pull block ${uuid}:`, err);
              continue;
            }
          }

          if (remoteContentChanged) counters.pulled++;
          newState = setMapping(newState, uuid, {
            ...mapping,
            path: remoteFilePath,
            front: remote.front,
            back: remote.back,
          });
          continue;
        }

        // Push-wins: both changed, Obsidian overwrites Anki
        if (localChanged && remoteChanged) {
          if (localContentChanged) {
            try {
              await ankiClient.updateNoteFields({
                noteId: mapping.ankiNoteId,
                front: local.front,
                back: local.back,
              });
              counters.updated++;
            } catch {
              try {
                await ankiClient.ensureDeck(local.deckPath);
                await ankiClient.ensureModel();
                const newId = await ankiClient.createNote({
                  deckName: local.deckPath,
                  front: local.front,
                  back: local.back,
                  uuid,
                });
                counters.updated++;
                await replaceBlock(vault, local.filePath, uuid, {
                  ...local,
                  ankiNoteId: newId,
                });
                newState = setMapping(newState, uuid, {
                  ankiNoteId: newId,
                  path: local.filePath,
                  front: local.front,
                  back: local.back,
                });
              } catch (err) {
                console.error(`Failed to recreate note ${uuid}:`, err);
                continue;
              }
              continue;
            }
          }

          if (localPathChanged) {
            await ankiClient.ensureDeck(local.deckPath).catch(() => {});
            await ankiClient.changeDeck([mapping.ankiNoteId], local.deckPath).catch(() => {});
            counters.moved++;
          }

          newState = setMapping(newState, uuid, {
            ...mapping,
            path: local.filePath,
            front: local.front,
            back: local.back,
          });
        }
      }

      //
      // Step 3: Create cards that exist locally but have no base mapping yet
      //
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
          console.error(`Failed to write ankiNoteId to block ${card.uuid}:`, err);
        });
        counters.created++;
      }

      // Notify
      const parts: string[] = [];
      if (counters.imported) parts.push(`${counters.imported} imported`);
      if (counters.created) parts.push(`${counters.created} created`);
      if (counters.updated) parts.push(`${counters.updated} updated`);
      if (counters.moved) parts.push(`${counters.moved} moved`);
      if (counters.deleted) parts.push(`${counters.deleted} deleted`);
      if (counters.pulled) parts.push(`${counters.pulled} pulled`);
      new Notice(parts.length > 0 ? `Sync: ${parts.join(", ")}` : "Sync: nothing to do");

      // Cleanup empty decks
      await this.cleanupEmptyDecks(rootDeck);

      // Save state
      await this.saveData({ settings: this.settings, state: newState });
    } finally {
      this.statusBarItem.setText("\u{1F504} Sync with Anki");
    }
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
}
