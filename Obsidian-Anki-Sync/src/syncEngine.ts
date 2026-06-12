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

export type UpdateNoteAction = {
  type: "updateNote";
  ankiNoteId: number;
  front: string;
  back: string;
  uuid: string;
  filePath: string;
  card: Card;
};

export type UpdatePathAction = {
  type: "updatePath";
  uuid: string;
  filePath: string;
};

export type SyncAction = CreateNoteAction | UpdateNoteAction | UpdatePathAction;

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
    } else {
      if (localCard.filePath !== mapping.path) {
        actions.push({ type: "updatePath", uuid, filePath: localCard.filePath });
      }
      if (localCard.updatedAt > mapping.lastSync) {
        actions.push({
          type: "updateNote",
          ankiNoteId: mapping.ankiNoteId,
          front: localCard.front,
          back: localCard.back,
          uuid,
          filePath: localCard.filePath,
          card: localCard,
        });
      }
    }
  }

  return { actions };
}
