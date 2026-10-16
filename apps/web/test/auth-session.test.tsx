import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCurrentUserQuery } from "../src/services/queries/auth";

// Audit point 12 — anonymous visitors: one 200 request, no 401s and no
// refresh attempts (they used to cost 2–3 /me + /refresh pairs per load).

const USER = {
  id: "u1",
  email: "qa@example.com",
  firstName: "QA",
  lastName: "User",
  phone: null,
  role: "CUSTOMER",
};

function json(status: number, body: unknown) {
  return { ok: status < 300, status, json: async () => body };
}

function stub(routes: Record<string, () => { status: number; body: unknown }>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: string | URL, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${new URL(raw).pathname}`;
      calls.push(key);
      const route = routes[key];
      if (!route) return json(404, { error: { code: "NOT_FOUND", message: "x" } });
      const answer = route();
      return json(answer.status, answer.body);
    }),
  );
  return calls;
}

function Who() {
  const { data, isLoading, isError } = useCurrentUserQuery();
  if (isLoading) return <p>cargando</p>;
  return <p>{isError ? "error" : data ? `hola ${data.firstName}` : "visitante"}</p>;
}

function renderWho() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Who />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("current user", () => {
  it("visitor: a single GET /api/auth/session, no /me, no refresh", async () => {
    const calls = stub({
      "GET /api/auth/session": () => ({ status: 200, body: { user: null, canRefresh: false } }),
    });
    renderWho();
    expect(await screen.findByText("visitante")).toBeInTheDocument();
    expect(calls).toEqual(["GET /api/auth/session"]);
  });

  it("signed in: the user from the session", async () => {
    stub({
      "GET /api/auth/session": () => ({ status: 200, body: { user: USER, canRefresh: false } }),
    });
    renderWho();
    expect(await screen.findByText("hola QA")).toBeInTheDocument();
  });

  it("expired access token with a refresh cookie: refreshes once, then reads the session", async () => {
    let refreshed = false;
    const calls = stub({
      "GET /api/auth/session": () => ({
        status: 200,
        body: refreshed ? { user: USER, canRefresh: false } : { user: null, canRefresh: true },
      }),
      "POST /api/auth/refresh": () => {
        refreshed = true;
        return { status: 200, body: USER };
      },
    });
    renderWho();
    expect(await screen.findByText("hola QA")).toBeInTheDocument();
    expect(calls).toEqual([
      "GET /api/auth/session",
      "POST /api/auth/refresh",
      "GET /api/auth/session",
    ]);
  });

  it("a refresh that fails leaves a visitor, not an error", async () => {
    stub({
      "GET /api/auth/session": () => ({ status: 200, body: { user: null, canRefresh: true } }),
      "POST /api/auth/refresh": () => ({
        status: 401,
        body: { error: { code: "UNAUTHENTICATED", message: "x" } },
      }),
    });
    renderWho();
    expect(await screen.findByText("visitante")).toBeInTheDocument();
  });

  it("an API without /session: falls back to /me", async () => {
    const calls = stub({ "GET /api/auth/me": () => ({ status: 200, body: USER }) });
    renderWho();
    await waitFor(() => expect(screen.getByText("hola QA")).toBeInTheDocument());
    expect(calls[0]).toBe("GET /api/auth/session");
    expect(calls).toContain("GET /api/auth/me");
  });
});
