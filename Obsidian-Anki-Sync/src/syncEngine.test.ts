import { describe, expect, it } from "vitest";
import { type State, emptyState, setMapping } from "./mappingStore";
import type { Card } from "./models";
import { sync } from "./syncEngine";
import type { CreateNoteAction, UpdateCardAction, DeleteNoteAction, RemoveBlockAction } from "./syncEngine";

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

    it("returns no actions when the card in state matches the mapping", () => {
      const card = makeCard({ updatedAt: 500 });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: card.filePath,
        front: card.front,
        back: card.back,
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
        front: existingCard.front,
        back: existingCard.back,
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

    it("returns updateCard when card content differs from mapping", () => {
      const card = makeCard({ front: "Changed content?" });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: card.filePath,
        front: "What is 2+2?",
        back: "4",
      });

      const result = sync([card], state);
      expect(result.actions).toHaveLength(1);
      const action = result.actions[0] as UpdateCardAction;
      expect(action.type).toBe("updateCard");
      expect(action.uuid).toBe("test-uuid");
      expect(action.filePath).toBe("Math/Arithmetic.md");
      expect(action.card).toEqual(card);
    });

    it("returns no action when card content and path match mapping", () => {
      const card = makeCard({ front: "What is 2+2?" });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: card.filePath,
        front: "What is 2+2?",
        back: "4",
      });

      const result = sync([card], state);
      expect(result.actions).toEqual([]);
    });

    it("returns no action when card content and path match mapping — different values", () => {
      const card = makeCard({ front: "Hello?", back: "World", updatedAt: 100 });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: card.filePath,
        front: "Hello?",
        back: "World",
      });

      const result = sync([card], state);
      expect(result.actions).toEqual([]);
    });

    it("correctly classifies a mix of toCreate, toUpdate, and unchanged cards", () => {
      const newCard = makeCard({ uuid: "new-uuid", front: "New?" });
      const updatedCard = makeCard({
        uuid: "updated-uuid",
        front: "Updated?",
      });
      const unchangedCard = makeCard({
        uuid: "unchanged-uuid",
        front: "Same?",
      });

      const state = setMapping(
        setMapping(
          setMapping(emptyState(), "updated-uuid", {
            ankiNoteId: 1,
            path: updatedCard.filePath,
            front: "Original?",
            back: "4",
          }),
          "unchanged-uuid",
          {
            ankiNoteId: 2,
            path: unchangedCard.filePath,
            front: "Same?",
            back: "4",
          },
        ),
        "other-uuid",
        { ankiNoteId: 3, path: "Other.md", front: "", back: "" },
      );

      const result = sync([newCard, updatedCard, unchangedCard], state);
      expect(result.actions).toHaveLength(4);

      const createAction = result.actions.find((a) => a.type === "createNote") as CreateNoteAction;
      expect(createAction).toBeDefined();
      expect(createAction.uuid).toBe("new-uuid");

      const updateAction = result.actions.find((a) => a.type === "updateCard") as UpdateCardAction;
      expect(updateAction).toBeDefined();
      expect(updateAction.uuid).toBe("updated-uuid");
      expect(updateAction.card.front).toBe("Updated?");

      const deleteAction = result.actions.find((a) => a.type === "deleteNote") as DeleteNoteAction;
      expect(deleteAction).toBeDefined();
      expect(deleteAction.uuid).toBe("other-uuid");

      const removeAction = result.actions.find((a) => a.type === "removeBlock") as RemoveBlockAction;
      expect(removeAction).toBeDefined();
      expect(removeAction.uuid).toBe("other-uuid");
    });

    it("returns updateCard when a card's filePath differs from mapping.path", () => {
      const card = makeCard({ filePath: "Math/Algebra.md" });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: "Math/Arithmetic.md",
        front: card.front,
        back: card.back,
      });

      const result = sync([card], state);
      expect(result.actions).toHaveLength(1);
      const action = result.actions[0] as UpdateCardAction;
      expect(action.type).toBe("updateCard");
      expect(action.uuid).toBe("test-uuid");
      expect(action.filePath).toBe("Math/Algebra.md");
      expect(action.card).toEqual(card);
    });

    it("returns a single updateCard when file moved and content changed", () => {
      const card = makeCard({
        filePath: "Math/Algebra.md",
        front: "Changed?",
      });
      const state = setMapping(emptyState(), "test-uuid", {
        ankiNoteId: 12345,
        path: "Math/Arithmetic.md",
        front: "What is 2+2?",
        back: "4",
      });

      const result = sync([card], state);
      expect(result.actions).toHaveLength(1);

      const action = result.actions[0] as UpdateCardAction;
      expect(action.type).toBe("updateCard");
      expect(action.filePath).toBe("Math/Algebra.md");
      expect(action.card).toEqual(card);
    });

    it("returns deleteNote + removeBlock when a UUID is in state but not in local cards", () => {
      const state = setMapping(emptyState(), "deleted-uuid", {
        ankiNoteId: 999,
        path: "Old/File.md",
        front: "",
        back: "",
      });

      const result = sync([], state);
      expect(result.actions).toHaveLength(2);

      const deleteAction = result.actions.find((a) => a.type === "deleteNote") as DeleteNoteAction;
      expect(deleteAction).toBeDefined();
      expect(deleteAction.ankiNoteId).toBe(999);
      expect(deleteAction.uuid).toBe("deleted-uuid");

      const removeAction = result.actions.find((a) => a.type === "removeBlock") as RemoveBlockAction;
      expect(removeAction).toBeDefined();
      expect(removeAction.filePath).toBe("Old/File.md");
      expect(removeAction.uuid).toBe("deleted-uuid");
    });

    it("returns delete actions for all state entries not in local cards", () => {
      const state = setMapping(
        setMapping(emptyState(), "uuid-a", {
          ankiNoteId: 1,
          path: "A.md",
          front: "",
          back: "",
        }),
        "uuid-b",
        { ankiNoteId: 2, path: "B.md", front: "", back: "" },
      );

      const result = sync([], state);
      expect(result.actions).toHaveLength(4);
      expect(result.actions.filter((a) => a.type === "deleteNote")).toHaveLength(2);
      expect(result.actions.filter((a) => a.type === "removeBlock")).toHaveLength(2);
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
