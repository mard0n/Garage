import { describe, expect, it } from "vitest";
import {
  type Mapping,
  type State,
  emptyState,
  findByAnkiId,
  getMapping,
  removeMapping,
  setMapping,
} from "./mappingStore";

const baseMapping: Mapping = {
  ankiNoteId: 12345,
  path: "Frontend/JS/Functions.md",
  front: "What is a closure?",
  back: "A function with its lexical scope",
};

describe("mappingStore", () => {
  describe("emptyState", () => {
    it("returns an empty object", () => {
      expect(emptyState()).toEqual({});
    });
  });

  describe("getMapping", () => {
    it("returns the mapping for an existing UUID", () => {
      const state: State = { "uuid-1": baseMapping };
      expect(getMapping(state, "uuid-1")).toEqual(baseMapping);
    });

    it("returns undefined for a missing UUID", () => {
      expect(getMapping({}, "uuid-1")).toBeUndefined();
    });
  });

  describe("findByAnkiId", () => {
    it("finds a mapping by ankiNoteId", () => {
      const state: State = { "uuid-1": baseMapping };
      const result = findByAnkiId(state, 12345);
      expect(result).toBeDefined();
      expect(result?.[0]).toBe("uuid-1");
      expect(result?.[1]).toEqual(baseMapping);
    });

    it("returns undefined for a missing ankiNoteId", () => {
      expect(findByAnkiId({}, 99999)).toBeUndefined();
    });

    it("returns the first match when multiple mappings share the same ID", () => {
      const state: State = {
        "uuid-a": { ...baseMapping, ankiNoteId: 1 },
        "uuid-b": { ...baseMapping, ankiNoteId: 1 },
      };
      const result = findByAnkiId(state, 1);
      expect(result?.[0]).toBe("uuid-a");
    });
  });

  describe("setMapping", () => {
    it("adds a new mapping", () => {
      const state = setMapping({}, "uuid-1", baseMapping);
      expect(state["uuid-1"]).toEqual(baseMapping);
    });

    it("overwrites an existing mapping", () => {
      const state = setMapping({ "uuid-1": baseMapping }, "uuid-1", {
        ...baseMapping,
        path: "New/Path.md",
      });
      expect(state["uuid-1"].path).toBe("New/Path.md");
    });

    it("does not mutate the original state", () => {
      const original: State = {};
      const next = setMapping(original, "uuid-1", baseMapping);
      expect(original).toEqual({});
      expect(next["uuid-1"]).toEqual(baseMapping);
    });
  });

  describe("removeMapping", () => {
    it("removes an existing mapping", () => {
      const state = removeMapping({ "uuid-1": baseMapping }, "uuid-1");
      expect(state["uuid-1"]).toBeUndefined();
    });

    it("does nothing when UUID does not exist", () => {
      const original: State = { "uuid-1": baseMapping };
      const state = removeMapping(original, "uuid-404");
      expect(state).toEqual(original);
    });

    it("does not mutate the original state", () => {
      const original: State = { "uuid-1": baseMapping };
      const next = removeMapping(original, "uuid-1");
      expect(original["uuid-1"]).toEqual(baseMapping);
      expect(next).toEqual({});
    });
  });
});
