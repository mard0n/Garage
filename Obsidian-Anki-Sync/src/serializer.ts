import type { Card } from "./models";

const FENCE = "````";

export function serializeCard(card: Card): string {
  const lines: string[] = [];

  lines.push(`${FENCE}anki`);

  if (card.uuid) {
    lines.push(`id: ${card.uuid}`);
  }
  if (card.ankiNoteId !== undefined) {
    lines.push(`ankiNoteId: ${card.ankiNoteId}`);
  }

  lines.push("");
  lines.push("[front]");
  lines.push(card.front);
  lines.push("[/front]");

  lines.push("");
  lines.push("[back]");
  lines.push(card.back);
  lines.push("[/back]");

  lines.push(FENCE);

  return lines.join("\n");
}
