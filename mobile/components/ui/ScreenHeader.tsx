import type { ReactNode } from "react";
import { View } from "react-native";
import { makeStyles, space } from "../../theme";
import { Text } from "./Text";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Before the title: a back button, an avatar. */
  leading?: ReactNode;
  /** After the title: icon buttons (search, filters, add). */
  trailing?: ReactNode;
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 48, paddingTop: space[3], paddingBottom: space[3] },
  titles: { flex: 1, gap: 2 },
  trailing: { flexDirection: "row", alignItems: "center", gap: space[1] },
}));

/** The title block at the top of a main screen — in the page, not in a native bar. */
export function ScreenHeader({ title, subtitle, leading, trailing }: ScreenHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {leading}
      <View style={styles.titles}>
        <Text variant="title" header numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}
