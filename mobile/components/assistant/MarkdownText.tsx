import { Fragment, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { parseSimpleMarkdown, type InlineLine } from "../../utils/simpleMarkdown";
import { colors, spacing } from "../../utils/theme";

function Line({ line }: { line: InlineLine }) {
  return line.map((run, index) => (
    <Text key={index} style={run.bold ? styles.bold : undefined}>
      {run.text}
    </Text>
  ));
}

/** An assistant answer: paragraphs, lists and bold as nested Text — never interpreted as markup. */
export function MarkdownText({ text }: { text: string }) {
  const blocks = useMemo(() => parseSimpleMarkdown(text), [text]);

  return (
    <View style={styles.container}>
      {blocks.map((block, index) =>
        block.kind === "list" ? (
          <View key={index} style={styles.list}>
            {block.items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.item}>
                <Text style={styles.text}>{block.ordered ? `${itemIndex + 1}.` : "•"}</Text>
                <Text style={[styles.text, styles.itemText]}>
                  <Line line={item} />
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text key={index} style={styles.text}>
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

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  text: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  bold: {
    fontWeight: "700",
  },
  list: {
    gap: 2,
  },
  item: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  itemText: {
    flex: 1,
  },
});
