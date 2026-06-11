import type { Card } from "./models";

function filePathToDeckPath(filePath: string, rootDeck: string): string {
  let path = filePath;
  if (path.endsWith(".md")) {
    path = path.slice(0, -3);
  }

  const deckSuffix = path.replace(/\//g, "::");

  if (rootDeck) {
    return `${rootDeck}::${deckSuffix}`;
  }
  return deckSuffix;
}

type Block = {
  raw: string;
};

const OPENING_FENCE = /^(`{4,})anki$/;

function extractAnkiBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    const match = lines[i].trim().match(OPENING_FENCE);
    if (match) {
      const fence = match[1];
      i++;
      const blockLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== fence) {
        blockLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        i++;
      }
      blocks.push({ raw: blockLines.join("\n") });
    } else {
      i++;
    }
  }

  return blocks;
}

function parseMetadataBlock(lines: string[]): {
  uuid: string;
  ankiNoteId?: number;
  rest: string[];
} {
  let uuid = "";
  let ankiNoteId: number | undefined;
  let restStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      restStart = i + 1;
      break;
    }

    const idMatch = line.match(/^id:\s*(.+)$/);
    if (idMatch) {
      uuid = idMatch[1].trim();
      continue;
    }

    const ankiIdMatch = line.match(/^ankiNoteId:\s*(\d+)$/);
    if (ankiIdMatch) {
      ankiNoteId = Number.parseInt(ankiIdMatch[1], 10);
      continue;
    }

    restStart = i;
    break;
  }

  const rest = lines.slice(restStart);

  return { uuid, ankiNoteId, rest };
}

function extractTagContent(lines: string[], tag: string): { content: string; remaining: string[] } {
  const openTag = `[${tag}]`;
  const closeTag = `[/${tag}]`;

  let contentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === openTag) {
      contentStart = i + 1;
    }
    if (contentStart !== -1 && trimmed === closeTag) {
      const content = lines.slice(contentStart, i).join("\n");
      const remaining = lines.slice(i + 1);
      return { content, remaining };
    }
  }

  return { content: "", remaining: lines };
}

export function parseCards(markdown: string, filePath: string, rootDeck = ""): Card[] {
  const deckPath = filePathToDeckPath(filePath, rootDeck);

  const blocks = extractAnkiBlocks(markdown);
  const cards: Card[] = [];

  for (const block of blocks) {
    const lines = block.raw.split("\n");

    const { uuid, ankiNoteId, rest } = parseMetadataBlock(lines);

    const { content: front, remaining: afterFront } = extractTagContent(rest, "front");
    if (!front) continue;

    const { content: back } = extractTagContent(afterFront, "back");
    if (!back) continue;

    cards.push({
      uuid,
      ankiNoteId,
      front,
      back,
      filePath,
      deckPath,
      updatedAt: 0,
    });
  }

  return cards;
}
