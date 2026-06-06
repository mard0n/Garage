import { Card, filePathToDeckPath } from "./types"

const BLOCK_START = "```anki"
const BLOCK_END = "```"

function extractBlocks(content: string): { raw: string; startLine: number; endLine: number }[] {
  const blocks: { raw: string; startLine: number; endLine: number }[] = []
  const lines = content.split("\n")
  let inBlock = false
  let blockStart = 0
  let blockLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    if (!inBlock && trimmed === BLOCK_START) {
      inBlock = true
      blockStart = i
      blockLines = [lines[i]]
    } else if (inBlock) {
      blockLines.push(lines[i])
      if (trimmed === BLOCK_END) {
        blocks.push({
          raw: blockLines.join("\n"),
          startLine: blockStart,
          endLine: i,
        })
        inBlock = false
      }
    }
  }

  return blocks
}

class CardParser {
  private lines: string[]
  private pos: number

  constructor(blockText: string) {
    this.lines = blockText.split("\n")
    this.pos = 0
  }

  private peek(): string | null {
    return this.pos < this.lines.length ? this.lines[this.pos] : null
  }

  private advance(): string | null {
    const line = this.peek()
    if (line !== null) this.pos++
    return line
  }

  private isEnd(): boolean {
    return this.pos >= this.lines.length
  }

  parse(filePath: string, rootDeck?: string): Card | null {
    const openingLine = this.advance()
    if (!openingLine || openingLine.trim() !== BLOCK_START) {
      return null
    }

    let uuid = ""
    let ankiNoteId: number | undefined

    while (!this.isEnd()) {
      const line = this.peek()!
      const trimmed = line.trim()

      if (trimmed === "[front]") {
        break
      }

      if (trimmed.startsWith("id: ")) {
        uuid = trimmed.substring(4).trim()
      } else if (trimmed.startsWith("ankiNoteId: ")) {
        const val = trimmed.substring(12).trim()
        ankiNoteId = val ? parseInt(val, 10) || undefined : undefined
      }

      this.advance()
    }

    if (this.isEnd()) return null

    this.advance()

    const frontLines: string[] = []
    while (!this.isEnd()) {
      const line = this.advance()!
      if (line.trim() === "[/front]") {
        break
      }
      frontLines.push(line)
    }

    if (this.isEnd()) return null

    const backHeader = this.advance()
    if (!backHeader || backHeader.trim() !== "[back]") {
      return null
    }

    const backLines: string[] = []
    while (!this.isEnd()) {
      const line = this.advance()!
      if (line.trim() === "[/back]") {
        break
      }
      backLines.push(line)
    }

    const closingLine = this.advance()
    if (!closingLine || closingLine.trim() !== BLOCK_END) {
      return null
    }

    return {
      uuid,
      ankiNoteId,
      front: frontLines.join("\n"),
      back: backLines.join("\n"),
      filePath,
      deckPath: filePathToDeckPath(filePath, rootDeck),
      updatedAt: Date.now(),
    }
  }
}

export function parseCards(content: string, filePath: string, rootDeck?: string): Card[] {
  const blocks = extractBlocks(content)
  const cards: Card[] = []

  for (const block of blocks) {
    const parser = new CardParser(block.raw)
    const card = parser.parse(filePath, rootDeck)
    if (card) {
      cards.push(card)
    }
  }

  return cards
}

export function extractAnkiBlocks(content: string): { raw: string; startLine: number }[] {
  return extractBlocks(content).map((b) => ({
    raw: b.raw,
    startLine: b.startLine,
  }))
}
