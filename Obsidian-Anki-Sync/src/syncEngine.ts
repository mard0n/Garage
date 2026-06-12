import { getMapping } from "./mappingStore";
import type { State } from "./mappingStore";
import type { Card } from "./models";

// ─── Action types ───

export type CreateNoteAction = {
  type: "createNote";
  uuid: string;
  deckName: string;
  front: string;
  back: string;
  filePath: string;
  card: Card;
};

export type UpdateCardAction = {
  type: "updateCard";
  uuid: string;
  filePath: string;
  card: Card;
};

export type DeleteNoteAction = {
  type: "deleteNote";
  ankiNoteId: number;
  uuid: string;
};

export type RemoveBlockAction = {
  type: "removeBlock";
  filePath: string;
  uuid: string;
};

export type SyncAction =
  | CreateNoteAction
  | UpdateCardAction
  | DeleteNoteAction
  | RemoveBlockAction;

export type SyncResult = {
  actions: SyncAction[];
};

// ─── Main sync ───
export function sync(localCards: Card[], state: State): SyncResult {
  const actions: SyncAction[] = [];

  for (const localCard of localCards) {
    const uuid = localCard.uuid;
    if (!uuid) continue;
    const mapping = getMapping(state, uuid);

    if (!mapping) {
      actions.push({
        type: "createNote",
        uuid,
        deckName: localCard.deckPath,
        front: localCard.front,
        back: localCard.back,
        filePath: localCard.filePath,
        card: localCard,
      });
    } else if (
        localCard.filePath !== mapping.path ||
        localCard.front !== mapping.front ||
        localCard.back !== mapping.back
      ) {
        actions.push({
          type: "updateCard",
          uuid,
          filePath: localCard.filePath,
          card: localCard,
        });
      }
  }

  // Detect cards deleted from Obsidian (in state but not in local cards)
  const localUuids = new Set(localCards.map((c) => c.uuid).filter(Boolean));
  for (const [uuid, mapping] of Object.entries(state)) {
    if (!localUuids.has(uuid)) {
      actions.push({ type: "deleteNote", ankiNoteId: mapping.ankiNoteId, uuid });
      actions.push({ type: "removeBlock", filePath: mapping.path, uuid });
    }
  }

  return { actions };
}
