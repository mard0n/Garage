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

    // Clean up empty subdecks under root
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

    // Scan all cards
    const allCards: Card[] = [];
    for (const file of vault.getMarkdownFiles()) {
      const content = await vault.read(file);
      const cards = parseCards(content, file.path, rootDeck);
      for (const card of cards) {
        card.updatedAt = file.stat.mtime;
      }
      allCards.push(...cards);
    }

    const localByUuid = new Map<string, Card>();
    for (const card of allCards) {
      if (card.uuid) localByUuid.set(card.uuid, card);
    }

    let newState: State = state ?? {};
    let created = 0, updated = 0, moved = 0, deleted = 0, pulled = 0;

    // ── Three-way merge on existing state entries ──
    //
    //   Local                    Anki        Action
    //   ─────────────────────────────────────────
    //   Same                     Same        None
    //   Changed (content/path)   Same        Push
    //   Same                     Changed     Pull
    //   Changed                  Changed     Push (Obsidian wins)
    //
    for (const [uuid, mapping] of Object.entries(newState)) {
      const localCard = localByUuid.get(uuid);

      // ── Deleted from Obsidian ──
      if (!localCard) {
        await ankiClient.deleteNotes([mapping.ankiNoteId]).catch(() => {});
        await removeBlock(vault, mapping.path, uuid).catch(() => {});
        newState = removeMapping(newState, uuid);
        deleted++;
        continue;
      }

      const pathChanged = localCard.filePath !== mapping.path;
      const contentChanged = localCard.front !== mapping.front || localCard.back !== mapping.back;
      const localChanged = pathChanged || contentChanged;

      // ── Fetch from Anki ──
      let noteIds: number[];
      try {
        noteIds = await ankiClient.findNotes(uuid);
      } catch {
        continue;
      }

      // ── Note missing from Anki → recreate ──
      if (noteIds.length === 0) {
        try {
          await ankiClient.ensureDeck(localCard.deckPath);
          await ankiClient.ensureModel();
          const newId = await ankiClient.createNote({
            deckName: localCard.deckPath,
            front: localCard.front,
            back: localCard.back,
            uuid,
          });
          newState = setMapping(newState, uuid, {
            ankiNoteId: newId,
            path: localCard.filePath,
            front: localCard.front,
            back: localCard.back,
          });
          updated++;
          if (pathChanged) moved++;
        } catch (err) {
          console.error(`Failed to recreate note ${uuid}:`, err);
        }
        continue;
      }

      // ── Remote content ──
      let remoteFront: string | undefined;
      let remoteBack: string | undefined;
      try {
        const [info] = await ankiClient.notesInfo(noteIds);
        remoteFront = info?.fields?.Front?.value;
        remoteBack = info?.fields?.Back?.value;
      } catch {
        continue;
      }
      if (remoteFront === undefined || remoteBack === undefined) continue;

      const ankiChanged = remoteFront !== mapping.front || remoteBack !== mapping.back;

      // ─────────────────────────────────────────────
      //  Three-way decision
      // ─────────────────────────────────────────────

      if (!localChanged && !ankiChanged) {
        continue;
      }

      if (localChanged && !ankiChanged) {
        // Only Obsidian changed → push to Anki
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
              newState = setMapping(newState, uuid, {
                ankiNoteId: newId,
                path: localCard.filePath,
                front: localCard.front,
                back: localCard.back,
              });
              if (contentChanged) updated++;
              if (pathChanged) moved++;
            } catch (err) {
              console.error(`Failed to recreate note ${uuid}:`, err);
            }
            continue;
          }
        }
        if (pathChanged) {
          await ankiClient.ensureDeck(localCard.deckPath).catch(() => {});
          await ankiClient.changeDeck([mapping.ankiNoteId], localCard.deckPath).catch(() => {});
        }
        newState = setMapping(newState, uuid, {
          ...mapping,
          path: localCard.filePath,
          front: localCard.front,
          back: localCard.back,
        });
        if (contentChanged) updated++;
        if (pathChanged) moved++;
        continue;
      }

      if (!localChanged && ankiChanged) {
        // Only Anki changed → pull into file
        const pulledCard: Card = { ...localCard, front: remoteFront, back: remoteBack };
        try {
          await replaceBlock(vault, localCard.filePath, uuid, pulledCard);
        } catch (err) {
          console.error(`Failed to pull block ${uuid}:`, err);
          continue;
        }
        newState = setMapping(newState, uuid, {
          ...mapping,
          path: localCard.filePath,
          front: remoteFront,
          back: remoteBack,
        });
        pulled++;
        continue;
      }

      // Both changed → Obsidian wins, push
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
            newState = setMapping(newState, uuid, {
              ankiNoteId: newId,
              path: localCard.filePath,
              front: localCard.front,
              back: localCard.back,
            });
            if (contentChanged) updated++;
            if (pathChanged) moved++;
          } catch (err) {
            console.error(`Failed to recreate note ${uuid}:`, err);
          }
          continue;
        }
      }
      if (pathChanged) {
        await ankiClient.ensureDeck(localCard.deckPath).catch(() => {});
        await ankiClient.changeDeck([mapping.ankiNoteId], localCard.deckPath).catch(() => {});
      }
      newState = setMapping(newState, uuid, {
        ...mapping,
        path: localCard.filePath,
        front: localCard.front,
        back: localCard.back,
      });
      if (contentChanged) updated++;
      if (pathChanged) moved++;
    }

    // Create new cards not yet in state
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
      created++;
    }

    const parts: string[] = [];
    if (created) parts.push(`${created} created`);
    if (updated) parts.push(`${updated} updated`);
    if (moved) parts.push(`${moved} moved`);
    if (deleted) parts.push(`${deleted} deleted`);
    if (pulled) parts.push(`${pulled} pulled`);
    new Notice(
      parts.length > 0 ? `Sync: ${parts.join(", ")}` : "Sync: nothing to do",
    );
    await this.saveData({ settings: this.settings, state: newState });
  }
}
