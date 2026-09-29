import { describe, expect, it } from "vitest";
import { parseInline, parseSimpleMarkdown } from "./simpleMarkdown";

describe("parseInline", () => {
  it("splits bold runs", () => {
    expect(parseInline("You spent **€42.00** on **Food**.")).toEqual([
      { text: "You spent ", bold: false },
      { text: "€42.00", bold: true },
      { text: " on ", bold: false },
      { text: "Food", bold: true },
      { text: ".", bold: false },
    ]);
  });

  it("keeps an unpaired ** as literal text", () => {
    expect(parseInline("**Total** is 2 ** 3")).toEqual([
      { text: "Total", bold: true },
      { text: " is 2 ** 3", bold: false },
    ]);
    expect(parseInline("**")).toEqual([{ text: "**", bold: false }]);
  });
});

describe("parseSimpleMarkdown", () => {
  it("reads paragraphs, bullet and numbered lists", () => {
    const blocks = parseSimpleMarkdown(
      "Food went up.\nMostly restaurants.\n\n- Food: +€50\n* Transport: +€45\n\n1. First\n2) Second\nAfter the list"
    );

    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "list", "list", "paragraph"]);
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      lines: [[{ text: "Food went up.", bold: false }], [{ text: "Mostly restaurants.", bold: false }]],
    });
    expect(blocks[1]).toMatchObject({ kind: "list", ordered: false, items: [[{ text: "Food: +€50" }], [{ text: "Transport: +€45" }]] });
    expect(blocks[2]).toMatchObject({ kind: "list", ordered: true, items: [[{ text: "First" }], [{ text: "Second" }]] });
  });

  it("turns a heading into a bold line and leaves everything else literal", () => {
    expect(parseSimpleMarkdown("## Summary\n<b>not html</b> `code`")).toEqual([
      { kind: "paragraph", lines: [[{ text: "Summary", bold: true }]] },
      { kind: "paragraph", lines: [[{ text: "<b>not html</b> `code`", bold: false }]] },
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(parseSimpleMarkdown(" \n\r\n ")).toEqual([]);
  });
});
