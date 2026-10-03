import { View } from "react-native";
import { fontFamilies, makeStyles } from "../../theme";
import { Text } from "./Text";

interface AvatarProps {
  firstName?: string;
  lastName?: string;
  email?: string;
  size?: number;
}

const useStyles = makeStyles(({ colors }) => ({
  circle: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
}));

/** Up to two initials: "Anna Kovács" → "AK"; with no name, the first letter of the email. */
export function initialsOf({ firstName, lastName, email }: Pick<AvatarProps, "firstName" | "lastName" | "email">): string {
  const letters = [firstName, lastName].map((part) => part?.trim().charAt(0) ?? "").join("");
  return (letters || email?.trim().charAt(0) || "·").toUpperCase();
}

/** The person's initials in a soft sage circle. Decorative: the name or email is always beside it. */
export function Avatar({ firstName, lastName, email, size = 40 }: AvatarProps) {
  const styles = useStyles();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text color="primaryInk" style={{ fontFamily: fontFamilies.bold, fontSize: size * 0.38, lineHeight: size * 0.5 }}>
        {initialsOf({ firstName, lastName, email })}
      </Text>
    </View>
  );
}
