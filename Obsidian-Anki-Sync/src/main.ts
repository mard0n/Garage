import { Notice, Plugin, TFile } from "obsidian";
import * as ankiClient from "./ankiClient";
import { appendBlock, removeBlock, replaceBlock } from "./fileManager";
import { removeMapping, setMapping } from "./mappingStore";
import type { State } from "./mappingStore";
import type { Card } from "./models";
import { parseCards } from "./parser";
import {
  AnkiSyncSettingTab,
  DEFAULT_SETTINGS,
  type PluginSettings,
} from "./settings";
import { type SyncResult, sync } from "./syncEngine";

export default class ObsidianAnkiSyncPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new AnkiSyncSettingTab(this.app, this));

    const statusBarItem = this.addStatusBarItem();
    statusBarItem.setText("\u{1F504} Sync");
    statusBarItem.addClass("mod-clickable");

    this.registerDomEvent(statusBarItem, "click", async () => {
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

  async runSync(): Promise<void> {
    const data = (await this.loadData()) as Record<string, unknown> | undefined;
    const state = data?.state as State | undefined;
    const vault = this.app.vault;
    const rootDeck = this.getEffectiveRootDeck();

    const allCards: Card[] = [];
    for (const file of vault.getMarkdownFiles()) {
      const content = await vault.read(file);
      const cards = parseCards(content, file.path, rootDeck);
      for (const card of cards) {
        card.updatedAt = file.stat.mtime;
      }
      allCards.push(...cards);
    }

    let result: SyncResult;
    try {
      result = sync(allCards, state ?? {});
    } catch (err) {
      new Notice(
        `Sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    let newState: State = state ?? {};

    let created = 0,
      updated = 0,
      moved = 0,
      deleted = 0;

    for (const action of result.actions) {
      switch (action.type) {
        case "createNote": {
          created++;
          try {
            let ankiNoteId: number;
            const existing = await ankiClient.findNotes(action.uuid);
            if (existing.length > 0) {
              ankiNoteId = existing[0];
            } else {
              await ankiClient.ensureDeck(action.deckName);
              await ankiClient.ensureModel();
              ankiNoteId = await ankiClient.createNote({
                deckName: action.deckName,
                front: action.front,
                back: action.back,
                uuid: action.uuid,
              });
            }

            newState = setMapping(newState, action.uuid, {
              ankiNoteId,
              path: action.filePath,
              front: action.card.front,
              back: action.card.back,
            });

            const updatedCard: Card = {
              ...action.card,
              uuid: action.uuid,
              ankiNoteId,
            };
            await replaceBlock(
              vault,
              action.filePath,
              action.uuid,
              updatedCard,
            );
          } catch (err) {
            console.error(`Failed to create note ${action.uuid}:`, err);
          }
          break;
        }
        case "updateCard": {
          const mapping = newState[action.uuid];
          if (!mapping) break;

          if (action.filePath !== mapping.path) {
            moved++;
          }
          if (
            action.card.front !== mapping.front ||
            action.card.back !== mapping.back
          ) {
            updated++;
            try {
              await ankiClient.updateNoteFields({
                noteId: mapping.ankiNoteId,
                front: action.card.front,
                back: action.card.back,
              });
            } catch {
              const newId = await ankiClient.createNote({
                deckName: action.card.deckPath,
                front: action.card.front,
                back: action.card.back,
                uuid: action.uuid,
              });
              await replaceBlock(vault, action.filePath, action.uuid, {
                ...action.card,
                ankiNoteId: newId,
              });
              newState = setMapping(newState, action.uuid, {
                ankiNoteId: newId,
                path: action.filePath,
                front: action.card.front,
                back: action.card.back,
              });
              break;
            }
          }

          newState = setMapping(newState, action.uuid, {
            ...mapping,
            path: action.filePath,
            front: action.card.front,
            back: action.card.back,
          });
          break;
        }
        case "deleteNote": {
          deleted++;
          try {
            await ankiClient.deleteNotes([action.ankiNoteId]);
          } catch (err) {
            console.error(`Failed to delete note ${action.uuid}:`, err);
          }
          newState = removeMapping(newState, action.uuid);
          break;
        }
        case "removeBlock": {
          const file = vault.getAbstractFileByPath(action.filePath);
          if (file instanceof TFile) {
            try {
              await removeBlock(vault, action.filePath, action.uuid);
            } catch (err) {
              console.error(`Failed to remove block ${action.uuid}:`, err);
            }
          }
          break;
        }
      }
    }

    const parts: string[] = [];
    if (created) parts.push(`${created} created`);
    if (updated) parts.push(`${updated} updated`);
    if (moved) parts.push(`${moved} moved`);
    if (deleted) parts.push(`${deleted} deleted`);
    new Notice(
      parts.length > 0 ? `Sync: ${parts.join(", ")}` : "Sync: nothing to do",
    );
    await this.saveData({ settings: this.settings, state: newState });
  }
}
