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
};

export type CreateNoteParams = {
  deckName: string;
  front: string;
  back: string;
  uuid: string;
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
