import { Vault, TFile, TFolder, normalizePath } from "obsidian"
import { parseCards } from "./parser"
import { Card } from "./types"

interface CardBlockPosition {
  uuid: string
  hasUuid: boolean
  startIndex: number
  endIndex: number
}

export class FileManager {
  private vault: Vault

  constructor(vault: Vault) {
    this.vault = vault
  }

  async readFile(path: string): Promise<string> {
    const exists = await this.vault.adapter.exists(path)
    if (!exists) return ""
    return this.vault.adapter.read(path)
  }

  async writeFile(path: string, content: string): Promise<void> {
    const exists = await this.vault.adapter.exists(path)
    if (!exists) {
      await this.ensureFolders(path)
      await this.vault.create(path, content)
      return
    }

    const indexed = this.vault.getAbstractFileByPath(path)
    if (indexed instanceof TFile) {
      await this.vault.modify(indexed, content)
    } else {
      await this.vault.adapter.write(path, content)
    }
  }

  async appendToFile(path: string, content: string): Promise<void> {
    let existing = ""
    try {
      existing = await this.readFile(path)
    } catch {
      // file doesn't exist yet
    }

    let newContent: string
    if (existing.trim().length === 0) {
      newContent = content.trim()
    } else {
      newContent = existing.trimEnd() + "\n\n" + content
    }

    await this.writeFile(path, newContent)
  }

  async ensureFile(path: string): Promise<TFile> {
    const existing = this.vault.getAbstractFileByPath(path)
    if (existing instanceof TFile) return existing

    const existsOnDisk = await this.vault.adapter.exists(path)
    if (existsOnDisk) {
      throw new Error(
        `File exists on disk but not in vault index: ${path}. ` +
        `This usually means a file was added by an external process (e.g. cloud sync) ` +
        `and Obsidian has not yet indexed it. Try restarting Obsidian.`
      )
    }

    await this.ensureFolders(path)

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.vault.create(path, "")
      } catch (e) {
        console.warn(`ensureFile attempt ${attempt} failed for ${path}:`, e)
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    throw new Error(`Cannot create file: ${path}`)
  }

  async ensureFolders(filePath: string): Promise<void> {
    const parts = filePath.split("/")
    parts.pop()

    let currentPath = ""
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      if (this.vault.getAbstractFileByPath(currentPath) instanceof TFolder) continue

      const existsOnDisk = await this.vault.adapter.exists(currentPath)
      if (existsOnDisk) continue

      try {
        await this.vault.createFolder(currentPath)
      } catch (e) {
        const retry = this.vault.getAbstractFileByPath(currentPath)
        if (!(retry instanceof TFolder)) {
          console.warn(`ensureFolders failed for ${currentPath}:`, e)
        }
      }
    }
  }

  async fileExists(path: string): Promise<boolean> {
    return await this.vault.adapter.exists(path)
  }

  async deleteFile(path: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path)
    if (file instanceof TFile) {
      await this.vault.delete(file)
    }
  }

  async getAnkiCardFiles(rootDeck?: string): Promise<string[]> {
    const paths: string[] = []
    const markdownPaths = await this.walkMarkdownFiles("")

    for (const path of markdownPaths) {
      const exists = await this.vault.adapter.exists(path)
      if (!exists) continue
      const content = await this.vault.adapter.read(path)
      const cards = parseCards(content, path, rootDeck)
      if (cards.length > 0) {
        paths.push(path)
      }
    }

    return paths
  }

  private async walkMarkdownFiles(dir: string): Promise<string[]> {
    const result: string[] = []
    let listing: { files: string[]; folders: string[] }
    try {
      listing = await this.vault.adapter.list(dir)
    } catch {
      return result
    }

    for (const file of listing.files) {
      if (file.endsWith(".md")) {
        const fullPath = dir ? `${dir}/${file}` : file
        result.push(fullPath)
      }
    }

    for (const folder of listing.folders) {
      if (folder.startsWith(".") || folder === "node_modules") continue
      const fullPath = dir ? `${dir}/${folder}` : folder
      const sub = await this.walkMarkdownFiles(fullPath)
      result.push(...sub)
    }

    return result
  }

  async readCardsFromFile(path: string, rootDeck?: string): Promise<Card[]> {
    const content = await this.readFile(path)
    return parseCards(content, path, rootDeck)
  }

  async replaceCardBlock(path: string, uuid: string, newBlock: string): Promise<void> {
    const content = await this.readFile(path)
    const blocks = this.findCardBlocks(content)

    let newContent = content
    for (const block of blocks) {
      if (block.uuid === uuid) {
        newContent =
          content.substring(0, block.startIndex) +
          newBlock +
          content.substring(block.endIndex)
        break
      }
    }

    if (newContent !== content) {
      await this.writeFile(path, newContent)
    }
  }

  async replaceNewCardBlock(path: string, newUuid: string, serialized: string): Promise<void> {
    const content = await this.readFile(path)
    const blocks = this.findCardBlocks(content)

    let newContent = content
    for (const block of blocks) {
      if (!block.hasUuid) {
        newContent =
          content.substring(0, block.startIndex) +
          serialized +
          content.substring(block.endIndex)
        break
      }
    }

    if (newContent !== content) {
      await this.writeFile(path, newContent)
    }
  }

  async addCardBlock(path: string, block: string): Promise<void> {
    await this.appendToFile(path, block)
  }

  async removeCardBlock(path: string, uuid: string): Promise<void> {
    const content = await this.readFile(path)
    const blocks = this.findCardBlocks(content)

    const block = blocks.find((b) => b.uuid === uuid)
    if (!block) return

    const before = content.substring(0, block.startIndex)
    const after = content.substring(block.endIndex)

    let newContent = before

    // remove leading blank lines from after, plus one newline from before
    if (before.endsWith("\n\n")) {
      newContent = before.substring(0, before.length - 1)
    } else if (before.endsWith("\n")) {
      // keep as is
    }

    const cleanedAfter = after.replace(/^\n+/, "")
    newContent += cleanedAfter

    await this.writeFile(path, newContent)
  }

  private findCardBlocks(content: string): CardBlockPosition[] {
    const blocks: CardBlockPosition[] = []
    const lines = content.split("\n")
    let inBlock = false
    let blockStart = 0
    let uuid = ""
    let hasUuid = false
    let charIndex = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!inBlock && trimmed === "```anki") {
        inBlock = true
        blockStart = charIndex
        uuid = ""
        hasUuid = false
      } else if (inBlock) {
        if (trimmed.startsWith("id: ")) {
          uuid = trimmed.substring(4).trim()
          hasUuid = true
        }
        if (trimmed === "```") {
          blocks.push({
            uuid,
            hasUuid,
            startIndex: blockStart,
            endIndex: charIndex + line.length + 1,
          })
          inBlock = false
        }
      }

      charIndex += line.length + 1
    }

    return blocks
  }
}
