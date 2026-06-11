import { Notice, Plugin } from "obsidian";
import * as ankiClient from "./ankiClient";
import { appendBlock, removeBlock, replaceBlock } from "./fileManager";
import type { State } from "./mappingStore";
import type { Card } from "./models";
import { parseCards } from "./parser";
import { AnkiSyncSettingTab, DEFAULT_SETTINGS, type PluginSettings } from "./settings";
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
      console.log("Obsidian Anki Sync: Anki unreachable (start Anki + AnkiConnect)");
    }
  }

  getEffectiveRootDeck(): string {
    return this.settings.rootDeck.trim() || this.app.vault.getName();
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async runSync(): Promise<void> {
    const state = (await this.loadData()) as State | undefined;
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
      result = await sync(allCards, state ?? {}, ankiClient, rootDeck);
    } catch (err) {
      new Notice(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    await this.saveSettings();
    await this.saveData(result.newState);

    const pulledUuids = new Set(result.pullFromAnki.map((p) => p.uuid));

    for (const card of allCards) {
      if (!card.ankiNoteId) continue;
      if (pulledUuids.has(card.uuid)) continue;

      await replaceBlock(vault, card.filePath, card.uuid, card).catch(() => {});
    }

    for (const pull of result.pullFromAnki) {
      const card: Card = {
        uuid: pull.uuid,
        front: pull.front,
        back: pull.back,
        filePath: pull.filePath,
        deckPath: pull.deckPath,
        ankiNoteId: result.newState[pull.uuid]?.ankiNoteId,
        updatedAt: Date.now(),
      };
      await replaceBlock(vault, pull.filePath, pull.uuid, card).catch(() => {});
    }

    for (const uuid of result.uuidsDeletedFromAnki) {
      const path = state?.[uuid]?.path;
      if (path) {
        await removeBlock(vault, path, uuid).catch(() => {});
      }
    }

    const s = result.summary;
    const parts: string[] = [];
    if (s.created) parts.push(`${s.created} created`);
    if (s.updated) parts.push(`${s.updated} updated`);
    if (s.deleted) parts.push(`${s.deleted} deleted`);
    if (s.pulled) parts.push(`${s.pulled} pulled`);
    if (s.removed) parts.push(`${s.removed} removed`);
    new Notice(`Sync complete${parts.length ? `: ${parts.join(", ")}` : " \u2014 nothing to do"}`);
  }
}
