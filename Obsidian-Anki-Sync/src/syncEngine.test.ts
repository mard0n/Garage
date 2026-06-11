import { describe, expect, it, vi } from "vitest";
import type { NoteInfo } from "./ankiClient";
import type { Mapping, State } from "./mappingStore";
import type { Card } from "./models";
import { generateUuid, sync } from "./syncEngine";
import type { AnkiDeps } from "./syncEngine";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    uuid: "",
    ankiNoteId: undefined,
    front: "Test front?",
    back: "Test back.",
    filePath: "Default/Deck.md",
    deckPath: "Default::Deck",
    updatedAt: 1000,
    ...overrides,
  };
}

function makeMapping(overrides: Partial<Mapping> = {}): Mapping {
  return {
    ankiNoteId: 5000,
    path: "Default/Deck.md",
    lastSync: 500,
    ...overrides,
  };
}

function makeNoteInfo(
  noteId: number,
  front: string,
  back: string,
  uuid: string,
  cards: number[] = [],
): NoteInfo {
  return {
    noteId,
    fields: {
      Front: { value: front },
      Back: { value: back },
      UUID: { value: uuid },
    },
    cards,
  };
}

type ExistingNote = {
  noteId: number;
  front: string;
  back: string;
  cards: number[];
};

function makeDeps(existing: Record<string, ExistingNote> = {}): AnkiDeps {
  const notes: Record<string, ExistingNote> = { ...existing };

  const notesByNoteId = new Map(Object.values(notes).map((n) => [n.noteId, n]));

  let nextNoteId = 10001;

  return {
    findNotes: vi.fn().mockImplementation((uuid: string) => {
      const note = notes[uuid];
      return note ? [note.noteId] : [];
    }),
    notesInfo: vi.fn().mockImplementation((noteIds: number[]) => {
      return noteIds
        .map((id) => notesByNoteId.get(id))
        .filter((n): n is ExistingNote => n !== undefined)
        .map((n) => makeNoteInfo(n.noteId, n.front, n.back, "", n.cards));
    }),
    createNote: vi
      .fn()
      .mockImplementation(async (params: { uuid: string; front: string; back: string }) => {
        const noteId = nextNoteId++;
        const entry = { noteId, front: params.front, back: params.back, cards: [] };
        notes[params.uuid] = entry;
        notesByNoteId.set(noteId, entry);
        return noteId;
      }),
    updateNoteFields: vi.fn().mockResolvedValue(null),
    deleteNotes: vi.fn().mockResolvedValue(null),
    ensureDeck: vi.fn().mockResolvedValue(undefined),
    ensureModel: vi.fn().mockResolvedValue(undefined),
    changeDeck: vi.fn().mockResolvedValue(null),
    deckNames: vi.fn().mockResolvedValue([]),
    findCards: vi.fn().mockResolvedValue([]),
    deleteDecks: vi.fn().mockResolvedValue(null),
    findNotesByQuery: vi.fn().mockResolvedValue([]),
    cardsInfo: vi.fn().mockResolvedValue([]),
    addTags: vi.fn().mockResolvedValue(null),
  };
}

