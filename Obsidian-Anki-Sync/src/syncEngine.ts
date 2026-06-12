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

export type SyncAction = CreateNoteAction;

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
    }
  }

  return { actions };
}
