import type { ReactNode } from "react";
import { View } from "react-native";
import { APP_NAME } from "../../config/app";
import { makeStyles, space } from "../../theme";
import { BrandMark } from "../icons/BrandMark";
import { Screen } from "../Screen";
import { Text } from "../ui/Text";

interface AuthFrameProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Under the form: the other way in, the language switch. */
  footer?: ReactNode;
  /** Centre the content vertically (the lock screens have little to show). */
  centered?: boolean;
}

const useStyles = makeStyles(({ colors }) => ({
  brand: { alignItems: "center", gap: space[3], paddingTop: space[8], paddingBottom: space[8] },
  wordmark: { letterSpacing: 1.2 },
  heading: { gap: space[2], marginBottom: space[5] },
  footer: { marginTop: space[6], gap: space[5] },
  centered: { justifyContent: "center" },
  rule: { height: 1, backgroundColor: colors.divider },
}));

/**
 * The frame of every signed-out screen: the brand ring and name, a heading, the form, and what
 * sits under it. All four safe-area edges are respected — there is no navigation bar here.
 */
export function AuthFrame({ title, subtitle, children, footer, centered = false }: AuthFrameProps) {
  const styles = useStyles();
  return (
    <Screen scroll edges={["top", "left", "right", "bottom"]} contentStyle={centered ? styles.centered : undefined}>
      <View style={styles.brand}>
        <BrandMark size={56} />
        <Text variant="subheading" color="primaryInk" style={styles.wordmark}>
          {APP_NAME}
        </Text>
      </View>
      <View style={styles.heading}>
        <Text variant="title" header>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Screen>
  );
}
