import { Plugin } from "obsidian";

export default class ObsidianAnkiSyncPlugin extends Plugin {
  async onload() {
    console.log("Obsidian Anki Sync: plugin loaded");
  }

  onunload() {
    console.log("Obsidian Anki Sync: plugin unloaded");
  }
}
