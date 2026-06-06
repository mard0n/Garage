import { Card } from "./types"

export function serializeCard(card: Card): string {
  const lines: string[] = []
  lines.push("```anki")

  lines.push(`id: ${card.uuid}`)
  if (card.ankiNoteId !== undefined) {
    lines.push(`ankiNoteId: ${card.ankiNoteId}`)
  }

  lines.push("")
  lines.push("[front]")
  if (card.front) {
    lines.push(card.front)
  }
  lines.push("[/front]")

  lines.push("")
  lines.push("[back]")
  if (card.back) {
    lines.push(card.back)
  }
  lines.push("[/back]")

  lines.push("```")
  return lines.join("\n")
}
