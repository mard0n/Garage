import { type App, PluginSettingTab, Setting } from "obsidian";
import { ping } from "./ankiClient";
import type ObsidianAnkiSyncPlugin from "./main";

export type PluginSettings = {
  rootDeck: string;
};

export const DEFAULT_SETTINGS: PluginSettings = {
  rootDeck: "",
};

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
      .setName("Root deck name")
      .setDesc("Top-level Anki deck name. When empty, the vault name is used. Folder hierarchy is preserved as subdecks.")
      .addText((text) =>
        text
          .setPlaceholder(this.app.vault.getName())
          .setValue(this.plugin.settings.rootDeck)
          .onChange(async (value) => {
            this.plugin.settings.rootDeck = value;
            await this.plugin.saveSettings();
          }),
      );

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
