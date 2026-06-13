import { Component, MarkdownRenderer, MarkdownView, type Plugin } from "obsidian";

export function registerCardRenderer(plugin: Plugin): void {
  plugin.registerMarkdownCodeBlockProcessor("anki", async (source, el, ctx) => {
    const { front, back } = parseCardBlock(source);

    const container = el.createDiv({ cls: "anki-card" });

    // Front section
    const frontSection = container.createDiv({ cls: "anki-card-front" });
    frontSection.createEl("small", { text: "front", cls: "anki-card-label" });
    const frontContent = frontSection.createDiv({ cls: "anki-card-content" });
    const frontComponent = new Component();
    ctx.addChild(frontComponent);
    await MarkdownRenderer.render(plugin.app, front, frontContent, ctx.sourcePath, frontComponent);

    // Back section
    const backSection = container.createDiv({ cls: "anki-card-back" });
    backSection.createEl("small", { text: "back", cls: "anki-card-label" });
    const backContent = backSection.createDiv({ cls: "anki-card-content" });
    const backComponent = new Component();
    ctx.addChild(backComponent);
    await MarkdownRenderer.render(plugin.app, back, backContent, ctx.sourcePath, backComponent);

    // Double-click to open in edit mode at the card's location
    container.addEventListener("dblclick", async () => {
      try {
        const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return;
        const sectionInfo = ctx.getSectionInfo(el);
        if (!sectionInfo) return;
        await plugin.app.workspace.getLeaf(false).openFile(view.file, {
          active: true,
          state: { mode: "source" },
        });
        requestAnimationFrame(() => {
          const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
          if (editor) editor.setCursor(sectionInfo.lineStart, 0);
        });
      } catch (err) {
        console.error("Failed to open card in edit mode:", err);
      }
    });
  });
}

function parseCardBlock(source: string): { front: string; back: string } {
  const frontMatch = source.match(/\[front\]\n?([\s\S]*?)\n?\[\/front\]/);
  const backMatch = source.match(/\[back\]\n?([\s\S]*?)\n?\[\/back\]/);

  return {
    front: frontMatch ? frontMatch[1].trim() : "",
    back: backMatch ? backMatch[1].trim() : "",
  };
}
