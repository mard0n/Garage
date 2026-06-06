import { Vault, TFile } from "obsidian"
import { SyncEngine } from "./syncEngine"
import { PluginSettings } from "./types"

type EventCallback = (...args: unknown[]) => unknown

export class Watchers {
  private vault: Vault
  private syncEngine: SyncEngine
  private settings: PluginSettings
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>>
  private pollInterval: ReturnType<typeof setInterval> | null
  private renameBuffer: { oldPath: string; newPath: string } | null
  private modifyRef: EventCallback | null
  private deleteRef: EventCallback | null
  private renameRef: EventCallback | null

  constructor(vault: Vault, syncEngine: SyncEngine, settings: PluginSettings) {
    this.vault = vault
    this.syncEngine = syncEngine
    this.settings = settings
    this.debounceTimers = new Map()
    this.pollInterval = null
    this.renameBuffer = null
    this.modifyRef = null
    this.deleteRef = null
    this.renameRef = null
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.startPolling()
    }
  }

  setup(): void {
    const onModify = (...args: unknown[]) => {
      const file = args[0] as TFile
      if (file.extension !== "md") return

      const existing = this.debounceTimers.get(file.path)
      if (existing) clearTimeout(existing)

      const timer = setTimeout(() => {
        this.debounceTimers.delete(file.path)
        this.syncEngine.syncFile(file.path)
      }, this.settings.saveDebounceMs)

      this.debounceTimers.set(file.path, timer)
    }

    const onDelete = (...args: unknown[]) => {
      const file = args[0] as TFile
      if (file.extension !== "md") return

      const timer = this.debounceTimers.get(file.path)
      if (timer) {
        clearTimeout(timer)
        this.debounceTimers.delete(file.path)
      }

      this.syncEngine.handleFileDelete(file.path)
    }

    const onRename = (...args: unknown[]) => {
      const file = args[0] as TFile
      const oldPath = args[1] as string
      if (!oldPath.endsWith(".md")) return

      if (
        this.renameBuffer &&
        this.renameBuffer.oldPath === oldPath
      ) {
        this.renameBuffer.newPath = file.path
        return
      }

      this.renameBuffer = { oldPath, newPath: file.path }

      setTimeout(() => {
        if (this.renameBuffer) {
          this.syncEngine.handleFileRename(
            this.renameBuffer.oldPath,
            this.renameBuffer.newPath
          )
          this.renameBuffer = null
        }
      }, 500)
    }

    this.modifyRef = this.vault.on("modify", onModify) as unknown as EventCallback
    this.deleteRef = this.vault.on("delete", onDelete) as unknown as EventCallback
    this.renameRef = this.vault.on("rename", onRename) as unknown as EventCallback

    this.startPolling()
  }

  teardown(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }

  private startPolling(): void {
    this.pollInterval = setInterval(() => {
      this.syncEngine.runFullSync()
    }, this.settings.syncIntervalSec * 1000)
  }
}
