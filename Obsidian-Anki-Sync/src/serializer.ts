import type { Card } from "./models";

function longestBacktickRun(text: string): number {
  let maxLen = 0;
  let current = 0;
  for (const ch of text) {
    if (ch === "`") {
      current++;
      if (current > maxLen) maxLen = current;
    } else {
      current = 0;
    }
  }
  return maxLen;
}

function fenceCount(card: Card): number {
  const frontRun = longestBacktickRun(card.front);
  const backRun = longestBacktickRun(card.back);
  return Math.max(frontRun, backRun, 3) + 1;
}

export function serializeCard(card: Card): string {
  const fence = "`".repeat(fenceCount(card));
  const lines: string[] = [];

  lines.push(`${fence}anki`);

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

  lines.push(fence);

  return lines.join("\n");
}
