import type { Card } from "./models";

function filePathToDeckPath(filePath: string, basePath: string): string {
  let path = filePath;
  if (path.endsWith(".md")) {
    path = path.slice(0, -3);
  }

  if (basePath) {
    const normalized = `${basePath.replace(/\/+$/, "")}/`;
    if (!path.startsWith(normalized)) {
      return "";
    }
    path = path.slice(normalized.length);
  }

  return path.replace(/\//g, "::");
}

type Block = {
  raw: string;
  startLine: number;
};

function extractAnkiBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === "```anki") {
      const startLine = i;
      i++;
      const blockLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "```") {
        blockLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        // consume closing ```
        i++;
      }
      blocks.push({ raw: blockLines.join("\n"), startLine });
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

    // Line doesn't match any metadata pattern — end of metadata section
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
  let contentEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === openTag) {
      contentStart = i + 1;
    }
    if (contentStart !== -1 && trimmed === closeTag) {
      contentEnd = i;
      const content = lines.slice(contentStart, contentEnd).join("\n");
      const remaining = lines.slice(contentEnd + 1);
      return { content, remaining };
    }
  }

  return { content: "", remaining: lines };
}

export function parseCards(markdown: string, filePath: string, basePath = ""): Card[] {
  const deckPath = filePathToDeckPath(filePath, basePath);
  if (!deckPath) {
    return [];
  }

  const blocks = extractAnkiBlocks(markdown);
  const cards: Card[] = [];

  for (const block of blocks) {
    const lines = block.raw.split("\n");

    const { uuid, ankiNoteId, rest } = parseMetadataBlock(lines);

    const { content: front, remaining: afterFront } = extractTagContent(rest, "front");
    if (!front) continue;

    const { content: back, remaining: _afterBack } = extractTagContent(afterFront, "back");
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
