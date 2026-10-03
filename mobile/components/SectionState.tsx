import type { ReactNode } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { makeStyles, space } from "../theme";
import { extractErrorMessage } from "../utils/errors";
import { Button } from "./ui/Button";
import { Notice } from "./ui/Notice";
import { Skeleton } from "./ui/Skeleton";

interface SectionStateProps {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
  /** What to show while loading: the shape of the finished content. A few quiet lines by default. */
  skeleton?: ReactNode;
}

const useStyles = makeStyles(() => ({
  loading: { gap: space[3], paddingVertical: space[2] },
  retry: { alignSelf: "flex-start" },
}));

/** The loading / error / content switch shared by every independently-loading section. */
export function SectionState({ isLoading, error, onRetry, children, skeleton }: SectionStateProps) {
  const { t } = useTranslation();
  const styles = useStyles();

  if (isLoading) {
    return (
      <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={t("common.states.loading")}>
        {skeleton ?? (
          <>
            <Skeleton width="70%" />
            <Skeleton width="100%" />
            <Skeleton width="45%" />
          </>
        )}
      </View>
    );
  }

  if (error) {
    return (
      <View>
        <Notice message={extractErrorMessage(error)} />
        <View style={styles.retry}>
          <Button title={t("common.actions.retry")} variant="secondary" icon="refresh" onPress={onRetry} />
        </View>
      </View>
    );
  }

  return <>{children}</>;
}
