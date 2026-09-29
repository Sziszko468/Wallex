import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { extractErrorMessage } from "../utils/errors";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { ErrorBanner } from "../components/ErrorBanner";

export function LoginPage() {
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Set once the password was right but two-factor authentication needs a code.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  function handlePassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const outcome = await login({ email, password });
      if (outcome.status === "mfaRequired") {
        setMfaToken(outcome.mfaToken);
        setPassword("");
        return;
      }
      navigate("/dashboard", { replace: true });
    });
  }

  function handleCode(event: FormEvent) {
    event.preventDefault();
    if (!mfaToken) return;
    void run(async () => {
      await verifyMfa(mfaToken, code);
      navigate("/dashboard", { replace: true });
    });
  }

  function startOver() {
    setMfaToken(null);
    setCode("");
    setErrorMessage(null);
  }

  if (mfaToken) {
    return (
      <>
        <h2>Two-factor authentication</h2>
        <p>Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
        <ErrorBanner message={errorMessage} />
        <form onSubmit={handleCode} noValidate>
          <TextField
            label="Authentication code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
          <Button type="submit" isLoading={isSubmitting}>
            Verify
          </Button>
        </form>
        <Button type="button" variant="secondary" onClick={startOver}>
          Use a different account
        </Button>
      </>
    );
  }

  return (
    <>
      <h2>Log in</h2>
      <ErrorBanner message={errorMessage} />
      <form onSubmit={handlePassword} noValidate>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <Button type="submit" isLoading={isSubmitting}>
          Log in
        </Button>
      </form>
      <p>
        Don&apos;t have an account? <Link to="/register">Register</Link>
      </p>
    </>
  );
}
