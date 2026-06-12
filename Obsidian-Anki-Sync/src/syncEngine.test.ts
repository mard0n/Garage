import { describe, expect, it } from "vitest";
import { type State, emptyState, setMapping } from "./mappingStore";
import type { Card } from "./models";
import { sync } from "./syncEngine";
import type { CreateNoteAction, UpdateNoteAction, UpdatePathAction } from "./syncEngine";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    uuid: "test-uuid",
    ankiNoteId: undefined,
    front: "What is 2+2?",
    back: "4",
    filePath: "Math/Arithmetic.md",
    deckPath: "Obsidian::Math::Arithmetic",
    updatedAt: 1000,
    ...overrides,
  };
}

describe("syncEngine", () => {
  describe("sync", () => {
    it("returns no actions when there are no cards", () => {
      const result = sync([], emptyState());
      expect(result.actions).toEqual([]);
    });

    it("returns createNote for a new card with a UUID", () => {
      const card = makeCard();
      const result = sync([card], emptyState());

      expect(result.actions).toHaveLength(1);
      const action = result.actions[0] as CreateNoteAction;
      expect(action.type).toBe("createNote");
      expect(action.uuid).toBe("test-uuid");
      expect(action.deckName).toBe("Obsidian::Math::Arithmetic");
      expect(action.front).toBe("What is 2+2?");
      expect(action.back).toBe("4");
      expect(action.filePath).toBe("Math/Arithmetic.md");
      expect(action.card).toEqual(card);
    });

    it("skips cards without a UUID", () => {
      const card = makeCard({ uuid: undefined });
      const result = sync([card], emptyState());
      expect(result.actions).toEqual([]);
    });

    it("returns no actions when the card in state has not been updated", () => {
      const card = makeCard({ updatedAt: 500 });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: card.filePath,
        lastSync: 500,
      });

      const result = sync([card], state);
      expect(result.actions).toEqual([]);
    });

    it("only creates actions for new cards when mixing new and existing", () => {
      const existingCard = makeCard({ uuid: "existing-uuid", front: "Old?", updatedAt: 100 });
      const newCard = makeCard({ uuid: "new-uuid", front: "New?" });
      const state = setMapping(emptyState(), "existing-uuid", {
        ankiNoteId: 999,
        path: existingCard.filePath,
        lastSync: 200,
      });

      const result = sync([existingCard, newCard], state);
      expect(result.actions).toHaveLength(1);
      const action = result.actions[0] as CreateNoteAction;
      expect(action.uuid).toBe("new-uuid");
      expect(action.front).toBe("New?");
    });

    it("returns multiple createNote actions for multiple new cards", () => {
      const cardA = makeCard({ uuid: "uuid-a", front: "A?" });
      const cardB = makeCard({ uuid: "uuid-b", front: "B?" });
      const cardC = makeCard({ uuid: "uuid-c", front: "C?" });

      const result = sync([cardA, cardB, cardC], emptyState());
      expect(result.actions).toHaveLength(3);
      expect(result.actions.every((a) => a.type === "createNote")).toBe(true);
    });

    it("returns updateNote when a card in state has been modified (updatedAt > lastSync)", () => {
      const card = makeCard({ front: "Changed content?", updatedAt: 1000 });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: card.filePath,
        lastSync: 500,
      });

      const result = sync([card], state);
      expect(result.actions).toHaveLength(1);
      const action = result.actions[0] as UpdateNoteAction;
      expect(action.type).toBe("updateNote");
      expect(action.ankiNoteId).toBe(12345);
      expect(action.front).toBe("Changed content?");
      expect(action.back).toBe("4");
      expect(action.uuid).toBe("test-uuid");
      expect(action.filePath).toBe("Math/Arithmetic.md");
      expect(action.card).toEqual(card);
    });

    it("returns no action when updatedAt equals lastSync", () => {
      const card = makeCard({ updatedAt: 500 });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: card.filePath,
        lastSync: 500,
      });

      const result = sync([card], state);
      expect(result.actions).toEqual([]);
    });

    it("returns no action when updatedAt is less than lastSync", () => {
      const card = makeCard({ updatedAt: 100 });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: card.filePath,
        lastSync: 500,
      });

      const result = sync([card], state);
      expect(result.actions).toEqual([]);
    });

    it("correctly classifies a mix of toCreate, toUpdate, and unchanged cards", () => {
      const newCard = makeCard({ uuid: "new-uuid", front: "New?" });
      const updatedCard = makeCard({
        uuid: "updated-uuid",
        front: "Updated?",
        updatedAt: 1000,
      });
      const unchangedCard = makeCard({
        uuid: "unchanged-uuid",
        front: "Same?",
        updatedAt: 100,
      });

      const state = setMapping(
        setMapping(
          setMapping(emptyState(), "updated-uuid", {
            ankiNoteId: 1,
            path: updatedCard.filePath,
            lastSync: 500,
          }),
          "unchanged-uuid",
          {
            ankiNoteId: 2,
            path: unchangedCard.filePath,
            lastSync: 200,
          },
        ),
        "other-uuid",
        { ankiNoteId: 3, path: "Other.md", lastSync: 0 },
      );

      const result = sync([newCard, updatedCard, unchangedCard], state);
      expect(result.actions).toHaveLength(2);

      const createAction = result.actions.find((a) => a.type === "createNote") as CreateNoteAction;
      expect(createAction).toBeDefined();
      expect(createAction.uuid).toBe("new-uuid");

      const updateAction = result.actions.find((a) => a.type === "updateNote") as UpdateNoteAction;
      expect(updateAction).toBeDefined();
      expect(updateAction.uuid).toBe("updated-uuid");
      expect(updateAction.front).toBe("Updated?");
    });

    it("returns updatePath when a card's filePath differs from mapping.path", () => {
      const card = makeCard({ filePath: "Math/Algebra.md", updatedAt: 500 });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: "Math/Arithmetic.md",
        lastSync: 500,
      });

      const result = sync([card], state);
      expect(result.actions).toHaveLength(1);
      const action = result.actions[0] as UpdatePathAction;
      expect(action.type).toBe("updatePath");
      expect(action.uuid).toBe("test-uuid");
      expect(action.filePath).toBe("Math/Algebra.md");
    });

    it("returns updatePath + updateNote when file moved and content changed", () => {
      const card = makeCard({
        filePath: "Math/Algebra.md",
        front: "Changed?",
        updatedAt: 1000,
      });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: "Math/Arithmetic.md",
        lastSync: 500,
      });

      const result = sync([card], state);
      expect(result.actions).toHaveLength(2);

      const pathAction = result.actions.find((a) => a.type === "updatePath") as UpdatePathAction;
      expect(pathAction).toBeDefined();
      expect(pathAction.filePath).toBe("Math/Algebra.md");

      const updateAction = result.actions.find((a) => a.type === "updateNote") as UpdateNoteAction;
      expect(updateAction).toBeDefined();
      expect(updateAction.front).toBe("Changed?");
    });

    it("does not mutate the input state", () => {
      const card = makeCard();
      const state = emptyState();
      const before = JSON.stringify(state);

      sync([card], state);

      expect(JSON.stringify(state)).toBe(before);
    });
  });
});
