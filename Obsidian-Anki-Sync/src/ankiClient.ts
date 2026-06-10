const ANKI_CONNECT_URL = "http://localhost:8765";

async function request(action: string, params: Record<string, unknown> = {}) {
  const res = await fetch(ANKI_CONNECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params }),
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(body.error);
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
  fields: Record<string, { value: string }>;
  cards: number[];
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
  return request("findNotes", { query: `UUID:${uuid}` });
}

export async function notesInfo(noteIds: number[]): Promise<NoteInfo[]> {
  return request("notesInfo", { notes: noteIds });
}

export async function createNote(params: CreateNoteParams): Promise<number> {
  return request("addNote", {
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
}

export async function updateNoteFields(params: UpdateNoteFieldsParams): Promise<null> {
  const fields: Record<string, string> = {};
  if (params.front !== undefined) fields.Front = params.front;
  if (params.back !== undefined) fields.Back = params.back;
  if (params.uuid !== undefined) fields.UUID = params.uuid;
  return request("updateNoteFields", { note: { id: params.noteId, fields } });
}

export async function deleteNotes(noteIds: number[]): Promise<null> {
  return request("deleteNotes", { notes: noteIds });
}

export async function deckNames(): Promise<string[]> {
  return request("deckNames");
}

export async function createDeck(name: string): Promise<null> {
  return request("createDeck", { deck: name });
}

export async function changeDeck(cards: number[], deckName: string): Promise<null> {
  return request("changeDeck", { cards, deck: deckName });
}
