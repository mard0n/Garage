import { Notice, Plugin } from "obsidian";
import { ping } from "./ankiClient";
import { AnkiSyncSettingTab } from "./settings";

export default class ObsidianAnkiSyncPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: "test-anki-connection",
      name: "Test Anki Connection",
      callback: async () => {
        const ok = await ping();
        new Notice(ok ? "Anki connected ✅" : "Anki unreachable ❌");
      },
    });

    this.addSettingTab(new AnkiSyncSettingTab(this.app, this));

    const ok = await ping();
    if (ok) {
      console.log("Obsidian Anki Sync: Anki connected");
    } else {
      console.log("Obsidian Anki Sync: Anki unreachable (start Anki + AnkiConnect)");
    }
  }
}
