import type {
  CardInfo,
  CreateNoteParams,
  NoteInfo,
  UpdateNoteFieldsParams,
} from "./ankiClient";
import type { Mapping, State } from "./mappingStore";
import type { Card } from "./models";

export type SyncResult = {};

export type AnkiClientDeps = {
  findNotes: (uuid: string) => Promise<number[]>;
  notesInfo: (noteIds: number[]) => Promise<NoteInfo[]>;
  createNote: (params: CreateNoteParams) => Promise<number>;
  updateNoteFields: (params: UpdateNoteFieldsParams) => Promise<null>;
  deleteNotes: (noteIds: number[]) => Promise<null>;
  ensureDeck: (name: string) => Promise<void>;
  ensureModel: () => Promise<void>;
  changeDeck: (cards: number[], deckName: string) => Promise<null>;
  deckNames: () => Promise<string[]>;
  findCards: (query: string) => Promise<number[]>;
  cardsInfo: (cardIds: number[]) => Promise<CardInfo[]>;
  addTags: (noteIds: number[], tags: string) => Promise<null>;
  deleteDecks: (decks: string[]) => Promise<null>;
  findNotesByQuery: (query: string) => Promise<number[]>;
};

// ─── Main sync ───
export async function sync(
  localCards: Card[],
  state: State,
  ankiClient: AnkiClientDeps,
  rootDeck = "",
): Promise<SyncResult> {
  for (const localCard of localCards) {
    if (state[localCard.uuid]) {
    } else {
    }
  }
  return {};
}
