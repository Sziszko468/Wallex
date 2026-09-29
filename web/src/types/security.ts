export type ClientPlatform = "web" | "ios" | "android" | "unknown";

/** A device the user is signed in on (GET /api/auth/sessions/). */
export interface Session {
  id: number;
  platform: ClientPlatform;
  user_agent: string;
  ip_address: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  /** The session this browser tab is using. */
  current: boolean;
}

export interface MfaStatus {
  enabled: boolean;
  enabled_at: string | null;
  recovery_codes_left: number;
}

export interface MfaSetup {
  /** Base32 key to type into an authenticator app. */
  secret: string;
  /** otpauth:// link that opens (or is scanned into) an authenticator app. */
  otpauth_uri: string;
}

export interface RecoveryCodes {
  /** Shown only once: the server keeps only hashes. */
  recovery_codes: string[];
}

export interface PasswordChangePayload {
  current_password: string;
  new_password: string;
}

export type SecurityEventCategory = "login" | "account" | "data";

export interface SecurityEvent {
  id: number;
  action: string;
  /** Human-readable, written by the server. */
  description: string;
  category: SecurityEventCategory;
  ip_address: string | null;
  user_agent: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
