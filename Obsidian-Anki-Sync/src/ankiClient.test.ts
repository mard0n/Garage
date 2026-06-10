import { describe, expect, it } from "vitest";
import { createNote, findNotes, notesInfo, ping } from "./ankiClient";

describe.runIf(await ping())("ankiClient (integration)", () => {
  const uuid = crypto.randomUUID();
  let noteId: number;

  it("createNote creates a note and returns its ID", async () => {
    noteId = await createNote({
      deckName: "Default",
      front: "Test front?",
      back: "Test back!",
      uuid,
    });
    expect(noteId).toBeGreaterThan(0);
  });

  it("findNotes finds the note by UUID", async () => {
    const ids = await findNotes(uuid);
    expect(ids).toContain(noteId);
  });

  it("notesInfo returns correct fields", async () => {
    const infos = await notesInfo([noteId]);
    expect(infos).toHaveLength(1);
    expect(infos[0].fields.Front.value).toBe("Test front?");
    expect(infos[0].fields.Back.value).toBe("Test back!");
    expect(infos[0].fields.UUID.value).toBe(uuid);
  });

  it("findNotes returns empty array for unknown UUID", async () => {
    const ids = await findNotes(crypto.randomUUID());
    expect(ids).toHaveLength(0);
  });
});
