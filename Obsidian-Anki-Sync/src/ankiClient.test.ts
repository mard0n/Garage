import { describe, expect, it } from "vitest";
import {
  changeDeck,
  createDeck,
  createNote,
  deckNames,
  deleteNotes,
  findNotes,
  notesInfo,
  ping,
  updateNoteFields,
} from "./ankiClient";

const isOnline = await ping();

if (isOnline) {
  describe("ankiClient (integration)", () => {
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

    it("updateNoteFields updates front and back", async () => {
      await updateNoteFields({
        noteId,
        front: "Updated front?",
        back: "Updated back!",
      });
      const infos = await notesInfo([noteId]);
      expect(infos[0].fields.Front.value).toBe("Updated front?");
      expect(infos[0].fields.Back.value).toBe("Updated back!");
      expect(infos[0].fields.UUID.value).toBe(uuid);
    });

    it("deleteNotes removes the note", async () => {
      await deleteNotes([noteId]);
      const ids = await findNotes(uuid);
      expect(ids).toHaveLength(0);
    });

    it("findNotes returns empty array for unknown UUID", async () => {
      const ids = await findNotes(crypto.randomUUID());
      expect(ids).toHaveLength(0);
    });
  });

  describe("ankiClient — decks", () => {
    const testDeck = `Test-Deck-${Date.now()}`;
    const deckNoteUuid = crypto.randomUUID();
    let deckNoteId: number;

    it("deckNames returns at least Default", async () => {
      const names = await deckNames();
      expect(names).toContain("Default");
    });

    it("createDeck creates a new deck", async () => {
      await createDeck(testDeck);
      const names = await deckNames();
      expect(names).toContain(testDeck);
    });

    it("changeDeck moves a note to the new deck", async () => {
      deckNoteId = await createNote({
        deckName: "Default",
        front: "Move test",
        back: "Moving decks",
        uuid: deckNoteUuid,
      });
      const info = await notesInfo([deckNoteId]);
      const cardIds = info[0].cards;
      await changeDeck(cardIds, testDeck);
      const ids = await findNotes(deckNoteUuid);
      expect(ids).toContain(deckNoteId);
    });

    it("cleans up test note", async () => {
      if (deckNoteId) {
        await deleteNotes([deckNoteId]);
      }
    });
  });
}
