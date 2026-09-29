import { DevicesCard } from "../components/security/DevicesCard";
import { LoginHistoryCard } from "../components/security/LoginHistoryCard";
import { PasswordCard } from "../components/security/PasswordCard";
import { TwoFactorCard } from "../components/security/TwoFactorCard";

/** Account security: signed-in devices, password, two-factor authentication, sign-in history. */
export function SecurityPage() {
  return (
    <section>
      <h1>Security</h1>
      <DevicesCard />
      <TwoFactorCard />
      <PasswordCard />
      <LoginHistoryCard />
    </section>
  );
}
