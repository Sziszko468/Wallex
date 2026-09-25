import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../hooks/useAuth";
import { AppRoutes } from "../App";
import { setTokens } from "../utils/tokenStorage";

/** Stores tokens like a previous login did — the app then bootstraps via GET /auth/me/. */
export function signIn() {
  setTokens({ access: "access-token", refresh: "refresh-token" });
}

/** The real route tree + auth provider, starting at `path`. */
export function renderApp(path: string) {
  return {
    user: userEvent.setup(),
    ...render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    ),
  };
}

/** A single component with a router around it (for components using Link/useNavigate). */
export function renderWithRouter(ui: ReactElement) {
  return { user: userEvent.setup(), ...render(<MemoryRouter>{ui}</MemoryRouter>) };
}
