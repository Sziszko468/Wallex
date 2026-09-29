/**
 * The light Markdown the AI assistant writes — paragraphs, `- ` / `1. ` list items and
 * `**bold**` — parsed into plain data, so the UI renders it as ordinary elements (never as HTML:
 * nothing in an answer can inject markup). Anything else stays literal text; a heading line
 * (`# …`) becomes a bold paragraph. The same file exists in the web app.
 */

export interface InlineText {
  text: string;
  bold: boolean;
}

/** One line of text, split into bold and regular runs. */
export type InlineLine = InlineText[];

export type MarkdownBlock =
  | { kind: "paragraph"; lines: InlineLine[] }
  | { kind: "list"; ordered: boolean; items: InlineLine[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function parseInline(line: string): InlineLine {
  const parts = line.split("**");
  // An odd number of parts means every ** has a partner; otherwise the last one is literal.
  const unpaired = parts.length % 2 === 0;
  const runs: InlineLine = [];
  parts.forEach((part, index) => {
    const isLast = index === parts.length - 1;
    if (unpaired && isLast) {
      const previous = runs[runs.length - 1];
      const literal = `**${part}`;
      if (previous && !previous.bold) previous.text += literal;
      else runs.push({ text: literal, bold: false });
      return;
    }
    if (part) runs.push({ text: part, bold: index % 2 === 1 });
  });
  return runs;
}

export function parseSimpleMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: InlineLine[] | null = null;
  let list: { ordered: boolean; items: InlineLine[] } | null = null;

  const flush = () => {
    if (paragraph) blocks.push({ kind: "paragraph", lines: paragraph });
    if (list) blocks.push({ kind: "list", ...list });
    paragraph = null;
    list = null;
  };

  for (const rawLine of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      const ordered = numbered !== null;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(parseInline(item[1] ?? ""));
      continue;
    }
    if (list) flush();
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "paragraph", lines: [[{ text: (heading[1] ?? "").replaceAll("**", ""), bold: true }]] });
      continue;
    }
    paragraph ??= [];
    paragraph.push(parseInline(line.trim()));
  }
  flush();
  return blocks;
}
