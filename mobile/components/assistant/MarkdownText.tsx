import { Fragment, useMemo } from "react";
import { View } from "react-native";
import { makeStyles, space } from "../../theme";
import { parseSimpleMarkdown, type InlineLine } from "../../utils/simpleMarkdown";
import { fontFamilies } from "../../theme";
import { Text } from "../ui/Text";

const useStyles = makeStyles(() => ({
  container: { gap: space[2] },
  list: { gap: 2 },
  item: { flexDirection: "row", gap: space[2] },
}));

const BOLD = { fontFamily: fontFamilies.bold } as const;

function Line({ line }: { line: InlineLine }) {
  return line.map((run, index) => (
    <Text key={index} style={run.bold ? BOLD : undefined}>
      {run.text}
    </Text>
  ));
}

/** An assistant answer: paragraphs, lists and bold as nested Text — never interpreted as markup. */
export function MarkdownText({ text }: { text: string }) {
  const styles = useStyles();
  const blocks = useMemo(() => parseSimpleMarkdown(text), [text]);

  return (
    <View style={styles.container}>
      {blocks.map((block, index) =>
        block.kind === "list" ? (
          <View key={index} style={styles.list}>
            {block.items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.item}>
                <Text variant="body">{block.ordered ? `${itemIndex + 1}.` : "•"}</Text>
                <Text variant="body" style={{ flex: 1 }}>
                  <Line line={item} />
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text key={index} variant="body">
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && "\n"}
                <Line line={line} />
              </Fragment>
            ))}
          </Text>
        )
      )}
    </View>
  );
}
