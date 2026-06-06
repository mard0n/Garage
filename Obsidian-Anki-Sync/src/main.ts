import { App, Plugin, PluginManifest, addIcon } from "obsidian"
import { AnkiClient } from "./ankiClient"
import { FileManager } from "./fileManager"
import { MappingStore } from "./mappingStore"
import { SyncEngine } from "./syncEngine"
import { Watchers } from "./watchers"
import { AnkiSyncSettingTab } from "./settings"
import { DEFAULT_SETTINGS, PluginSettings, SyncStatus } from "./types"

const SYNC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>`

export default class AnkiSyncPlugin extends Plugin {
  pluginSettings: PluginSettings = { ...DEFAULT_SETTINGS }
  ankiClient!: AnkiClient
  fileManager!: FileManager
  mappingStore!: MappingStore
  syncEngine!: SyncEngine
  watchers!: Watchers
  private statusBarItem: HTMLElement | null = null

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest)
  }

  async onload(): Promise<void> {
    await this.loadSettings()

    const pluginDir = `${this.app.vault.configDir}/plugins/${this.manifest.id}`

    this.ankiClient = new AnkiClient(this.pluginSettings)
    this.fileManager = new FileManager(this.app.vault)
    this.mappingStore = new MappingStore(this.app.vault.adapter, pluginDir)
    await this.mappingStore.load()

    this.syncEngine = new SyncEngine(
      this.ankiClient,
      this.fileManager,
      this.mappingStore,
      this.pluginSettings,
      (status, message) => this.updateStatusBar(status, message)
    )

    this.watchers = new Watchers(this.app.vault, this.syncEngine, this.pluginSettings)
    this.watchers.setup()

    this.addSettingTab(new AnkiSyncSettingTab(this.app, this))

    this.addCommand({
      id: "sync-now",
      name: "Sync now",
      callback: () => this.syncEngine.runFullSync(),
    })

    addIcon("anki-sync", SYNC_ICON)

    this.setupStatusBar()

    this.app.workspace.onLayoutReady(() => {
      this.syncEngine.runFullSync()
    })
  }

  onunload(): void {
    this.watchers.teardown()
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData()
    this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, data)
  }

  async testConnection(): Promise<boolean> {
    return this.ankiClient.testConnection()
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.pluginSettings)
    this.ankiClient.updateSettings(this.pluginSettings)
    this.syncEngine.updateSettings(this.pluginSettings)
    this.watchers.updateSettings(this.pluginSettings)
  }

  private setupStatusBar(): void {
    this.statusBarItem = this.addStatusBarItem()
    this.statusBarItem.className = "anki-sync-status"
    this.updateStatusBar("idle")
  }

  private updateStatusBar(status: SyncStatus, _message?: string): void {
    if (!this.statusBarItem) return

    this.statusBarItem.empty()
    this.statusBarItem.className = `anki-sync-status ${status}`

    const icon = this.statusBarItem.createSpan()
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>'

    const label = this.statusBarItem.createSpan({ text: " " })

    switch (status) {
      case "syncing":
        label.appendText("Syncing...")
        break
      case "success":
        label.appendText("Synced")
        break
      case "error":
        label.appendText("Sync error")
        break
      case "idle":
        label.appendText("Anki Sync")
        break
    }
  }
}
