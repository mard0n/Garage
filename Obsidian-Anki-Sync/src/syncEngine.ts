import type {
  CardInfo,
  CreateNoteParams,
  NoteInfo,
  UpdateNoteFieldsParams,
} from "./ankiClient";
import type { Mapping, State } from "./mappingStore";
import type { Card } from "./models";

export type AnkiDeps = {
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

export type PullCard = {
  uuid: string;
  filePath: string;
  deckPath: string;
  front: string;
  back: string;
  ankiNoteId: number;
};

export type SyncSummary = {
  created: number;
  updated: number;
  deleted: number;
  pulled: number;
  removed: number;
};

export type SyncResult = {
  newState: State;
  pullFromAnki: PullCard[];
  uuidsDeletedFromAnki: string[];
  summary: SyncSummary;
};

export function generateUuid(): string {
  return crypto.randomUUID();
}

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

function deckPathToFilePath(deckPath: string, rootDeck: string): string {
  const prefix = rootDeck ? `${rootDeck}::` : "";
  if (deckPath.startsWith(prefix)) {
    return deckPath.slice(prefix.length).replace(/::/g, "/") + ".md";
  }
  return deckPath.replace(/::/g, "/") + ".md";
}

// ─── Pure helpers (no I/O) ───

type CardWithMapping = { card: Card; mapping: Mapping };

function assignUuids(cards: Card[]): Map<string, Card> {
  const map = new Map<string, Card>();
  for (const card of cards) {
    if (!card.uuid) card.uuid = generateUuid();
    map.set(card.uuid, card);
  }
  return map;
}

function categorize(
  state: State,
  localByUuid: Map<string, Card>,
): {
  toCreate: Card[];
  toUpdate: CardWithMapping[];
  toDelete: Array<{ uuid: string; mapping: Mapping }>;
  unchanged: CardWithMapping[];
} {
  const toCreate: Card[] = [];
  const toUpdate: CardWithMapping[] = [];
  const unchanged: CardWithMapping[] = [];
  const remaining = new Map(Object.entries(state));

  for (const [uuid, card] of localByUuid) {
    const mapping = remaining.get(uuid);
    if (!mapping) {
      toCreate.push(card);
    } else {
      remaining.delete(uuid);
      if (card.updatedAt > mapping.lastSync) {
        toUpdate.push({ card, mapping });
      } else {
        unchanged.push({ card, mapping });
      }
    }
  }

  const toDelete = [...remaining.entries()].map(([uuid, mapping]) => ({
    uuid,
    mapping,
  }));

  return { toCreate, toUpdate, toDelete, unchanged };
}

function buildNewState(
  state: State,
  toUpdate: CardWithMapping[],
  unchanged: CardWithMapping[],
  createdMappings: Array<{ uuid: string; mapping: Mapping }>,
): State {
  const newState: State = {};

  for (const { card, mapping } of toUpdate) {
    newState[card.uuid] = {
      ...mapping,
      path: card.filePath,
      lastSync: Date.now(),
    };
  }

  for (const { card, mapping } of unchanged) {
    newState[card.uuid] = { ...mapping, path: card.filePath };
  }

  for (const { uuid, mapping } of createdMappings) {
    newState[uuid] = mapping;
  }

  for (const [uuid, mapping] of Object.entries(state)) {
    if (!newState[uuid]) {
      newState[uuid] = { ...mapping };
    }
  }

  return newState;
}

// ─── I/O helpers (call Anki) ───

async function recoverNoteId(
  card: Card,
  deps: AnkiDeps,
): Promise<number | null> {
  if (!card.uuid) return null;
  const ids = await deps.findNotes(card.uuid);
  return ids.length > 0 ? ids[0] : null;
}

async function pushUpdate(
  card: Card,
  mapping: Mapping,
  deps: AnkiDeps,
  rootDeck: string,
): Promise<boolean> {
  try {
    await deps.updateNoteFields({
      noteId: mapping.ankiNoteId,
      front: card.front,
      back: card.back,
    });

    const oldDeck = filePathToDeckPath(mapping.path, rootDeck);
    if (oldDeck !== card.deckPath) {
      const infos = await deps.notesInfo([mapping.ankiNoteId]);
      if (infos.length > 0 && infos[0].cards.length > 0) {
        await deps.changeDeck(infos[0].cards, card.deckPath);
      }
    }

    return true;
  } catch {
    return false;
  }
}

async function checkRemote(
  uuid: string,
  mapping: Mapping,
  localCard: Card | undefined,
  deps: AnkiDeps,
  rootDeck: string,
): Promise<{ pull: PullCard | null; deleted: boolean }> {
  const ids = await deps.findNotes(uuid);
  if (ids.length === 0) return { pull: null, deleted: true };

  const infos = await deps.notesInfo(ids);
  if (infos.length === 0) return { pull: null, deleted: true };

  const remoteFront = infos[0].fields.Front?.value ?? "";
  const remoteBack = infos[0].fields.Back?.value ?? "";

  const ankiNoteId = ids[0];

  if (!localCard) {
    return {
      pull: {
        uuid,
        ankiNoteId,
        filePath: mapping.path,
        deckPath: filePathToDeckPath(mapping.path, rootDeck),
        front: remoteFront,
        back: remoteBack,
      },
      deleted: false,
    };
  }

  const changed =
    remoteFront !== localCard.front || remoteBack !== localCard.back;
  if (changed && localCard.updatedAt <= mapping.lastSync) {
    return {
      pull: {
        uuid,
        ankiNoteId,
        filePath: localCard.filePath,
        deckPath: localCard.deckPath,
        front: remoteFront,
        back: remoteBack,
      },
      deleted: false,
    };
  }

  return { pull: null, deleted: false };
}

// ─── Main sync ───

export async function sync(
  localCards: Card[],
  state: State,
  deps: AnkiDeps,
  rootDeck = "",
): Promise<SyncResult> {
  const localByUuid = assignUuids(localCards);
  const { toCreate, toUpdate, toDelete, unchanged } = categorize(
    state,
    localByUuid,
  );

  // Ensure note type exists (best-effort)
  try {
    await deps.ensureModel();
  } catch {
    // Non-fatal — user may need to create the model manually
  }

  // Pass A: Push local changes to Anki
  const pushedUuids = new Set<string>();
  const createdMappings: Array<{ uuid: string; mapping: Mapping }> = [];
  let createdCount = 0;

  // Ensure all target decks exist before creating notes
  const neededDecks = new Set([
    ...toCreate.map((c) => c.deckPath),
    ...toUpdate.map(({ card }) => card.deckPath),
  ]);
  for (const deck of neededDecks) {
    await deps.ensureDeck(deck);
  }

  for (const card of toCreate) {
    const existingId = await recoverNoteId(card, deps);
    if (existingId !== null) {
      createdMappings.push({
        uuid: card.uuid,
        mapping: {
          ankiNoteId: existingId,
          path: card.filePath,
          lastSync: Date.now(),
        },
      });
    } else {
      const noteId = await deps.createNote({
        deckName: card.deckPath,
        front: card.front,
        back: card.back,
        uuid: card.uuid,
      });
      createdMappings.push({
        uuid: card.uuid,
        mapping: {
          ankiNoteId: noteId,
          path: card.filePath,
          lastSync: Date.now(),
        },
      });
      createdCount++;
    }
    pushedUuids.add(card.uuid);
  }

  for (const { card, mapping } of toUpdate) {
    const ok = await pushUpdate(card, mapping, deps, rootDeck);
    if (!ok) {
      const noteId = await deps.createNote({
        deckName: card.deckPath,
        front: card.front,
        back: card.back,
        uuid: card.uuid,
      });
      mapping.ankiNoteId = noteId;
    }
    pushedUuids.add(card.uuid);
  }

  for (const { mapping } of toDelete) {
    if (mapping.ankiNoteId != null) {
      await deps.deleteNotes([mapping.ankiNoteId]);
    }
  }

  // Pass B: Check remaining cards against Anki
  const newState = buildNewState(state, toUpdate, unchanged, createdMappings);
  const pullFromAnki: PullCard[] = [];
  const uuidsDeletedFromAnki: string[] = [];

  for (const [uuid, mapping] of Object.entries(newState)) {
    if (pushedUuids.has(uuid)) continue;

    const localCard = localByUuid.get(uuid);
    const { pull, deleted } = await checkRemote(
      uuid,
      mapping,
      localCard,
      deps,
      rootDeck,
    );

    if (deleted) {
      uuidsDeletedFromAnki.push(uuid);
      delete newState[uuid];
    } else if (pull) {
      pullFromAnki.push(pull);
    }
  }

  // Pass C: Discover orphaned Anki notes (no matching Obsidian file/mapping)
  if (rootDeck) {
    try {
      const orphanCardIds = await deps.findCards(`deck:"${rootDeck.replace(/"/g, '""')}"`);
      const knownUuids = new Set([
        ...pushedUuids,
        ...uuidsDeletedFromAnki,
        ...pullFromAnki.map((p) => p.uuid),
      ]);

      for (let i = 0; i < orphanCardIds.length; i += 100) {
        const chunk = orphanCardIds.slice(i, i + 100);
        const cardInfos = await deps.cardsInfo(chunk);
        for (const info of cardInfos) {
          if (!info.note) continue;
          let uuid = info.fields?.UUID?.value;
          if (!uuid) {
            uuid = generateUuid();
            try {
              await deps.addTags([info.note], `obsidian-sync::${uuid}`);
            } catch {
              continue;
            }
          }
          if (knownUuids.has(uuid)) continue;

          const filePath = deckPathToFilePath(info.deckName, rootDeck);
          knownUuids.add(uuid);
          pullFromAnki.push({
            uuid,
            ankiNoteId: info.note,
            filePath,
            deckPath: info.deckName,
            front: info.fields.Front?.value ?? "",
            back: info.fields.Back?.value ?? "",
          });
          newState[uuid] = {
            ankiNoteId: info.note,
            path: filePath,
            lastSync: Date.now(),
          };
        }
      }
    } catch {
      // Non-fatal — discovery may fail if AnkiConnect version differs
    }
  }

  // Pass D: Clean up empty plugin-managed decks
  if (rootDeck) {
    try {
      const allDecks = await deps.deckNames();
      for (const deck of allDecks) {
        if (!deck.startsWith(`${rootDeck}::`)) continue;
        const cards = await deps.findCards(`deck:"${deck.replace(/"/g, '""')}"`);
        if (cards.length === 0) {
          await deps.deleteDecks([deck]);
        }
      }
    } catch {
      // Non-fatal — deleteDecks or findCards may not be available
    }
  }

  return {
    newState,
    pullFromAnki,
    uuidsDeletedFromAnki,
    summary: {
      created: createdCount,
      updated: toUpdate.length,
      deleted: toDelete.length,
      pulled: pullFromAnki.length,
      removed: uuidsDeletedFromAnki.length,
    },
  };
}
