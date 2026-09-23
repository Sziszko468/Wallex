import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../hooks/useAuth";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "../utils/errors";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { colors, fontSize, spacing } from "../utils/theme";

export function RegisterScreen() {
  const { register } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit() {
    setErrorMessage(null);
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await register({
        email,
        password,
        password_confirm: passwordConfirm,
        first_name: firstName,
        last_name: lastName,
      });
      // No manual navigation: register() logs the user in, and the root
      // layout's guard switches to the (app) group automatically.
    } catch (error) {
      setFieldErrors(extractFieldErrors(error));
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <Text style={styles.brand}>Spendly</Text>
      <Text style={styles.heading}>Create your account</Text>
      <ErrorBanner message={errorMessage} />

      <TextField label="First name" autoComplete="name-given" value={firstName} onChangeText={setFirstName} error={fieldErrors.first_name} />
      <TextField label="Last name" autoComplete="name-family" value={lastName} onChangeText={setLastName} error={fieldErrors.last_name} />
      <TextField
        label="Email"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
      />
      <TextField
        label="Password"
        secureTextEntry
        textContentType="newPassword"
        autoComplete="password-new"
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
      />
      <TextField
        label="Confirm password"
        secureTextEntry
        textContentType="newPassword"
        autoComplete="password-new"
        value={passwordConfirm}
        onChangeText={setPasswordConfirm}
        error={fieldErrors.password_confirm}
      />
      <Button title="Register" onPress={handleSubmit} isLoading={isSubmitting} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/login" style={styles.link}>
          Log in
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
