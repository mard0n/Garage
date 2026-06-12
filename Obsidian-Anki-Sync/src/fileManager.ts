import { TFile, TFolder, type Vault } from "obsidian";
import type { Card } from "./models";
import { serializeCard } from "./serializer";

const OPENING_FENCE = /^(`{4,})anki$/;

async function ensureParentFolder(vault: Vault, filePath: string): Promise<void> {
  const parts = filePath.split("/");
  if (parts.length <= 1) return;
  parts.pop();
  for (let i = 1; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    const existing = vault.getAbstractFileByPath(dir);
    if (!(existing instanceof TFolder)) {
      try {
        await vault.createFolder(dir);
      } catch {
        // may race with another creation
      }
    }
  }
}

export async function replaceBlock(
  vault: Vault,
  filePath: string,
  uuid: string,
  card: Card,
): Promise<void> {
  const file = vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return;

  const content = await vault.read(file);
  const lines = content.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = lines[i].trim().match(OPENING_FENCE);
    if (match) {
      const fence = match[1];
      const blockStart = i;
      i++;
      const blockLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== fence) {
        blockLines.push(lines[i]);
        i++;
      }
      const blockEnd = i;
      if (i < lines.length) i++;

      const blockId = extractUuid(blockLines);
      if (blockId === uuid) {
        result.push(serializeCard(card));
      } else {
        result.push(...lines.slice(blockStart, i));
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  await vault.modify(file, result.join("\n"));
}

export async function removeBlock(vault: Vault, filePath: string, uuid: string): Promise<void> {
  const file = vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return;

  const content = await vault.read(file);
  const lines = content.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = lines[i].trim().match(OPENING_FENCE);
    if (match) {
      const fence = match[1];
      const blockStart = i;
      i++;
      const blockLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== fence) {
        blockLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const blockEnd = i;

      const blockId = extractUuid(blockLines);
      if (blockId === uuid) {
        // Skip this block entirely (don't add to result)
      } else {
        result.push(...lines.slice(blockStart, blockEnd));
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  // Trim trailing blank lines left by removal
  while (result.length > 0 && result[result.length - 1].trim() === "") {
    result.pop();
  }

  await vault.modify(file, result.join("\n"));
}

export async function appendBlock(vault: Vault, filePath: string, card: Card): Promise<void> {
  const file = vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) {
    await ensureParentFolder(vault, filePath);
    await vault.create(filePath, serializeCard(card) + "\n");
    return;
  }

  const content = await vault.read(file);
  const newContent = content.endsWith("\n")
    ? content + serializeCard(card) + "\n"
    : content + "\n" + serializeCard(card) + "\n";
  await vault.modify(file, newContent);
}

function extractUuid(blockLines: string[]): string | null {
  for (const line of blockLines) {
    const match = line.match(/^id:\s*(.+)$/);
    if (match) return match[1].trim();
  }
  return null;
}
