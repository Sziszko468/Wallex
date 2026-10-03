import { Pressable, View } from "react-native";
import { layout, makeStyles, space, useTheme } from "../../theme";
import { Icon } from "../icons/Icon";
import { Text } from "./Text";

interface SectionHeaderProps {
  title: string;
  /** "View all" — takes the person one level deeper on purpose. */
  actionLabel?: string;
  onAction?: () => void;
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.minTouch },
  action: { flexDirection: "row", alignItems: "center", gap: space[1], minHeight: layout.minTouch, justifyContent: "center", paddingLeft: space[3] },
}));

/** A section's title, with an optional link to its full view on the right. */
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text variant="heading" header style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="link" accessibilityLabel={actionLabel} onPress={onAction} style={styles.action}>
          <Text variant="label" color="primaryInk">
            {actionLabel}
          </Text>
          <Icon name="chevron-right" size={16} color={colors.primaryInk} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}
