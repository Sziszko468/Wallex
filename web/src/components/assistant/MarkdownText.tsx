import { Fragment, useMemo } from "react";
import { parseSimpleMarkdown, type InlineLine } from "../../utils/simpleMarkdown";
import styles from "./MarkdownText.module.scss";

function Line({ line }: { line: InlineLine }) {
  return line.map((run, index) =>
    run.bold ? <strong key={index}>{run.text}</strong> : <Fragment key={index}>{run.text}</Fragment>
  );
}

/** An assistant answer: paragraphs, lists and bold, rendered as elements — never as HTML. */
export function MarkdownText({ text }: { text: string }) {
  const blocks = useMemo(() => parseSimpleMarkdown(text), [text]);

  return (
    <div className={styles.markdown}>
      {blocks.map((block, index) => {
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Line line={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                <Line line={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
