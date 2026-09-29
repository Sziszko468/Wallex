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
  const { login, verifyMfa, signOutReason } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Set once the password was right but two-factor authentication needs a code.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // No manual navigation after signing in: the root layout's Stack.Protected guard
  // switches to the (app) group automatically once isAuthenticated flips.
  async function run(step: () => Promise<void>) {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await step();
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit() {
    void run(async () => {
      const outcome = await login({ email, password });
      if (outcome.status === "mfaRequired") {
        setMfaToken(outcome.mfaToken);
        setPassword("");
      }
    });
  }

  function handleCode() {
    if (mfaToken) void run(() => verifyMfa(mfaToken, code));
  }

  if (mfaToken) {
    return (
      <Screen scroll>
        <Text style={styles.brand}>Spendly</Text>
        <Text style={styles.heading}>Two-factor authentication</Text>
        <Text style={styles.hint}>
          Enter the 6-digit code from your authenticator app, or one of your recovery codes.
        </Text>
        <ErrorBanner message={errorMessage} />
        <TextField
          label="Authentication code"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChangeText={setCode}
        />
        <Button title="Verify" onPress={handleCode} isLoading={isSubmitting} />
        <Button
          title="Use a different account"
          variant="secondary"
          onPress={() => {
            setMfaToken(null);
            setCode("");
            setErrorMessage(null);
          }}
        />
      </Screen>
    );
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
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
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
