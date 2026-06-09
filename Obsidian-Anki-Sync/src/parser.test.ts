import { describe, expect, it } from "vitest";
import { parseCards } from "./parser";

const singleCard = `\`\`\`anki
id: 8b2c9d11-58f2-49a4-9cb9-53b0f73df887
ankiNoteId: 1839281

[front]

What is a closure?

[/front]

[back]

A closure remembers variables from outer scope.

[/back]
\`\`\``;

describe("parseCards", () => {
  it("parses a single complete card", () => {
    const cards = parseCards(singleCard, "Frontend/JS/Functions.md");
    expect(cards).toHaveLength(1);
    expect(cards[0].uuid).toBe("8b2c9d11-58f2-49a4-9cb9-53b0f73df887");
    expect(cards[0].ankiNoteId).toBe(1839281);
    expect(cards[0].front).toContain("What is a closure?");
    expect(cards[0].back).toContain("A closure remembers");
    expect(cards[0].filePath).toBe("Frontend/JS/Functions.md");
    expect(cards[0].deckPath).toBe("Frontend::JS::Functions");
  });

  it("parses multiple cards in one file", () => {
    const md = `${singleCard}\n\nsome text\n\n${singleCard}`;
    const cards = parseCards(md, "Test.md");
    expect(cards).toHaveLength(2);
  });

  it("handles missing metadata", () => {
    const md = `\`\`\`anki

[front]
Hello
[/front]

[back]
World
[/back]
\`\`\``;
    const cards = parseCards(md, "NoMeta.md");
    expect(cards).toHaveLength(1);
    expect(cards[0].uuid).toBe("");
    expect(cards[0].ankiNoteId).toBeUndefined();
  });

  it("handles missing ankiNoteId only", () => {
    const md = `\`\`\`anki
id: some-uuid

[front]
Hello
[/front]

[back]
World
[/back]
\`\`\``;
    const cards = parseCards(md, "NoAnkiId.md");
    expect(cards).toHaveLength(1);
    expect(cards[0].uuid).toBe("some-uuid");
    expect(cards[0].ankiNoteId).toBeUndefined();
  });

  it("skips malformed blocks silently (missing [/back])", () => {
    const md = `\`\`\`anki

[front]
Hello
[/front]

[back]
World
\`\`\``;
    const cards = parseCards(md, "Malformed.md");
    expect(cards).toHaveLength(0);
  });

  it("skips malformed blocks silently (missing [front])", () => {
    const md = `\`\`\`anki

[back]
World
[/back]
\`\`\``;
    const cards = parseCards(md, "NoFront.md");
    expect(cards).toHaveLength(0);
  });

  it("returns empty array when no anki blocks present", () => {
    const cards = parseCards("# Just a heading\n\nSome text", "Plain.md");
    expect(cards).toHaveLength(0);
  });

  it("computes deck path by replacing / with ::", () => {
    const cards = parseCards(singleCard, "Frontend/Javascript/Functions.md");
    expect(cards[0].deckPath).toBe("Frontend::Javascript::Functions");
  });

  it("respects basePath — files outside basePath return empty", () => {
    const cards = parseCards(singleCard, "Other/Frontend/JS/Functions.md", "Flashcards/");
    expect(cards).toHaveLength(0);
  });

  it("respects basePath — files inside basePath compute relative deck", () => {
    const cards = parseCards(singleCard, "Flashcards/Frontend/JS/Functions.md", "Flashcards/");
    expect(cards).toHaveLength(1);
    expect(cards[0].deckPath).toBe("Frontend::JS::Functions");
  });

  it("preserves blank lines in front/back content", () => {
    const md = `\`\`\`anki

[front]
Line 1

Line 3
[/front]

[back]
Back 1

Back 3
[/back]
\`\`\``;
    const cards = parseCards(md, "BlankLines.md");
    expect(cards[0].front).toBe("Line 1\n\nLine 3");
    expect(cards[0].back).toBe("Back 1\n\nBack 3");
  });

  it("parses inline anki blocks (not separated by blank lines)", () => {
    const md = `some text
\`\`\`anki
[front]
Q
[/front]

[back]
A
[/back]
\`\`\`
more text`;
    const cards = parseCards(md, "Inline.md");
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe("Q");
  });

  it("parses 4-backtick fence with nested 3-backtick code block", () => {
    const md = `\`\`\`\`anki
\`\`\`js
const x = 1;
\`\`\`

[front]
What does this code do?
[/front]

[back]
Declares a variable
[/back]
\`\`\`\``;
    const cards = parseCards(md, "CodeBlock.md");
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toContain("What does this code do?");
    expect(cards[0].back).toBe("Declares a variable");
  });

  it("preserves nested code block content in 4-backtick fence", () => {
    const md = `\`\`\`\`anki
id: nested-test

[front]
Example:

\`\`\`js
console.log("hello");
\`\`\`
[/front]

[back]
Logs hello
[/back]
\`\`\`\``;
    const cards = parseCards(md, "NestedCode.md");
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toContain('console.log("hello")');
  });

  it("parses 5-backtick fence with 4-backtick code inside", () => {
    const md = "`````anki\n````\ntest\n````\n\n[front]\nQ\n[/front]\n\n[back]\nA\n[/back]\n`````";
    const cards = parseCards(md, "FiveBacktick.md");
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe("Q");
  });

  it("treats 2-backtick as not an anki fence", () => {
    const md = "``anki\n[front]\nQ\n[/front]\n\n[back]\nA\n[/back]\n``";
    const cards = parseCards(md, "TwoBacktick.md");
    expect(cards).toHaveLength(0);
  });
});