describe("sync", () => {
  describe("Phase 1 — Obsidian → Anki", () => {
    it("creates a new note in Anki for a card without mapping", async () => {
      const card = makeCard({ uuid: "new-uuid" });
      const deps = makeDeps();

      const result = await sync([card], {}, deps);

      expect(deps.createNote).toHaveBeenCalledTimes(1);
      expect(deps.createNote).toHaveBeenCalledWith({
        deckName: "Default::Deck",
        front: "Test front?",
        back: "Test back.",
        uuid: "new-uuid",
      });
      expect(result.newState["new-uuid"].ankiNoteId).toBe(10001);
      expect(result.summary.created).toBe(1);
    });

    it("recovers mapping when note already exists in Anki on first sync", async () => {
      const uuid = "recover-uuid";
      const card = makeCard({ uuid });
      const deps = makeDeps({
        [uuid]: { noteId: 9999, front: "Test front?", back: "Test back.", cards: [] },
      });

      const result = await sync([card], {}, deps);

      expect(deps.createNote).not.toHaveBeenCalled();
      expect(result.newState[uuid].ankiNoteId).toBe(9999);
      expect(result.summary.created).toBe(0);
    });

    it("updates Anki note fields when card content changed", async () => {
      const uuid = "update-uuid";
      const card = makeCard({ uuid, ankiNoteId: 5000, updatedAt: 2000 });
      const state: State = { [uuid]: makeMapping({ lastSync: 1000 }) };
      const deps = makeDeps({
        [uuid]: { noteId: 5000, front: "Test front?", back: "Test back.", cards: [] },
      });

      const result = await sync([card], state, deps);

      expect(deps.updateNoteFields).toHaveBeenCalledTimes(1);
      expect(deps.updateNoteFields).toHaveBeenCalledWith({
        noteId: 5000,
        front: "Test front?",
        back: "Test back.",
      });
      expect(result.newState[uuid].lastSync).toBeGreaterThan(1000);
      expect(result.summary.updated).toBe(1);
    });

    it("does nothing for an unchanged card", async () => {
      const uuid = "unchanged-uuid";
      const card = makeCard({ uuid, ankiNoteId: 5000, updatedAt: 500 });
      const state: State = { [uuid]: makeMapping({ lastSync: 500 }) };
      const deps = makeDeps({
        [uuid]: { noteId: 5000, front: "Test front?", back: "Test back.", cards: [] },
      });

      const result = await sync([card], state, deps);

      expect(deps.updateNoteFields).not.toHaveBeenCalled();
      expect(result.newState[uuid].lastSync).toBe(500);
      expect(result.summary.updated).toBe(0);
    });

    it("deletes Anki note when card removed from Obsidian", async () => {
      const uuid = "delete-uuid";
      const state: State = { [uuid]: makeMapping() };
      const deps = makeDeps();

      const result = await sync([], state, deps);

      expect(deps.deleteNotes).toHaveBeenCalledTimes(1);
      expect(deps.deleteNotes).toHaveBeenCalledWith([5000]);
      expect(result.newState[uuid]).toBeUndefined();
      expect(result.summary.deleted).toBe(1);
    });
  });

  describe("Phase 2 — Anki → Obsidian", () => {
    it("pulls card from Anki when only Anki changed", async () => {
      const uuid = "pull-uuid";
      const card = makeCard({
        uuid,
        ankiNoteId: 5000,
        front: "Old front?",
        back: "Old back.",
        updatedAt: 500,
      });
      const state: State = { [uuid]: makeMapping({ lastSync: 1000 }) };
      const deps = makeDeps({
        [uuid]: { noteId: 5000, front: "New front?", back: "New back.", cards: [] },
      });

      const result = await sync([card], state, deps);

      expect(result.pullFromAnki).toHaveLength(1);
      expect(result.pullFromAnki[0]).toMatchObject({
        uuid,
        ankiNoteId: 5000,
        front: "New front?",
        back: "New back.",
        filePath: "Default/Deck.md",
      });
      expect(result.summary.pulled).toBe(1);
    });

    it("does not pull when both sides changed (Obsidian wins)", async () => {
      const uuid = "conflict-uuid";
      const card = makeCard({
        uuid,
        ankiNoteId: 5000,
        front: "Obsidian changed front?",
        updatedAt: 2000,
      });
      const state: State = { [uuid]: makeMapping({ lastSync: 1000 }) };
      const deps = makeDeps({
        [uuid]: { noteId: 5000, front: "Anki changed front!", back: "Test back.", cards: [] },
      });

      const result = await sync([card], state, deps);

      expect(deps.updateNoteFields).toHaveBeenCalled();
      expect(result.pullFromAnki).toHaveLength(0);
      expect(result.summary.updated).toBe(1);
    });

    it("detects card deleted from Anki", async () => {
      const uuid = "anki-deleted-uuid";
      const card = makeCard({ uuid, ankiNoteId: 5000, updatedAt: 500 });
      const state: State = { [uuid]: makeMapping({ lastSync: 1000 }) };
      const deps = makeDeps();

      const result = await sync([card], state, deps);

      expect(result.uuidsDeletedFromAnki).toContain(uuid);
      expect(result.newState[uuid]).toBeUndefined();
      expect(result.summary.removed).toBe(1);
    });
  });

  describe("Phase 3 — orphan discovery", () => {
    it("discovers orphaned Anki notes and returns them as pulls", async () => {
      const deps = makeDeps();
      deps.findCards = vi.fn().mockResolvedValue([111, 222]);
      deps.cardsInfo = vi.fn().mockResolvedValue([
        {
          cardId: 111,
          note: 5001,
          deckName: "TestRoot::Folder::Note",
          modelName: "Basic-Obsidian",
          fields: {
            Front: { value: "Orphan front?" },
            Back: { value: "Orphan back." },
            UUID: { value: "orphan-uuid-1" },
          },
        },
        {
          cardId: 222,
          note: 5002,
          deckName: "TestRoot::OrphanTopLevel",
          modelName: "Basic-Obsidian",
          fields: {
            Front: { value: "Top-level front?" },
            Back: { value: "Top-level back." },
            UUID: { value: "orphan-uuid-2" },
          },
        },
      ]);

      const result = await sync([], {}, deps, "TestRoot");

      expect(result.pullFromAnki).toHaveLength(2);

      expect(result.pullFromAnki[0]).toMatchObject({
        uuid: "orphan-uuid-1",
        ankiNoteId: 5001,
        filePath: "Folder/Note.md",
        deckPath: "TestRoot::Folder::Note",
        front: "Orphan front?",
        back: "Orphan back.",
      });

      expect(result.pullFromAnki[1]).toMatchObject({
        uuid: "orphan-uuid-2",
        ankiNoteId: 5002,
        filePath: "OrphanTopLevel.md",
        deckPath: "TestRoot::OrphanTopLevel",
        front: "Top-level front?",
        back: "Top-level back.",
      });

      expect(result.newState["orphan-uuid-1"]).toBeDefined();
      expect(result.newState["orphan-uuid-1"].ankiNoteId).toBe(5001);
      expect(result.newState["orphan-uuid-2"]).toBeDefined();
      expect(result.newState["orphan-uuid-2"].ankiNoteId).toBe(5002);
    });

    it("generates UUID and adds tag for cards without UUID fields during discovery", async () => {
      const deps = makeDeps();
      deps.findCards = vi.fn().mockResolvedValue([333]);
      deps.cardsInfo = vi.fn().mockResolvedValue([
        {
          cardId: 333,
          note: 5003,
          deckName: "TestRoot::NoUuid",
          modelName: "Basic",
          fields: {
            Front: { value: "Front?" },
            Back: { value: "Back." },
          },
        },
      ]);

      const result = await sync([], {}, deps, "TestRoot");

      expect(result.pullFromAnki).toHaveLength(1);
      expect(result.pullFromAnki[0]).toMatchObject({
        ankiNoteId: 5003,
        filePath: "NoUuid.md",
        deckPath: "TestRoot::NoUuid",
        front: "Front?",
        back: "Back.",
      });
      expect(result.pullFromAnki[0].uuid).toBeTruthy();
      expect(deps.addTags).toHaveBeenCalledWith([5003], `obsidian-sync::${result.pullFromAnki[0].uuid}`);
    });

    it("skips cards when addTags fails", async () => {
      const deps = makeDeps();
      deps.findCards = vi.fn().mockResolvedValue([333]);
      deps.cardsInfo = vi.fn().mockResolvedValue([
        {
          cardId: 333,
          note: 5003,
          deckName: "TestRoot::NoUuid",
          modelName: "Basic",
          fields: {
            Front: { value: "Front?" },
            Back: { value: "Back." },
          },
        },
      ]);
      deps.addTags = vi.fn().mockRejectedValue(new Error("API error"));

      const result = await sync([], {}, deps, "TestRoot");

      expect(result.pullFromAnki).toHaveLength(0);
      expect(result.newState).toEqual({});
    });

    it("skips known UUIDs during discovery", async () => {
      const deps = makeDeps();
      deps.findCards = vi.fn().mockResolvedValue([444]);
      deps.cardsInfo = vi.fn().mockResolvedValue([
        {
          cardId: 444,
          note: 5004,
          deckName: "TestRoot::Known",
          modelName: "Basic-Obsidian",
          fields: {
            Front: { value: "Front?" },
            Back: { value: "Back." },
            UUID: { value: "already-known-uuid" },
          },
        },
      ]);

      // Seed state so that "already-known-uuid" is in knownUuids
      const state: State = {
        "already-known-uuid": makeMapping({ ankiNoteId: 5004 }),
      };

      const result = await sync([], state, deps, "TestRoot");

      expect(result.pullFromAnki).toHaveLength(0);
    });

    it("skips discovery when rootDeck is empty", async () => {
      const deps = makeDeps();
      deps.findCards = vi.fn().mockResolvedValue([555]);
      deps.cardsInfo = vi.fn().mockResolvedValue([
        {
          cardId: 555,
          note: 5005,
          deckName: "SomeDeck",
          modelName: "Basic-Obsidian",
          fields: {
            Front: { value: "Front?" },
            Back: { value: "Back." },
            UUID: { value: "some-uuid" },
          },
        },
      ]);

      // Empty rootDeck — discovery should be skipped
      const result = await sync([], {}, deps, "");

      expect(deps.findCards).not.toHaveBeenCalled();
      expect(result.pullFromAnki).toHaveLength(0);
    });
  });

  describe("generateUuid", () => {
    it("returns a string", () => {
      const uuid = generateUuid();
      expect(typeof uuid).toBe("string");
      expect(uuid.length).toBeGreaterThan(0);
    });

    it("returns different values on each call", () => {
      const a = generateUuid();
      const b = generateUuid();
      expect(a).not.toBe(b);
    });
  });
});
