import type { Card } from "./models";

function filePathToDeckPath(filePath: string, rootDeck: string): string {
  let path = filePath;
  if (path.endsWith(".md")) {
    path = path.slice(0, -3);
  }

  // Branch deck convention: if the file name equals the parent folder name
  // (e.g. "Folder/Folder.md"), the file represents a branch deck.
  // Deduplicate the last segment so it maps back to "Parent::Folder"
  // instead of "Parent::Folder::Folder".
  const parts = path.split("/");
  if (parts.length >= 2 && parts[parts.length - 1] === parts[parts.length - 2]) {
    parts.pop();
    path = parts.join("/");
  }

  // Root deck file: if the full path equals the root deck name,
  // map directly to the root deck, not rootDeck::rootDeck
  if (rootDeck && path === rootDeck) return rootDeck;

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

function extractAnkiFencedBlocks(markdown: string): Block[] {
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

function parseMetadataBlock(block: Block): {
  uuid: string | undefined;
  ankiNoteId: number | undefined;
} {
  const lines = block.raw.split("\n");
  let uuid: string | undefined;
  let ankiNoteId: number | undefined;

  for (const line of lines) {
    if (line.trim() === "") break;

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

    break;
  }

  return { uuid, ankiNoteId };
}

function extractTagContent(block: Block, tag: string): { content: string } {
  const lines = block.raw.split("\n");
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
      return { content };
    }
  }

  return { content: "" };
}

export function parseCards(markdown: string, filePath: string, rootDeck = ""): Card[] {
  const deckPath = filePathToDeckPath(filePath, rootDeck);

  const blocks = extractAnkiFencedBlocks(markdown);
  const cards: Card[] = [];

  for (const block of blocks) {
    const { uuid, ankiNoteId } = parseMetadataBlock(block);
    if (!uuid) {
      console.warn(`Skipping block in ${filePath}: missing id:`);
      continue;
    }

    const { content: front } = extractTagContent(block, "front");
    if (!front) {
      console.warn(`Skipping block ${uuid} in ${filePath}: missing [front]`);
      continue;
    }

    const { content: back } = extractTagContent(block, "back");
    if (!back) {
      console.warn(`Skipping block ${uuid} in ${filePath}: missing [back]`);
      continue;
    }

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
