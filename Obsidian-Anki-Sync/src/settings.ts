import { type App, PluginSettingTab, Setting } from "obsidian";
import { ping } from "./ankiClient";
import type ObsidianAnkiSyncPlugin from "./main";

export class AnkiSyncSettingTab extends PluginSettingTab {
  plugin: ObsidianAnkiSyncPlugin;

  constructor(app: App, plugin: ObsidianAnkiSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Obsidian Anki Sync" });

    new Setting(containerEl)
      .setName("Connection status")
      .setDesc("Test if AnkiConnect is reachable")
      .addButton((btn) => {
        btn.setButtonText("Test Connection").onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("Testing...");
          const ok = await ping();
          btn.setButtonText(ok ? "Connected ✅" : "Unreachable ❌");
          setTimeout(() => {
            btn.setButtonText("Test Connection");
            btn.setDisabled(false);
          }, 3000);
        });
      });
  }
}
