import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { useAuth, type SignOutReason } from "../hooks/useAuth";
import { extractErrorMessage } from "../utils/errors";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { colors, fontSize, spacing } from "../utils/theme";

const SIGN_OUT_NOTICES: Record<SignOutReason, string> = {
  expired: "Your session has expired. Please sign in again.",
  biometricsUnavailable:
    "Biometric unlock is no longer available on this device, so you were signed out for your security. Please sign in again.",
  storageError: "We couldn't read your saved session. Please sign in again.",
};

export function LoginScreen() {
  const { login, signOutReason } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      // No manual navigation: the root layout's Stack.Protected guard
      // switches to the (app) group automatically once isAuthenticated flips.
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <Text style={styles.brand}>Spendly</Text>
      <Text style={styles.heading}>Log in</Text>
      <ErrorBanner message={errorMessage ?? (signOutReason ? SIGN_OUT_NOTICES[signOutReason] : null)} />

      <TextField
        label="Email"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        label="Password"
        secureTextEntry
        textContentType="password"
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
      />
      <Button title="Log in" onPress={handleSubmit} isLoading={isSubmitting} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don&apos;t have an account? </Text>
        <Link href="/register" style={styles.link}>
          Register
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.primary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  heading: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  link: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
});
