import type { ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../../hooks/useAuth";
import * as authService from "../../services/authService";
import * as biometrics from "../../services/biometrics";
import { clearSession } from "../../services/session";
import { rememberLastUser } from "../../utils/offlineStore";
import { getRefreshToken, setBiometricLockEnabled, setRefreshToken } from "../../utils/tokenStorage";
import { httpError, makeJwt, networkError } from "../helpers/tokens";
import type { User } from "../../types/auth";

jest.mock("../../services/authService");
jest.mock("../../services/biometrics");
jest.mock("../../services/pushNotifications", () => ({ unregisterCurrentDevice: jest.fn(async () => undefined) }));

const mockAuthService = jest.mocked(authService);
const mockBiometrics = jest.mocked(biometrics);

const anna: User = { id: 1, email: "anna@example.com", first_name: "Anna", last_name: "", date_joined: "2026-09-01" };

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

async function renderAuth() {
  const hook = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).not.toBe("loading"));
  return hook;
}

describe("auth state machine (app start, lock, offline, logout)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuthService.getCurrentUser.mockReset();
    mockAuthService.login.mockReset();
    mockBiometrics.authenticateWithBiometrics.mockReset();
    await clearSession();
    mockBiometrics.getBiometricCapability.mockResolvedValue({ isAvailable: true, label: "Face ID" });
    jest.spyOn(axios, "post").mockImplementation(async (url: string) =>
      url.includes("/auth/refresh/")
        ? { data: { access: makeJwt({ expiresInSeconds: 900 }), refresh: makeJwt({ expiresInSeconds: 3600 }) } }
        : { data: {} }
    );
  });

  it("no stored session → signed out, nothing requested", async () => {
    const { result } = await renderAuth();

    expect(result.current.status).toBe("signedOut");
    expect(result.current.signOutReason).toBeNull();
    expect(mockAuthService.getCurrentUser).not.toHaveBeenCalled();
  });

  it("stored session → signed in after the server confirms the user", async () => {
    await setRefreshToken(makeJwt({ expiresInSeconds: 3600 }));
    mockAuthService.getCurrentUser.mockResolvedValue(anna);

    const { result } = await renderAuth();

    expect(result.current.status).toBe("signedIn");
    expect(result.current.user).toEqual(anna);
  });

  it("session past its expiry → signed out with a reason, token deleted", async () => {
    await setRefreshToken(makeJwt({ expiresInSeconds: -1 }));

    const { result } = await renderAuth();

    expect(result.current).toMatchObject({ status: "signedOut", signOutReason: "expired" });
    expect(await getRefreshToken()).toBeNull();
  });

  it("server rejects the session → signed out as expired", async () => {
    await setRefreshToken(makeJwt({ expiresInSeconds: 3600 }));
    mockAuthService.getCurrentUser.mockRejectedValue(httpError(401));

    const { result } = await renderAuth();

    expect(result.current).toMatchObject({ status: "signedOut", signOutReason: "expired" });
  });

  describe("biometric lock", () => {
    beforeEach(async () => {
      await setRefreshToken(makeJwt({ expiresInSeconds: 3600 }));
      await setBiometricLockEnabled(true);
      mockAuthService.getCurrentUser.mockResolvedValue(anna);
    });

    it("starts locked: no token is used until the biometric check passes", async () => {
      const { result } = await renderAuth();

      expect(result.current.status).toBe("locked");
      expect(mockAuthService.getCurrentUser).not.toHaveBeenCalled();
    });

    it("cancelled biometrics keep it locked; success unlocks", async () => {
      const { result } = await renderAuth();
      mockBiometrics.authenticateWithBiometrics.mockResolvedValueOnce({ success: false, reason: "cancelled", message: null });

      await act(() => result.current.unlock());
      expect(result.current.status).toBe("locked");

      mockBiometrics.authenticateWithBiometrics.mockResolvedValueOnce({ success: true });
      await act(() => result.current.unlock());
      expect(result.current.status).toBe("signedIn");
    });

    it("biometrics removed from the device → requires the password (never silently unlocked)", async () => {
      mockBiometrics.getBiometricCapability.mockResolvedValue({ isAvailable: false, label: "Face ID", reason: "not_enrolled" });

      const { result } = await renderAuth();

      expect(result.current).toMatchObject({ status: "signedOut", signOutReason: "biometricsUnavailable" });
      expect(await getRefreshToken()).toBeNull();
    });
  });

  describe("offline start", () => {
    beforeEach(async () => {
      await setRefreshToken(makeJwt({ expiresInSeconds: 3600, userId: 1 }));
      mockAuthService.getCurrentUser.mockRejectedValue(networkError());
    });

    it("opens with the saved profile of the session's own user", async () => {
      await rememberLastUser(anna);

      const { result } = await renderAuth();

      expect(result.current.status).toBe("signedIn");
      expect(result.current.user).toEqual(anna);
    });

    it("never opens with a saved profile that belongs to a different account", async () => {
      await rememberLastUser({ ...anna, id: 2 });

      const { result } = await renderAuth();

      expect(result.current.status).toBe("unavailable");
      expect(result.current.user).toBeNull();
      expect(await getRefreshToken()).not.toBeNull(); // kept for a retry
    });
  });

  it("login then logout: session revoked on the server and every local trace removed", async () => {
    mockAuthService.login.mockResolvedValue({
      access: makeJwt({ expiresInSeconds: 900 }),
      refresh: makeJwt({ expiresInSeconds: 3600 }),
    });
    mockAuthService.getCurrentUser.mockResolvedValue(anna);
    const { result } = await renderAuth();

    await act(() => result.current.login({ email: anna.email, password: "pw" }));
    expect(result.current.status).toBe("signedIn");
    await AsyncStorage.setItem("spendly_offline:u1:outbox", "[]");

    await act(() => result.current.logout());

    expect(result.current.status).toBe("signedOut");
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining("/auth/logout/"), expect.anything(), expect.anything());
    expect(await getRefreshToken()).toBeNull();
    expect((await AsyncStorage.getAllKeys()).filter((key) => key.startsWith("spendly_offline"))).toEqual([]);
  });
});
