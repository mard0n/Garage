import { App, PluginSettingTab, Setting } from "obsidian"
import { DEFAULT_SETTINGS, PluginSettings } from "./types"

interface SettingsHost {
  pluginSettings: PluginSettings
  saveSettings: () => Promise<void>
  testConnection: () => Promise<boolean>
}

export class AnkiSyncSettingTab extends PluginSettingTab {
  private host: SettingsHost

  constructor(app: App, host: SettingsHost) {
    super(app, host as any)
    this.host = host
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl("h2", { text: "Obsidian Anki Sync Settings" })

    new Setting(containerEl)
      .setName("AnkiConnect URL")
      .setDesc("URL of the AnkiConnect API (default: http://localhost:8765)")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:8765")
          .setValue(this.host.pluginSettings.ankiConnectUrl)
          .onChange(async (value) => {
            this.host.pluginSettings.ankiConnectUrl = value || DEFAULT_SETTINGS.ankiConnectUrl
            await this.host.saveSettings()
          })
      )

    let testStatusEl: HTMLElement
    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Verify that AnkiConnect is reachable")
      .addButton((btn) =>
        btn
          .setButtonText("Test")
          .onClick(async () => {
            btn.setDisabled(true)
            btn.setButtonText("Testing...")
            testStatusEl.setText("")
            const ok = await this.host.testConnection()
            btn.setDisabled(false)
            btn.setButtonText("Test")
            if (ok) {
              testStatusEl.setText("Connected")
              testStatusEl.style.color = "var(--color-green)"
            } else {
              testStatusEl.setText("Failed — is Anki running with AnkiConnect?")
              testStatusEl.style.color = "var(--color-red)"
            }
          })
      )
      .addExtraButton((btn) => {
        testStatusEl = btn.extraSettingsEl.createEl("span")
        testStatusEl.style.marginLeft = "8px"
      })

    new Setting(containerEl)
      .setName("Sync interval (seconds)")
      .setDesc("How often to poll Anki for changes (default: 60)")
      .addText((text) =>
        text
          .setPlaceholder("60")
          .setValue(String(this.host.pluginSettings.syncIntervalSec))
          .onChange(async (value) => {
            const num = parseInt(value, 10)
            if (num > 0) {
              this.host.pluginSettings.syncIntervalSec = num
              await this.host.saveSettings()
            }
          })
      )

    new Setting(containerEl)
      .setName("Save debounce (ms)")
      .setDesc("Delay after saving a file before syncing (default: 2000)")
      .addText((text) =>
        text
          .setPlaceholder("2000")
          .setValue(String(this.host.pluginSettings.saveDebounceMs))
          .onChange(async (value) => {
            const num = parseInt(value, 10)
            if (num >= 0) {
              this.host.pluginSettings.saveDebounceMs = num
              await this.host.saveSettings()
            }
          })
      )

    new Setting(containerEl)
      .setName("Vault root deck")
      .setDesc("The Anki deck that maps to the vault root. E.g. if your vault IS 'Frontend', set this to 'Frontend' so files at Javascript/Functions.md map to deck Frontend::Javascript::Functions")
      .addText((text) =>
        text
          .setPlaceholder("Frontend")
          .setValue(this.host.pluginSettings.vaultRootDeck)
          .onChange(async (value) => {
            this.host.pluginSettings.vaultRootDeck = value.trim()
            await this.host.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName("Ignored decks")
      .setDesc("Decks to skip during sync (one per line). Supports prefix matching.")
      .addTextArea((text) =>
        text
          .setPlaceholder("Web Dev::Templates\nPersonal::Journal")
          .setValue(this.host.pluginSettings.ignoreDecks.join("\n"))
          .onChange(async (value) => {
            this.host.pluginSettings.ignoreDecks = value
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
            await this.host.saveSettings()
          })
      )
  }
}
