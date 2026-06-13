const ANKI_CONNECT_URL = "http://localhost:8765";

async function request(action: string, params: Record<string, unknown> = {}) {
  const res = await fetch(ANKI_CONNECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params }),
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(`[${action}] ${body.error}`);
  }
  return body.result;
}

export async function ping(): Promise<boolean> {
  try {
    const result = await request("version");
    return result != null;
  } catch {
    return false;
  }
}

export type NoteInfo = {
  noteId: number;
  modelName: string;
  fields: Record<string, { value: string }>;
  cards: number[];
};

export type CardInfo = {
  cardId: number;
  note: number;
  deckName: string;
  fields: Record<string, { value: string }>;
  modelName: string;
};

export type CreateNoteParams = {
  deckName: string;
  front: string;
  back: string;
  uuid: string;
};

export type UpdateNoteFieldsParams = {
  noteId: number;
  front?: string;
  back?: string;
  uuid?: string;
};

export async function findNotes(uuid: string): Promise<number[]> {
  const result: unknown = await request("findNotes", { query: `UUID:${uuid}` });
  if (Array.isArray(result) && result.length > 0) {
    return result.filter((id): id is number => typeof id === "number");
  }
  const tagResult: unknown = await request("findNotes", { query: `tag:obsidian-sync::${uuid}` });
  if (!Array.isArray(tagResult)) return [];
  return tagResult.filter((id): id is number => typeof id === "number");
}

export async function notesInfo(noteIds: number[]): Promise<NoteInfo[]> {
  return request("notesInfo", { notes: noteIds });
}

export async function createNote(params: CreateNoteParams): Promise<number> {
  const result: unknown = await request("addNote", {
    note: {
      deckName: params.deckName,
      modelName: "Basic-Obsidian",
      fields: {
        Front: params.front,
        Back: params.back,
        UUID: params.uuid,
      },
      options: {
        allowDuplicate: true,
      },
    },
  });
  if (typeof result !== "number") {
    throw new Error(`addNote returned unexpected result: ${String(result)}`);
  }
  return result;
}

export async function updateNoteFields(params: UpdateNoteFieldsParams): Promise<null> {
  const fields: Record<string, string> = {};
  if (params.front !== undefined) fields.Front = params.front;
  if (params.back !== undefined) fields.Back = params.back;
  if (params.uuid !== undefined) fields.UUID = params.uuid;
  return request("updateNoteFields", { note: { id: params.noteId, fields } });
}

export type UpdateNoteModelParams = {
  noteId: number;
  modelName: string;
  front: string;
  back: string;
  uuid: string;
};

export async function updateNoteModel(params: UpdateNoteModelParams): Promise<null> {
  return request("updateNoteModel", {
    note: {
      id: params.noteId,
      modelName: params.modelName,
      fields: {
        Front: params.front,
        Back: params.back,
        UUID: params.uuid,
      },
    },
  });
}

export async function deleteNotes(noteIds: number[]): Promise<null> {
  return request("deleteNotes", { notes: noteIds });
}

export async function addTags(noteIds: number[], tags: string): Promise<null> {
  return request("addTags", { notes: noteIds, tags });
}

export async function deckNames(): Promise<string[]> {
  return request("deckNames");
}

export async function createDeck(name: string): Promise<null> {
  return request("createDeck", { deck: name });
}

export async function ensureDeck(name: string): Promise<void> {
  const names: string[] = await request("deckNames");
  if (!names.includes(name)) {
    await request("createDeck", { deck: name });
  }
}

export async function changeDeck(cards: number[], deckName: string): Promise<null> {
  return request("changeDeck", { cards, deck: deckName });
}

export async function getDecks(cards: number[]): Promise<Record<string, number[]>> {
  return request("getDecks", { cards });
}

export async function findNotesByQuery(query: string): Promise<number[]> {
  const result: unknown = await request("findNotes", { query });
  if (!Array.isArray(result)) return [];
  return result.filter((id): id is number => typeof id === "number");
}

export async function cardsInfo(cardIds: number[]): Promise<CardInfo[]> {
  const result: unknown = await request("cardsInfo", { cards: cardIds });
  if (!Array.isArray(result)) return [];
  return result as CardInfo[];
}

export async function findCards(query: string): Promise<number[]> {
  const result: unknown = await request("findCards", { query });
  if (!Array.isArray(result)) return [];
  return result.filter((id): id is number => typeof id === "number");
}

export async function deleteDecks(decks: string[]): Promise<null> {
  return request("deleteDecks", { decks, cardsToo: true });
}

export async function modelNames(): Promise<string[]> {
  return request("modelNames");
}

export async function createModel(): Promise<null> {
  return request("createModel", {
    modelName: "Basic-Obsidian",
    inOrderFields: ["Front", "Back", "UUID"],
    css: ".card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}",
    cardTemplates: [
      {
        Name: "Card 1",
        Front: "{{Front}}",
        Back: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
      },
    ],
  });
}

export async function ensureModel(): Promise<void> {
  const names: unknown = await request("modelNames");
  if (Array.isArray(names) && names.includes("Basic-Obsidian")) return;

  // Model doesn't exist; try to create it. If creation fails (e.g. incompatible
  // AnkiConnect version), the user can create "Basic-Obsidian" manually with
  // Front, Back, UUID fields.
  try {
    await createModel();
  } catch {
    // Silently ignore — model creation may fail if it's a newer AnkiConnect
    // that handles model creation differently, or if the model already exists
    // but wasn't returned by modelNames.
  }
}
