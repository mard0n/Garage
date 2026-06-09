import { describe, expect, it } from "vitest";
import type { Card } from "./models";
import { parseCards } from "./parser";
import { serializeCard } from "./serializer";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    uuid: "8b2c9d11-58f2-49a4-9cb9-53b0f73df887",
    ankiNoteId: 1839281,
    front: "What is a closure?",
    back: "A closure remembers outer scope.",
    filePath: "Frontend/JS/Functions.md",
    deckPath: "Frontend::JS::Functions",
    updatedAt: 0,
    ...overrides,
  };
}

describe("serializeCard", () => {
  it("round-trips a complete card", () => {
    const card = makeCard();
    const md = serializeCard(card);
    const parsed = parseCards(md, card.filePath);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].uuid).toBe(card.uuid);
    expect(parsed[0].ankiNoteId).toBe(card.ankiNoteId);
    expect(parsed[0].front).toBe(card.front);
    expect(parsed[0].back).toBe(card.back);
  });

  it("round-trips a card without ankiNoteId", () => {
    const card = makeCard({ ankiNoteId: undefined });
    const md = serializeCard(card);
    const parsed = parseCards(md, card.filePath);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].ankiNoteId).toBeUndefined();
  });

  it("round-trips a card without uuid", () => {
    const card = makeCard({ uuid: "" });
    const md = serializeCard(card);
    const parsed = parseCards(md, card.filePath);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].uuid).toBe("");
  });

  it("round-trips a card with a 3-backtick code block", () => {
    const card = makeCard({ front: "Example:\n```js\nconst x = 1;\n```" });
    const md = serializeCard(card);
    const parsed = parseCards(md, card.filePath);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].front).toContain("const x = 1");
  });

  it("always uses 4-backtick fence", () => {
    const card = makeCard();
    const md = serializeCard(card);
    expect(md.startsWith("````anki")).toBe(true);
    expect(md.endsWith("````")).toBe(true);
  });

  it("produces expected output", () => {
    const card = makeCard({
      uuid: "test-uuid",
      ankiNoteId: 42,
      front: "Q?",
      back: "A!",
    });
    const md = serializeCard(card);
    expect(md).toBe(
      [
        "````anki",
        "id: test-uuid",
        "ankiNoteId: 42",
        "",
        "[front]",
        "Q?",
        "[/front]",
        "",
        "[back]",
        "A!",
        "[/back]",
        "````",
      ].join("\n"),
    );
  });

  it("preserves multiline content", () => {
    const front = "Line 1\n\nLine 3";
    const back = "Back 1\n\nBack 3";
    const card = makeCard({ front, back });
    const md = serializeCard(card);
    expect(md).toContain("Line 1\n\nLine 3");
    expect(md).toContain("Back 1\n\nBack 3");
  });
});
