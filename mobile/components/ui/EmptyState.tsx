import { View } from "react-native";
import { makeStyles, radius, space, useTheme } from "../../theme";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/iconPaths";
import { Button, type ButtonVariant } from "./Button";
import { Text } from "./Text";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: ButtonVariant;
}

const useStyles = makeStyles(({ colors }) => ({
  container: { alignItems: "center", paddingVertical: space[8], paddingHorizontal: space[4], gap: space[2] },
  tile: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[2],
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  action: { alignSelf: "stretch", marginTop: space[4] },
}));

/** What's missing, why it matters, and the one thing to do about it. Light, never a dead end. */
export function EmptyState({ icon, title, message, actionLabel, onAction, actionVariant = "primary" }: EmptyStateProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.tile}>
        <Icon name={icon} size={26} color={colors.primaryInk} />
      </View>
      <Text variant="heading" align="center" header>
        {title}
      </Text>
      {message ? (
        <Text variant="body" color="textSecondary" align="center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button title={actionLabel} onPress={onAction} variant={actionVariant} />
        </View>
      ) : null}
    </View>
  );
}
