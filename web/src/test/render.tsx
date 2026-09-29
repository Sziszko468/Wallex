import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../hooks/useAuth";
import { AppRoutes } from "../App";
import { http, HttpResponse } from "msw";
import { API, server } from "./server";

/**
 * Like a browser that signed in earlier: it holds a refresh cookie, so the app's start-up
 * refresh answers with an access token and the app then loads the user (GET /auth/me/).
 */
export function signIn() {
  server.use(http.post(`${API}/auth/refresh/`, () => HttpResponse.json({ access: "access-token" })));
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
